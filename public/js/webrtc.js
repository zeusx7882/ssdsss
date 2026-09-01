/**
 * Gerenciador WebRTC para chamada P2P com suporte a alta qualidade,
 * fallback progressivo de resolução e compartilhamento de tela com troca dinâmica de faixa.
 */

(function (window) {
  'use strict';

  const { AUDIO_CONSTRAINTS, VIDEO_PROFILES, SCREEN_SHARE_CONSTRAINTS } = window.VideoConfUtils || {};

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

  class WebRTCManager {
    constructor(signalingClient) {
      this.signaling = signalingClient;
      this.pc = null;
      this.localStream = null;
      this.cameraVideoTrack = null;
      this.screenStream = null;
      this.remoteStream = null;
      this.isScreenSharing = false;
      this.isAudioMuted = false;
      this.isVideoMuted = false;
      this.pendingCandidates = [];
      this.listeners = new Map();

      this.setupSignalingListeners();
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
          console.error(`Erro no listener WebRTC '${event}':`, err);
        }
      }
    }

    /**
     * Tenta obter mídia local (câmera e microfone) com fallback progressivo
     */
    async initLocalMedia() {
      let lastError = null;

      const profiles = VIDEO_PROFILES || [
        { name: '1080p', constraints: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { name: '720p', constraints: { width: { ideal: 1280 }, height: { ideal: 720 } } },
        { name: 'Básico', constraints: true }
      ];

      for (const profile of profiles) {
        try {
          const constraints = {
            audio: AUDIO_CONSTRAINTS || true,
            video: profile.constraints
          };

          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
          const videoTracks = this.localStream.getVideoTracks();
          if (videoTracks.length > 0) {
            this.cameraVideoTrack = videoTracks[0];
          }

          this.emit('local_stream', this.localStream);
          return this.localStream;
        } catch (err) {
          lastError = err;
          // Se o erro for de permissão negada (NotAllowedError / PermissionDeniedError),
          // não adianta tentar outros perfis de resolução
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            throw err;
          }
          console.warn(`Perfil de vídeo '${profile.name}' não suportado, tentando fallback...`, err);
        }
      }

      // Se falhar em todos os perfis com vídeo, tenta apenas áudio como último recurso
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS || true,
          video: false
        });
        this.isVideoMuted = true;
        this.emit('local_stream', this.localStream);
        return this.localStream;
      } catch (err) {
        throw lastError || err;
      }
    }

    /**
     * Cria e configura a instância do RTCPeerConnection
     */
    createPeerConnection() {
      if (this.pc) {
        this.closePeerConnection();
      }

      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.pendingCandidates = [];

      // Adiciona as faixas locais ao RTCPeerConnection
      if (this.localStream) {
        for (const track of this.localStream.getTracks()) {
          this.pc.addTrack(track, this.localStream);
        }
      }

      // Trata candidatos ICE gerados localmente
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.signaling.sendCandidate(event.candidate);
        }
      };

      // Trata recebimento de stream remota
      this.pc.ontrack = (event) => {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          this.emit('remote_stream', this.remoteStream);
        }
        this.remoteStream.addTrack(event.track);
      };

      // Trata mudanças de estado da conexão
      this.pc.onconnectionstatechange = () => {
        this.emit('connection_state_change', this.pc.connectionState);
      };

      this.pc.oniceconnectionstatechange = () => {
        this.emit('ice_connection_state_change', this.pc.iceConnectionState);
      };

      this.optimizeVideoQuality();
    }

    /**
     * Configura parâmetros de bitrate nos transceivers de vídeo se suportado
     */
    async optimizeVideoQuality() {
      if (!this.pc) return;
      try {
        const senders = this.pc.getSenders();
        for (const sender of senders) {
          if (sender.track && sender.track.kind === 'video') {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            // Bitrate de alta qualidade: até 3.5 Mbps para 1080p/compartilhamento de tela
            params.encodings[0].maxBitrate = 3500000;
            params.encodings[0].priority = 'high';
            await sender.setParameters(params);
          }
        }
      } catch {
        // Ignora navegadores que não suportam setParameters
      }
    }

    setupSignalingListeners() {
      // Quando outro participante entra na sala e somos o iniciador
      this.signaling.on('peer_joined', async () => {
        this.createPeerConnection();
        await this.createAndSendOffer();
      });

      // Quando recebemos uma oferta SDP
      this.signaling.on('offer', async (msg) => {
        if (!this.pc) {
          this.createPeerConnection();
        }
        await this.handleOffer(msg.sdp);
      });

      // Quando recebemos uma resposta SDP
      this.signaling.on('answer', async (msg) => {
        await this.handleAnswer(msg.sdp);
      });

      // Quando recebemos um candidato ICE
      this.signaling.on('ice_candidate', async (msg) => {
        await this.handleCandidate(msg.candidate);
      });

      // Quando o outro participante sai
      this.signaling.on('peer_left', () => {
        this.handlePeerLeft();
      });
    }

    async createAndSendOffer() {
      try {
        const offer = await this.pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await this.pc.setLocalDescription(offer);
        this.signaling.sendOffer(this.pc.localDescription);
      } catch (err) {
        console.error('Erro ao criar oferta WebRTC:', err);
        this.emit('error', { code: 'OFFER_ERROR', message: 'Falha ao iniciar negociação de mídia.' });
      }
    }

    async handleOffer(sdp) {
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processPendingCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signaling.sendAnswer(this.pc.localDescription);
      } catch (err) {
        console.error('Erro ao processar oferta WebRTC:', err);
        this.emit('error', { code: 'ANSWER_ERROR', message: 'Falha ao responder à conexão do participante.' });
      }
    }

    async handleAnswer(sdp) {
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processPendingCandidates();
      } catch (err) {
        console.error('Erro ao definir descrição remota da resposta:', err);
      }
    }

    async handleCandidate(candidate) {
      if (!candidate) return;

      if (!this.pc || !this.pc.remoteDescription) {
        this.pendingCandidates.push(candidate);
        return;
      }

      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Erro ao adicionar candidato ICE:', err);
      }
    }

    async processPendingCandidates() {
      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Erro ao processar candidato ICE enfileirado:', err);
        }
      }
    }

    handlePeerLeft() {
      if (this.remoteStream) {
        this.remoteStream.getTracks().forEach((t) => t.stop());
        this.remoteStream = null;
      }
      this.closePeerConnection();
      this.emit('peer_left');
    }

    /**
     * Alterna o estado do microfone (mudo / ativado)
     */
    toggleMicrophone() {
      if (!this.localStream) return false;
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length === 0) return false;

      this.isAudioMuted = !this.isAudioMuted;
      for (const track of audioTracks) {
        track.enabled = !this.isAudioMuted;
      }
      return this.isAudioMuted;
    }

    /**
     * Alterna o estado da câmera (ligada / desligada)
     */
    toggleCamera() {
      if (this.cameraVideoTrack) {
        this.isVideoMuted = !this.isVideoMuted;
        this.cameraVideoTrack.enabled = !this.isVideoMuted;
        return this.isVideoMuted;
      }
      return true;
    }

    /**
     * Inicia ou para o compartilhamento de tela com troca correta de faixas via RTCRtpSender.replaceTrack
     */
    async toggleScreenShare() {
      if (this.isScreenSharing) {
        await this.stopScreenShare();
        return false;
      } else {
        await this.startScreenShare();
        return true;
      }
    }

    async startScreenShare() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Compartilhamento de tela não suportado neste navegador.');
      }

      const constraints = SCREEN_SHARE_CONSTRAINTS || {
        video: {
          cursor: 'always',
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        }
      };

      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
        const screenTrack = this.screenStream.getVideoTracks()[0];

        if (!screenTrack) {
          throw new Error('Nenhuma faixa de vídeo de tela capturada.');
        }

        // Trata quando o usuário clica no botão nativo "Parar compartilhamento" do navegador
        screenTrack.onended = () => {
          this.stopScreenShare();
        };

        // Substitui a faixa de vídeo enviada para o peer
        if (this.pc) {
          const senders = this.pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(screenTrack);
          }
        }

        this.isScreenSharing = true;
        this.emit('screenshare_started', this.screenStream);
        return true;
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          // Usuário cancelou o compartilhamento no seletor do navegador
          return false;
        }
        throw err;
      }
    }

    async stopScreenShare() {
      if (!this.isScreenSharing) return;

      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => track.stop());
        this.screenStream = null;
      }

      // Restaura a faixa da câmera original
      if (this.pc && this.cameraVideoTrack) {
        const senders = this.pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video') ||
                            senders.find((s) => s.track === null);
        if (videoSender) {
          await videoSender.replaceTrack(this.cameraVideoTrack);
        }
      }

      this.isScreenSharing = false;
      this.emit('screenshare_stopped', this.localStream);
    }

    closePeerConnection() {
      if (this.pc) {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
        this.pc = null;
      }
    }

    cleanup() {
      this.stopScreenShare();

      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }

      if (this.remoteStream) {
        this.remoteStream.getTracks().forEach((t) => t.stop());
        this.remoteStream = null;
      }

      this.closePeerConnection();
    }
  }

  window.WebRTCManager = WebRTCManager;
})(typeof window !== 'undefined' ? window : globalThis);
