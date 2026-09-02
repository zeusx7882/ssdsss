/**
 * Gerenciador de Salas e Sinalização WebRTC
 * Regras:
 * - Senha de ingresso configurável via variável de ambiente ROOM_PASSWORD
 *   (padrão '1015' caso não seja definida)
 * - Capacidade máxima estrita: exatamente 2 participantes por sala
 * - Sanitização e validação de todas as mensagens
 * - Mensagens de chat nunca são persistidas nem registradas em log
 */

const REQUIRED_PASSWORD = process.env.ROOM_PASSWORD || '1015';
const MAX_PEERS_PER_ROOM = 2;
const MAX_ROOM_ID_LENGTH = 32;
const MAX_USER_NAME_LENGTH = 24;
const MAX_CHAT_LENGTH = 500;
const MAX_RAW_MESSAGE_BYTES = 64 * 1024;
const MAX_SDP_LENGTH = 32 * 1024;
const MAX_CANDIDATE_LENGTH = 2048;

const ALLOWED_MESSAGE_TYPES = new Set([
  'join',
  'offer',
  'answer',
  'ice_candidate',
  'chat',
  'leave',
  'ping'
]);

/**
 * Verifica se um WebSocket está aberto e pronto para receber dados.
 * O valor 1 corresponde a WebSocket.OPEN.
 */
function isOpen(ws) {
  return !!ws && (ws.readyState === undefined || ws.readyState === 1);
}

class RoomManager {
  constructor(password = REQUIRED_PASSWORD) {
    this.requiredPassword = password;
    // Map<roomId, Set<PeerSession>>
    this.rooms = new Map();
    // Map<ws, PeerSession>
    this.peers = new Map();
  }

