const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager, REQUIRED_PASSWORD, MAX_PEERS_PER_ROOM } = require('../src/roomManager');

// Mock simples de WebSocket para testes unitários
function createMockWs() {
  const sentMessages = [];
  return {
    OPEN: 1,
    readyState: 1,
    send(data) {
      sentMessages.push(JSON.parse(data));
    },
    getSentMessages() {
      return sentMessages;
    },
    getLastMessage() {
      return sentMessages[sentMessages.length - 1];
    },
    clearMessages() {
      sentMessages.length = 0;
    }
  };
}

describe('RoomManager - Autenticação por Senha Fixa', () => {
  it('deve aceitar entrada com a senha correta (1015)', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, JSON.stringify({
      type: 'join',
      roomId: 'sala-teste',
      password: '1015'
    }));

    const lastMsg = ws.getLastMessage();
    assert.ok(lastMsg, 'Deveria ter enviado uma mensagem');
    assert.equal(lastMsg.type, 'joined');
    assert.equal(lastMsg.roomId, 'sala-teste');
    assert.equal(lastMsg.isInitiator, true);
    assert.equal(lastMsg.peerCount, 1);
  });

  it('deve rejeitar entrada com senha incorreta e não expor a senha correta', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, JSON.stringify({
      type: 'join',
      roomId: 'sala-teste',
      password: 'senha-errada-999'
    }));

    const lastMsg = ws.getLastMessage();
    assert.ok(lastMsg);
    assert.equal(lastMsg.type, 'error');
    assert.equal(lastMsg.code, 'AUTH_FAILED');
    assert.equal(lastMsg.message, 'Senha de acesso incorreta.');
    // Garante que a senha correta não foi vazada na mensagem
    assert.ok(!JSON.stringify(lastMsg).includes(REQUIRED_PASSWORD));
    assert.equal(manager.getRoomCount(), 0);
  });

  it('deve rejeitar entrada sem senha', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, JSON.stringify({
      type: 'join',
      roomId: 'sala-teste'
    }));

    const lastMsg = ws.getLastMessage();
    assert.equal(lastMsg.type, 'error');
    assert.equal(lastMsg.code, 'AUTH_FAILED');
  });
});

describe('RoomManager - Capacidade e Limite de 2 Participantes', () => {
  it('deve permitir exatamente 2 participantes na mesma sala', () => {
    const manager = new RoomManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    // 1º Participante
    manager.handleMessage(ws1, JSON.stringify({
      type: 'join',
      roomId: 'sala-dupla',
      password: '1015'
    }));
    assert.equal(ws1.getLastMessage().type, 'joined');
    assert.equal(ws1.getLastMessage().isInitiator, true);
    assert.equal(ws1.getLastMessage().peerCount, 1);

    // 2º Participante
    manager.handleMessage(ws2, JSON.stringify({
      type: 'join',
      roomId: 'sala-dupla',
      password: '1015'
    }));
    assert.equal(ws2.getLastMessage().type, 'joined');
    assert.equal(ws2.getLastMessage().isInitiator, false);
    assert.equal(ws2.getLastMessage().peerCount, 2);

    // O 1º participante deve receber notificação 'peer_joined'
    const ws1Last = ws1.getLastMessage();
    assert.equal(ws1Last.type, 'peer_joined');
    assert.equal(ws1Last.peerCount, 2);
    assert.equal(manager.getRoomPeersCount('sala-dupla'), 2);
  });

  it('deve rejeitar estritamente o 3º participante com ROOM_FULL', () => {
    const manager = new RoomManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const ws3 = createMockWs();

    manager.handleMessage(ws1, JSON.stringify({ type: 'join', roomId: 'sala-lotada', password: '1015' }));
    manager.handleMessage(ws2, JSON.stringify({ type: 'join', roomId: 'sala-lotada', password: '1015' }));

    // 3º Participante tenta entrar
    manager.handleMessage(ws3, JSON.stringify({ type: 'join', roomId: 'sala-lotada', password: '1015' }));

    const ws3Last = ws3.getLastMessage();
    assert.equal(ws3Last.type, 'error');
    assert.equal(ws3Last.code, 'ROOM_FULL');
    assert.ok(ws3Last.message.includes('2 participantes'));

    // A contagem da sala deve permanecer em 2
    assert.equal(manager.getRoomPeersCount('sala-lotada'), 2);
  });

  it('deve permitir que o 3º participante crie ou entre em outra sala', () => {
    const manager = new RoomManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const ws3 = createMockWs();

    manager.handleMessage(ws1, JSON.stringify({ type: 'join', roomId: 'sala-1', password: '1015' }));
    manager.handleMessage(ws2, JSON.stringify({ type: 'join', roomId: 'sala-1', password: '1015' }));
    manager.handleMessage(ws3, JSON.stringify({ type: 'join', roomId: 'sala-2', password: '1015' }));

    assert.equal(ws3.getLastMessage().type, 'joined');
    assert.equal(ws3.getLastMessage().roomId, 'sala-2');
    assert.equal(manager.getRoomPeersCount('sala-1'), 2);
    assert.equal(manager.getRoomPeersCount('sala-2'), 1);
  });
});

