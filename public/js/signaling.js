/**
 * Cliente de Sinalização WebSocket para troca de ofertas, respostas e candidatos ICE WebRTC
 */

(function (window) {
  'use strict';

  class SignalingClient {
    constructor() {
      this.ws = null;
      this.roomId = null;
      this.password = null;
      this.userName = null;
      this.peerName = null;
      this.isInitiator = false;
      this.peerId = null;
      this.listeners = new Map();
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 5;
      this.isExplicitlyClosed = false;
      this.heartbeatTimer = null;
      this.reconnectTimer = null;
    }

    /**
     * Indica se o WebSocket está aberto e pronto para envio
     */
    isOpen() {
      return !!this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }

    emit(event, data) {
      const callbacks = this.listeners.get(event) || [];
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Erro no listener do evento '${event}':`, err);
        }
      }
    }

    connect(isReconnect = false) {
      return new Promise((resolve, reject) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        let settled = false;
        try {
          this.ws = new WebSocket(wsUrl);
        } catch (err) {
          return reject(err);
        }

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.isExplicitlyClosed = false;
          this.startHeartbeat();
          this.emit('connected');
          if (isReconnect && this.roomId && this.password && this.userName) {
            this.join(this.roomId, this.password, this.userName);
            this.emit('reconnected');
          }
          settled = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            console.error('Erro ao processar mensagem recebida:', err);
          }
        };

        this.ws.onerror = (err) => {
          this.emit('error', { code: 'WS_ERROR', message: 'Erro de conexão com o servidor de sinalização.' });
          if (!settled) {
            settled = true;
            reject(err);
          }
        };

        this.ws.onclose = (event) => {
          this.stopHeartbeat();
          this.emit('disconnected', event);
          if (!settled) {
            settled = true;
            reject(new Error('O servidor de sinalização encerrou a conexão.'));
          }
          this.scheduleReconnect();
        };
      });
    }

    scheduleReconnect() {
      if (this.isExplicitlyClosed || !this.roomId || this.reconnectTimer) return;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('reconnect_failed');
        return;
      }
      const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 8000);
      this.reconnectAttempts += 1;
      this.emit('reconnecting', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(true).catch(() => this.scheduleReconnect());
      }, delay);
    }

    startHeartbeat() {
      this.stopHeartbeat();
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping' });
        }
      }, 20000);
    }

    stopHeartbeat() {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }

    handleMessage(msg) {
      switch (msg.type) {
        case 'joined':
          this.isInitiator = msg.isInitiator;
          this.peerId = msg.peerId;
          this.userName = msg.userName || this.userName;
          this.peerName = msg.peerName || null;
          this.emit('joined', msg);
          break;
        case 'peer_joined':
          this.peerName = msg.userName || null;
          this.emit('peer_joined', msg);
          break;
        case 'peer_left':
          this.peerName = null;
          this.emit('peer_left', msg);
          break;
        case 'chat':
          this.emit('chat', msg);
          break;
        case 'chat_delivered':
          this.emit('chat_delivered', msg);
          break;
        case 'offer':
          this.emit('offer', msg);
          break;
        case 'answer':
          this.emit('answer', msg);
          break;
        case 'ice_candidate':
          this.emit('ice_candidate', msg);
          break;
        case 'error':
          this.emit('error', msg);
          break;
        case 'pong':
          // Heartbeat recebido
          break;
        default:
          console.warn('Mensagem não tratada:', msg);
      }
    }

    send(data) {
      if (this.isOpen()) {
        this.ws.send(JSON.stringify(data));
        return true;
      }
      return false;
    }

    join(roomId, password, userName) {
      this.roomId = roomId;
      this.password = password;
      this.userName = userName;
      this.send({
        type: 'join',
        roomId,
        password,
        userName
      });
    }

    /**
     * Envia uma mensagem de chat para o outro participante.
     * Retorna false quando o WebSocket está indisponível.
     */
    sendChat(text, messageId) {
      return this.send({
        type: 'chat',
        text,
        messageId
      });
    }

    sendOffer(sdp) {
      this.send({
        type: 'offer',
        sdp
      });
    }

    sendAnswer(sdp) {
      this.send({
        type: 'answer',
        sdp
      });
    }

    sendCandidate(candidate) {
      this.send({
        type: 'ice_candidate',
        candidate
      });
    }

    leave() {
      this.isExplicitlyClosed = true;
      this.stopHeartbeat();
      this.send({ type: 'leave' });
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }

  window.SignalingClient = SignalingClient;
})(typeof window !== 'undefined' ? window : globalThis);
