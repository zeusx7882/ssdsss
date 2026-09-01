/**
 * Gerenciador de Salas e Sinalização WebRTC
 * Regras:
 * - Senha fixa para ingresso: '1015'
 * - Capacidade máxima estrita: exatamente 2 participantes por sala
 * - Sanitização e validação de todas as mensagens
 */

const REQUIRED_PASSWORD = '1015';
const MAX_PEERS_PER_ROOM = 2;
const MAX_ROOM_ID_LENGTH = 32;

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
   * Processa a entrada de um participante em uma sala.
   */
  handleJoin(ws, payload) {
    const { roomId: rawRoomId, password } = payload || {};

    // 1. Verificação de senha
    if (password !== this.requiredPassword) {
      this.send(ws, {
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Senha de acesso incorreta.'
      });
      return;
    }

    const roomId = this.sanitizeRoomId(rawRoomId);

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
      joinedAt: Date.now()
    };

    const isInitiator = room.size === 0;
    room.add(peerSession);
    this.peers.set(ws, peerSession);

    // Notifica o novo participante
    this.send(ws, {
      type: 'joined',
      roomId,
      peerId,
      isInitiator,
      peerCount: room.size
    });

    // Notifica o participante existente (se houver)
    for (const otherPeer of room) {
      if (otherPeer.ws !== ws) {
        this.send(otherPeer.ws, {
          type: 'peer_joined',
          peerId,
          peerCount: room.size
        });
      }
    }
  }

  /**
   * Encaminha mensagens de sinalização (offer, answer, ice_candidate) para o outro participante da sala.
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

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    // Encaminha para o outro participante da sala
    for (const otherPeer of room) {
      if (otherPeer.ws !== ws && (!otherPeer.ws.readyState || otherPeer.ws.readyState === (otherPeer.ws.OPEN || 1))) {
        this.send(otherPeer.ws, {
          ...message,
          from: session.peerId
        });
      }
    }
  }

  /**
   * Trata a saída de um participante.
   */
  handleLeave(ws) {
    const session = this.peers.get(ws);
    if (!session) return;

    const { roomId, peerId } = session;
    this.peers.delete(ws);

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(session);

      // Notifica o outro participante restante
      for (const otherPeer of room) {
        if (!otherPeer.ws.readyState || otherPeer.ws.readyState === (otherPeer.ws.OPEN || 1)) {
          this.send(otherPeer.ws, {
            type: 'peer_left',
            peerId,
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

    if (!message || typeof message.type !== 'string') {
      this.send(ws, {
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Tipo de mensagem não especificado.'
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
    } catch (err) {
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
  MAX_PEERS_PER_ROOM
};