describe('RoomManager - Encaminhamento de Sinalização WebRTC', () => {
  it('deve encaminhar offer, answer e ice_candidate entre os 2 participantes', () => {
    const manager = new RoomManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.handleMessage(ws1, JSON.stringify({ type: 'join', roomId: 'conferencia', password: '1015' }));
    manager.handleMessage(ws2, JSON.stringify({ type: 'join', roomId: 'conferencia', password: '1015' }));

    ws1.clearMessages();
    ws2.clearMessages();

    // 1. Peer 1 envia offer
    manager.handleMessage(ws1, JSON.stringify({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'v=0\r\no=...' }
    }));

    const ws2OfferMsg = ws2.getLastMessage();
    assert.equal(ws2OfferMsg.type, 'offer');
    assert.equal(ws2OfferMsg.sdp.type, 'offer');
    assert.ok(ws2OfferMsg.from);

    // 2. Peer 2 envia answer
    manager.handleMessage(ws2, JSON.stringify({
      type: 'answer',
      sdp: { type: 'answer', sdp: 'v=0\r\no=...' }
    }));

    const ws1AnswerMsg = ws1.getLastMessage();
    assert.equal(ws1AnswerMsg.type, 'answer');
    assert.equal(ws1AnswerMsg.sdp.type, 'answer');

    // 3. Peer 1 envia ICE Candidate
    manager.handleMessage(ws1, JSON.stringify({
      type: 'ice_candidate',
      candidate: { candidate: 'candidate:1 1 UDP ...', sdpMid: '0', sdpMLineIndex: 0 }
    }));

    const ws2CandidateMsg = ws2.getLastMessage();
    assert.equal(ws2CandidateMsg.type, 'ice_candidate');
    assert.equal(ws2CandidateMsg.candidate.sdpMid, '0');
  });

  it('deve retornar erro se cliente tentar sinalizar sem estar em sala', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, JSON.stringify({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'teste' }
    }));

    const lastMsg = ws.getLastMessage();
    assert.equal(lastMsg.type, 'error');
    assert.equal(lastMsg.code, 'NOT_IN_ROOM');
  });
});

describe('RoomManager - Saída e Limpeza de Sala', () => {
  it('deve notificar outro participante e limpar sala vazia ao desconectar', () => {
    const manager = new RoomManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.handleMessage(ws1, JSON.stringify({ type: 'join', roomId: 'limpeza', password: '1015' }));
    manager.handleMessage(ws2, JSON.stringify({ type: 'join', roomId: 'limpeza', password: '1015' }));

    ws1.clearMessages();

    // Peer 2 sai
    manager.handleLeave(ws2);

    const ws1Last = ws1.getLastMessage();
    assert.equal(ws1Last.type, 'peer_left');
    assert.equal(ws1Last.peerCount, 1);
    assert.equal(manager.getRoomPeersCount('limpeza'), 1);

    // Peer 1 sai
    manager.handleLeave(ws1);
    assert.equal(manager.getRoomCount(), 0);
  });
});

describe('RoomManager - Validação de Entrada e Tratamento de Erros', () => {
  it('deve tratar mensagens com JSON inválido sem travar', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, 'ISSO_NAO_E_JSON');

    const lastMsg = ws.getLastMessage();
    assert.equal(lastMsg.type, 'error');
    assert.equal(lastMsg.code, 'INVALID_JSON');
  });

  it('deve responder ping com pong para manter conexão ativa', () => {
    const manager = new RoomManager();
    const ws = createMockWs();

    manager.handleMessage(ws, JSON.stringify({ type: 'ping' }));

    const lastMsg = ws.getLastMessage();
    assert.equal(lastMsg.type, 'pong');
  });

  it('deve sanitizar nome de sala com caracteres especiais', () => {
    const manager = new RoomManager();
    assert.equal(manager.sanitizeRoomId('  SALA#123@!  '), 'sala123');
    assert.equal(manager.sanitizeRoomId(''), 'sala-principal');
    assert.equal(manager.sanitizeRoomId(null), 'sala-principal');
  });
});