  /**
   * Valida e sanitiza o identificador da sala.
   * Permite apenas caracteres alfanuméricos, hífens e sublinhados.
   */
  sanitizeRoomId(rawId) {
    if (typeof rawId !== 'string') {
      return 'sala-principal';
    }
    const clean = rawId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, MAX_ROOM_ID_LENGTH);
    return clean.length > 0 ? clean : 'sala-principal';
  }

  /**
   * Valida e sanitiza o nome de usuário exibido na interface.
   * Remove caracteres de controle e caracteres perigosos para HTML,
   * colapsa espaços e limita o tamanho máximo.
   */
  sanitizeUserName(rawName) {
    if (typeof rawName !== 'string') {
      return 'Participante';
    }
    const clean = rawName
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F<>&"'`\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_USER_NAME_LENGTH);
    return clean.length > 0 ? clean : 'Participante';
  }

  /**
   * Valida e sanitiza uma mensagem de chat.
   * Retorna null se a mensagem for inválida ou vazia.
   */
  sanitizeChatText(rawText) {
    if (typeof rawText !== 'string') {
      return null;
    }
    const clean = rawText
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    return clean.length > 0 ? clean : null;
  }

  /**
   * Valida o formato e o tamanho de uma descrição SDP recebida.
   */
  isValidSdp(sdp) {
    return (
      !!sdp &&
      typeof sdp === 'object' &&
      (sdp.type === 'offer' || sdp.type === 'answer' || sdp.type === 'pranswer' || sdp.type === 'rollback') &&
      typeof sdp.sdp === 'string' &&
      sdp.sdp.length > 0 &&
      sdp.sdp.length <= MAX_SDP_LENGTH
    );
  }

  /**
   * Valida o formato e o tamanho de um candidato ICE recebido.
   */
  isValidCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    if (typeof candidate.candidate !== 'string') return false;
    if (candidate.candidate.length > MAX_CANDIDATE_LENGTH) return false;
    if (candidate.sdpMid !== undefined && candidate.sdpMid !== null && typeof candidate.sdpMid !== 'string') {
      return false;
    }
    if (
      candidate.sdpMLineIndex !== undefined &&
      candidate.sdpMLineIndex !== null &&
      typeof candidate.sdpMLineIndex !== 'number'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Processa a entrada de um participante em uma sala.
   */
  handleJoin(ws, payload) {
    const { roomId: rawRoomId, password, userName: rawUserName } = payload || {};

    // 1. Verificação de senha
    if (typeof password !== 'string' || password !== this.requiredPassword) {
      this.send(ws, {
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Senha de acesso incorreta.'
      });
      return;
    }

    const roomId = this.sanitizeRoomId(rawRoomId);
    const userName = this.sanitizeUserName(rawUserName);

    // Se o cliente já está em uma sala, remove antes
    this.handleLeave(ws);

    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Set();
      this.rooms.set(roomId, room);
    }

    // 2. Verificação de capacidade máxima (estritamente 2 participantes)
    if (room.size >= MAX_PEERS_PER_ROOM) {
      this.send(ws, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'A sala já atingiu a capacidade máxima de 2 participantes.'
      });
      return;
    }

    const peerId = 'peer_' + Math.random().toString(36).substring(2, 9);
    const peerSession = {
      ws,
      peerId,
      roomId,
      userName,
      joinedAt: Date.now()
    };

    const isInitiator = room.size === 0;
    room.add(peerSession);
    this.peers.set(ws, peerSession);

    const otherPeer = this.getOtherPeer(peerSession);

    // Notifica o novo participante
    this.send(ws, {
      type: 'joined',
      roomId,
      peerId,
      userName,
      isInitiator,
      peerCount: room.size,
      peerName: otherPeer ? otherPeer.userName : null
    });

    // Notifica o participante existente (se houver)
    if (otherPeer) {
      this.send(otherPeer.ws, {
        type: 'peer_joined',
        peerId,
        userName,
        peerCount: room.size
      });
    }
  }

  /**
   * Retorna o outro participante da mesma sala, se existir.
   */
  getOtherPeer(session) {
    const room = this.rooms.get(session.roomId);
    if (!room) return null;
    for (const peer of room) {
      if (peer.ws !== session.ws) {
        return peer;
      }
    }
    return null;
  }

  /**
   * Encaminha mensagens de sinalização (offer, answer, ice_candidate) para o outro participante da sala.
   * Somente campos validados são repassados, evitando reflexão de dados arbitrários.
   */
  handleSignalingMessage(ws, message) {
    const session = this.peers.get(ws);
    if (!session) {
      this.send(ws, {
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'Você precisa entrar em uma sala antes de enviar sinalização.'
      });
      return;
    }

    let payload;
    if (message.type === 'offer' || message.type === 'answer') {
      if (!this.isValidSdp(message.sdp) || message.sdp.type !== message.type) {
        this.send(ws, {
          type: 'error',
          code: 'INVALID_SDP',
          message: 'Descrição de sessão (SDP) inválida ou grande demais.'
        });
        return;
      }
      payload = { type: message.type, sdp: { type: message.sdp.type, sdp: message.sdp.sdp } };
    } else {
      if (!this.isValidCandidate(message.candidate)) {
        this.send(ws, {
          type: 'error',
          code: 'INVALID_CANDIDATE',
          message: 'Candidato ICE inválido ou grande demais.'
        });
        return;
      }
      payload = {
        type: 'ice_candidate',
        candidate: {
          candidate: message.candidate.candidate,
          sdpMid: message.candidate.sdpMid ?? null,
          sdpMLineIndex: message.candidate.sdpMLineIndex ?? null,
          usernameFragment: typeof message.candidate.usernameFragment === 'string'
            ? message.candidate.usernameFragment.slice(0, 256)
            : null
        }
      };
    }

    const otherPeer = this.getOtherPeer(session);
    if (otherPeer && isOpen(otherPeer.ws)) {
      this.send(otherPeer.ws, { ...payload, from: session.peerId });
    }
  }

  /**
   * Encaminha uma mensagem de chat apenas para o outro participante da mesma sala.
   * O conteúdo nunca é persistido nem registrado em log.
   */
  handleChat(ws, message) {
    const session = this.peers.get(ws);
    if (!session) {
      this.send(ws, {
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'Você precisa entrar em uma sala antes de enviar mensagens.'
      });
      return;
    }

    const text = this.sanitizeChatText(message.text);
    if (!text) {
      this.send(ws, {
        type: 'error',
        code: 'INVALID_CHAT',
        message: 'Mensagem de chat vazia ou inválida.'
      });
      return;
    }

    const messageId = typeof message.messageId === 'string'
      ? message.messageId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
      : null;

    const otherPeer = this.getOtherPeer(session);
    if (!otherPeer || !isOpen(otherPeer.ws)) {
      this.send(ws, {
        type: 'error',
        code: 'NO_PEER',
        message: 'Nenhum outro participante na sala para receber a mensagem.',
        messageId
      });
      return;
    }

    this.send(otherPeer.ws, {
      type: 'chat',
      text,
      from: session.peerId,
      userName: session.userName,
      timestamp: Date.now()
    });

    this.send(ws, { type: 'chat_delivered', messageId });
  }

  /**
   * Trata a saída de um participante.
   */
  handleLeave(ws) {
    const session = this.peers.get(ws);
    if (!session) return;

    const { roomId, peerId, userName } = session;
    this.peers.delete(ws);

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(session);

      // Notifica o outro participante restante
      for (const otherPeer of room) {
        if (isOpen(otherPeer.ws)) {
          this.send(otherPeer.ws, {
            type: 'peer_left',
            peerId,
            userName,
            peerCount: room.size
          });
        }
      }

      // Remove a sala se estiver vazia
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  /**
   * Processa qualquer mensagem bruta recebida do WebSocket.
   */
  handleMessage(ws, data) {
    // Limite de tamanho bruto para evitar abuso de memória
    const rawSize = typeof data === 'string'
      ? Buffer.byteLength(data, 'utf8')
      : (data && typeof data.length === 'number' ? data.length : 0);

    if (rawSize > MAX_RAW_MESSAGE_BYTES) {
      this.send(ws, {
        type: 'error',
        code: 'MESSAGE_TOO_LARGE',
        message: 'Mensagem grande demais e descartada.'
      });
      return;
    }

    let message;
    try {
      message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
    } catch {
      this.send(ws, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Formato de mensagem inválido.'
      });
      return;
    }

    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      this.send(ws, {
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Tipo de mensagem não especificado.'
      });
      return;
    }

    if (!ALLOWED_MESSAGE_TYPES.has(message.type)) {
      this.send(ws, {
        type: 'error',
        code: 'UNKNOWN_TYPE',
        message: 'Tipo de mensagem desconhecido.'
      });
      return;
    }

    switch (message.type) {
      case 'join':
        this.handleJoin(ws, message);
        break;
      case 'offer':
      case 'answer':
      case 'ice_candidate':
        this.handleSignalingMessage(ws, message);
        break;
      case 'chat':
        this.handleChat(ws, message);
        break;
      case 'leave':
        this.handleLeave(ws);
        this.send(ws, { type: 'left' });
        break;
      case 'ping':
        this.send(ws, { type: 'pong' });
        break;
      default:
        this.send(ws, {
          type: 'error',
          code: 'UNKNOWN_TYPE',
          message: 'Tipo de mensagem desconhecido.'
        });
    }
  }

  send(ws, data) {
    try {
      const payload = JSON.stringify(data);
      if (typeof ws.send === 'function') {
        ws.send(payload);
      }
    } catch {
      // Ignora falhas de envio em conexões fechadas
    }
  }

  getRoomCount() {
    return this.rooms.size;
  }

  getRoomPeersCount(roomId) {
    const cleanId = this.sanitizeRoomId(roomId);
    const room = this.rooms.get(cleanId);
    return room ? room.size : 0;
  }
}

module.exports = {
  RoomManager,
  REQUIRED_PASSWORD,
  MAX_PEERS_PER_ROOM,
  MAX_USER_NAME_LENGTH,
  MAX_CHAT_LENGTH,
  MAX_RAW_MESSAGE_BYTES,
  ALLOWED_MESSAGE_TYPES
};
