/**
 * Gerenciador WebRTC para chamada P2P com suporte a alta qualidade,
 * fallback progressivo de resolução e compartilhamento de tela com troca dinâmica de faixa.
 *
 * Pontos importantes:
 * - A negociação SDP só ocorre depois que a mídia local está pronta (mediaReady).
 * - Apenas uma MediaStream remota é usada, sem duplicação de faixas.
 * - Transceivers de áudio e vídeo são sempre criados, mesmo sem câmera disponível.
 */

(function (window) {
  'use strict';

  const {
    AUDIO_CONSTRAINTS,
    AUDIO_CONSTRAINTS_FALLBACK,
    buildAudioConstraints,
    VIDEO_PROFILES,
    SCREEN_SHARE_CONSTRAINTS
  } = window.VideoConfUtils || {};

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
      this.micAudioTrack = null;
      this.screenStream = null;
      this.remoteStream = null;
      this.audioSender = null;
      this.videoSender = null;
      this.audioMixer = null;
      this.metaChannel = null;
      this.isScreenSharing = false;
      this.isAudioMuted = false;
      this.isVideoMuted = false;
      this.hasCamera = false;
      this.pendingCandidates = [];
      this.listeners = new Map();
      this.isPolite = false;
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.iceRestartAttempts = 0;
      this.audioContext = null;
      this.levelMonitors = new Map();

      // Promessa resolvida quando getUserMedia() termina (com ou sem dispositivos).
      // Todos os caminhos de sinalização aguardam esta promessa antes de negociar.
      this.mediaReady = new Promise((resolve) => {
        this.resolveMediaReady = resolve;
      });

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
     * Define se este par é o "polite peer" (quem cede em caso de colisão de ofertas).
     * O participante que entrou depois (não iniciador) é o polite.
     */
    setPolite(isPolite) {
      this.isPolite = !!isPolite;
    }

    /**
     * Marca a mídia local como pronta, liberando a negociação.
     */
    markMediaReady() {
      if (this.resolveMediaReady) {
        this.resolveMediaReady();
        this.resolveMediaReady = null;
      }
    }

    /**
     * Tenta obter mídia local (câmera e microfone) com fallback progressivo.
     * A promessa mediaReady é sempre resolvida ao final, mesmo em caso de falha,
     * para que a sinalização não fique bloqueada indefinidamente.
     */
    async initLocalMedia() {
      try {
        const stream = await this.requestUserMedia();
        this.localStream = stream;
        this.updateLocalTrackReferences();
        this.emit('local_stream', this.localStream);
        this.startLevelMonitor('local', this.localStream);
        return this.localStream;
      } finally {
        this.markMediaReady();
      }
    }

    async requestUserMedia() {
      let lastError = null;

      const profiles = VIDEO_PROFILES || [
        { name: '1080p', constraints: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { name: '720p', constraints: { width: { ideal: 1280 }, height: { ideal: 720 } } },
        { name: 'Básico', constraints: true }
      ];

      const audioProfiles = [
        AUDIO_CONSTRAINTS || true,
        AUDIO_CONSTRAINTS_FALLBACK || true,
        true
      ];

      for (const profile of profiles) {
        for (const audio of audioProfiles) {
          try {
            return await navigator.mediaDevices.getUserMedia({
              audio,
              video: profile.constraints
            });
          } catch (err) {
            lastError = err;
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              throw err;
            }
            console.warn(`Perfil de mídia '${profile.name}' não suportado, tentando fallback...`, err.name);
          }
        }
      }

      // Sem câmera utilizável: tenta apenas áudio para manter a voz funcionando
      for (const audio of audioProfiles) {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio, video: false });
          this.isVideoMuted = true;
          return audioOnly;
        } catch (err) {
          lastError = err;
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            throw err;
          }

          // Sem microfone utilizável: mantém a chamada com câmera e informa a ausência de áudio.
          for (const profile of profiles) {
            try {
              const videoOnly = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: profile.constraints
              });
              this.isAudioMuted = true;
              return videoOnly;
            } catch (err) {
              lastError = err;
              if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                throw err;
              }
            }
          }
        }
      }

      throw lastError || new Error('Nenhum dispositivo de mídia disponível.');
    }

    updateLocalTrackReferences() {
      if (!this.localStream) return;
      const videoTracks = this.localStream.getVideoTracks();
      const audioTracks = this.localStream.getAudioTracks();
      this.cameraVideoTrack = videoTracks.length > 0 ? videoTracks[0] : null;
      this.micAudioTrack = audioTracks.length > 0 ? audioTracks[0] : null;
      this.hasCamera = !!this.cameraVideoTrack;
    }

    /**
     * Cria e configura a instância do RTCPeerConnection.
     * Sempre cria transceivers de áudio e vídeo em modo sendrecv, mesmo quando
     * a câmera ou o microfone não estão disponíveis, evitando mídia unidirecional.
     */
    async createPeerConnection() {
      if (this.pc) {
        this.closePeerConnection();
      }

      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.pendingCandidates = [];
      this.remoteStream = new MediaStream();
      this.makingOffer = false;
      this.ignoreOffer = false;

      const audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      const videoTransceiver = this.pc.addTransceiver('video', { direction: 'sendrecv' });
      this.audioSender = audioTransceiver.sender;
      this.videoSender = videoTransceiver.sender;

      // Canal de dados negociado previamente (mesmo id nos dois lados) usado apenas
      // para metadados de estado, como aviso de compartilhamento de tela.
      this.setupMetaChannel();

      if (this.micAudioTrack) {
        await this.audioSender.replaceTrack(this.micAudioTrack);
      }

      const activeVideoTrack = this.isScreenSharing && this.screenStream
        ? this.screenStream.getVideoTracks()[0]
        : this.cameraVideoTrack;

      if (activeVideoTrack) {
        await this.videoSender.replaceTrack(activeVideoTrack);
      }
      if (this.isScreenSharing && this.screenStream) {
        await this.applyScreenAudio(this.screenStream);
      }

      // Trata candidatos ICE gerados localmente
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.signaling.sendCandidate(event.candidate);
        }
      };

      // Trata recebimento de faixas remotas usando uma única MediaStream
      this.pc.ontrack = (event) => {
        const track = event.track;
        const alreadyAdded = this.remoteStream.getTracks().some((t) => t.id === track.id);
        if (!alreadyAdded) {
          this.remoteStream.addTrack(track);
        }
        if (track.kind === 'audio') {
          this.startLevelMonitor('remote', this.remoteStream);
        }
        const reportLiveTrack = () => this.emit('remote_track_live', track.kind);
        track.onunmute = reportLiveTrack;
        if (!track.muted) reportLiveTrack();

        track.onended = () => {
          try {
            this.remoteStream.removeTrack(track);
          } catch {
            // Ignora faixas já removidas
          }
        };

        this.emit('remote_stream', this.remoteStream);
      };

      // Trata mudanças de estado da conexão
      this.pc.onconnectionstatechange = () => {
        const state = this.pc.connectionState;
        this.emit('connection_state_change', state);
        if (state === 'connected') {
          this.iceRestartAttempts = 0;
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc.iceConnectionState;
        this.emit('ice_connection_state_change', state);
        if (state === 'failed') {
          this.restartIce();
        }
      };

      this.optimizeVideoQuality();
    }

    startLevelMonitor(source, stream) {
      if (!stream || stream.getAudioTracks().length === 0) return;
      this.stopLevelMonitor(source);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        this.audioContext = this.audioContext || new AudioCtx();
        this.resumeAudioAnalysis();
        const input = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        input.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        let speaking = false;
        let quietFrames = 0;
        const timer = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
          const muted = source === 'local' && this.isAudioMuted;
          if (!muted && level > 0.12) {
            quietFrames = 0;
            if (!speaking) {
              speaking = true;
              this.emit('speaking_change', { source, speaking: true, level });
            }
          } else if (speaking && ++quietFrames >= 5) {
            speaking = false;
            quietFrames = 0;
            this.emit('speaking_change', { source, speaking: false, level });
          }
          this.emit('audio_level', { source, level: muted ? 0 : level });
        }, 100);

        this.levelMonitors.set(source, { input, analyser, timer });
      } catch (err) {
        console.warn('Indicador de fala indisponível:', err);
      }
    }

    resumeAudioAnalysis() {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    }

    stopLevelMonitor(source) {
      const monitor = this.levelMonitors.get(source);
      if (!monitor) return;
      clearInterval(monitor.timer);
      monitor.input.disconnect();
      this.levelMonitors.delete(source);
      this.emit('speaking_change', { source, speaking: false, level: 0 });
    }

    /**
     * Cria um canal de dados negociado para trocar apenas metadados de estado.
     * Nenhum conteúdo sensível trafega por este canal.
     */
    setupMetaChannel() {
      try {
        this.metaChannel = this.pc.createDataChannel('meta', { negotiated: true, id: 0 });
      } catch {
        this.metaChannel = null;
        return;
      }

      this.metaChannel.onopen = () => {
        // Reenvia o estado atual ao (re)abrir o canal
        this.sendMeta({ kind: 'screenshare', active: this.isScreenSharing });
      };

      this.metaChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.kind === 'screenshare') {
            this.emit('remote_screenshare', !!data.active);
          } else if (data && data.kind === 'typing') {
            this.emit('remote_typing', !!data.active);
          } else if (data && data.kind === 'reaction' && typeof data.emoji === 'string') {
            this.emit('remote_reaction', data.emoji.slice(0, 8));
          }
        } catch {
          // Ignora metadados inválidos
        }
      };
    }

    sendMeta(data) {
      if (this.metaChannel && this.metaChannel.readyState === 'open') {
        try {
          this.metaChannel.send(JSON.stringify(data));
        } catch {
          // Ignora falhas de envio de metadados
        }
      }
    }

    setTyping(active) {
      this.sendMeta({ kind: 'typing', active: !!active });
    }

    sendReaction(emoji) {
      if (typeof emoji !== 'string' || !emoji) return;
      this.sendMeta({ kind: 'reaction', emoji: emoji.slice(0, 8) });
    }

    /**
     * Tenta uma reinicialização ICE quando a conexão falha.
     * Somente o par impolite (iniciador) reinicia, evitando colisões.
     */
    async restartIce() {
      if (!this.pc || this.isPolite) return;
      if (this.iceRestartAttempts >= 3) {
        this.emit('error', {
          code: 'ICE_FAILED',
          message: 'Não foi possível estabelecer a conexão de mídia. Uma rede restrita pode exigir um servidor TURN.'
        });
        return;
      }
      this.iceRestartAttempts += 1;
      try {
        if (typeof this.pc.restartIce === 'function') {
          this.pc.restartIce();
        }
        await this.createAndSendOffer({ iceRestart: true });
      } catch (err) {
        console.error('Falha ao reiniciar ICE:', err);
      }
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
        try {
          await this.mediaReady;
          await this.createPeerConnection();
          await this.createAndSendOffer();
        } catch (err) {
          console.error('Falha ao iniciar conexão WebRTC:', err);
          this.emit('error', { code: 'PEER_SETUP_ERROR', message: 'Não foi possível preparar a mídia da chamada.' });
        }
      });

      // Quando recebemos uma oferta SDP
      this.signaling.on('offer', async (msg) => {
        await this.mediaReady;
        await this.handleOffer(msg.sdp);
      });

      // Quando recebemos uma resposta SDP
      this.signaling.on('answer', async (msg) => {
        await this.mediaReady;
        await this.handleAnswer(msg.sdp);
      });

      // Quando recebemos um candidato ICE
      this.signaling.on('ice_candidate', async (msg) => {
        await this.mediaReady;
        await this.handleCandidate(msg.candidate);
      });

      // Quando o outro participante sai
      this.signaling.on('peer_left', () => {
        this.handlePeerLeft();
      });
    }

    async createAndSendOffer(options = {}) {
      if (!this.pc) return;
      try {
        this.makingOffer = true;
        const offer = await this.pc.createOffer(options);
        if (this.pc.signalingState !== 'stable' && !options.iceRestart) {
          return;
        }
        await this.pc.setLocalDescription(offer);
        this.signaling.sendOffer(this.pc.localDescription);
      } catch (err) {
        console.error('Erro ao criar oferta WebRTC:', err);
        this.emit('error', { code: 'OFFER_ERROR', message: 'Falha ao iniciar negociação de mídia.' });
      } finally {
        this.makingOffer = false;
      }
    }

    /**
     * Trata ofertas recebidas usando o padrão "perfect negotiation",
     * evitando condições de corrida quando os participantes entram em ordens diferentes.
     */
    async handleOffer(sdp) {
      if (!sdp) return;

      try {
        if (!this.pc) {
          await this.createPeerConnection();
        }

        const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
        this.ignoreOffer = !this.isPolite && offerCollision;
        if (this.ignoreOffer) return;

        if (this.pc.signalingState === 'have-local-offer') {
          await this.pc.setLocalDescription({ type: 'rollback' });
        }

        await this.pc.setRemoteDescription(sdp);
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
      if (!this.pc || !sdp) return;
      if (this.pc.signalingState !== 'have-local-offer') {
        return;
      }
      try {
        await this.pc.setRemoteDescription(sdp);
        await this.processPendingCandidates();
      } catch (err) {
        console.error('Erro ao definir descrição remota da resposta:', err);
      }
    }

    async handleCandidate(candidate) {
      if (!candidate) return;

      if (!this.pc || !this.pc.remoteDescription) {
        if (this.pendingCandidates.length >= 100) {
          this.pendingCandidates.shift();
        }
        this.pendingCandidates.push(candidate);
        return;
      }

      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        if (!this.ignoreOffer) {
          console.error('Erro ao adicionar candidato ICE:', err);
        }
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
      this.stopLevelMonitor('remote');
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
      if (this.audioMixer && this.audioMixer.mixedTrack) {
        this.audioMixer.mixedTrack.enabled = !this.isAudioMuted;
      }
      return this.isAudioMuted;
    }

    async replaceMicrophone(deviceId) {
      const preferred = buildAudioConstraints
        ? buildAudioConstraints(deviceId)
        : { ...(AUDIO_CONSTRAINTS || true), deviceId: { exact: deviceId } };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: preferred, video: false });
      } catch (err) {
        if (!buildAudioConstraints) throw err;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(deviceId, true),
          video: false
        });
      }

      const newTrack = stream.getAudioTracks()[0];
      if (!newTrack) throw new Error('O microfone selecionado não forneceu áudio.');
      newTrack.enabled = !this.isAudioMuted;

      if (this.audioMixer) {
        await this.restoreMicrophoneAudio();
      }
      if (this.audioSender) {
        await this.audioSender.replaceTrack(newTrack);
      }

      const oldTrack = this.micAudioTrack;
      this.micAudioTrack = newTrack;
      if (!this.localStream) this.localStream = new MediaStream();
      if (oldTrack) {
        this.localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      this.localStream.addTrack(newTrack);
      if (this.isScreenSharing && this.screenStream) {
        await this.applyScreenAudio(this.screenStream);
      }
      this.startLevelMonitor('local', this.localStream);
      this.emit('local_stream', this.localStream);
      return newTrack;
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
      }
      return this.startScreenShare();
    }

    /**
     * Retorna o RTCRtpSender de vídeo, mesmo quando ele ainda não possui faixa.
     */
    getVideoSender() {
      if (!this.pc) return null;
      if (this.videoSender && this.pc.getSenders().includes(this.videoSender)) {
        return this.videoSender;
      }
      const senders = this.pc.getSenders();
      return (
        senders.find((s) => s.track && s.track.kind === 'video') ||
        senders.find((s) => !s.track) ||
        null
      );
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
        },
        audio: true
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'AbortError') {
          // Usuário cancelou o compartilhamento no seletor do navegador
          return false;
        }
        throw err;
      }

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Nenhuma faixa de vídeo de tela capturada.');
      }

      this.screenStream = stream;
      this.isScreenSharing = true;

      // Trata quando o usuário clica no botão nativo "Parar compartilhamento" do navegador
      screenTrack.addEventListener('ended', () => {
        this.stopScreenShare().catch((err) => console.error('Erro ao encerrar compartilhamento:', err));
      });

      // Substitui a faixa de vídeo enviada para o peer
      const videoSender = this.getVideoSender();
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        this.videoSender = videoSender;
      }

      // Mixa o áudio do sistema (quando disponível) com o microfone, sem quebrá-lo
      await this.applyScreenAudio(stream);

      this.sendMeta({ kind: 'screenshare', active: true });
      this.optimizeVideoQuality();
      this.emit('screenshare_started', this.screenStream);
      return true;
    }

    /**
     * Mixa o áudio do sistema compartilhado com o microfone usando Web Audio API.
     * Se o navegador não fornecer áudio do sistema ou não suportar a API,
     * o microfone continua sendo enviado normalmente.
     */
    async applyScreenAudio(screenStream) {
      const systemAudioTrack = screenStream.getAudioTracks()[0];
      if (!systemAudioTrack || !this.micAudioTrack) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !this.audioSender) return;

      try {
        if (this.audioMixer) {
          this.audioMixer.mixedTrack.stop();
          await this.audioMixer.context.close().catch(() => {});
          this.audioMixer = null;
        }
        const context = new AudioCtx();
        const destination = context.createMediaStreamDestination();
        context.createMediaStreamSource(new MediaStream([this.micAudioTrack])).connect(destination);
        context.createMediaStreamSource(new MediaStream([systemAudioTrack])).connect(destination);

        const mixedTrack = destination.stream.getAudioTracks()[0];
        if (!mixedTrack) {
          await context.close();
          return;
        }

        mixedTrack.enabled = !this.isAudioMuted;
        await this.audioSender.replaceTrack(mixedTrack);
        this.audioMixer = { context, mixedTrack };
      } catch (err) {
        console.warn('Não foi possível mixar o áudio do sistema; mantendo apenas o microfone.', err);
      }
    }

    async restoreMicrophoneAudio() {
      if (!this.audioMixer) return;
      const { context, mixedTrack } = this.audioMixer;
      this.audioMixer = null;

      try {
        if (this.audioSender && this.micAudioTrack) {
          await this.audioSender.replaceTrack(this.micAudioTrack);
        }
        mixedTrack.stop();
        await context.close();
      } catch (err) {
        console.warn('Falha ao restaurar o áudio do microfone:', err);
      }
    }

    async stopScreenShare() {
      if (!this.isScreenSharing) return;
      this.isScreenSharing = false;

      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => track.stop());
        this.screenStream = null;
      }

      await this.restoreMicrophoneAudio();

      // Restaura a faixa da câmera original (ou remove o vídeo se não houver câmera)
      const videoSender = this.getVideoSender();
      if (videoSender) {
        try {
          await videoSender.replaceTrack(this.cameraVideoTrack || null);
        } catch (err) {
          console.error('Erro ao restaurar a faixa da câmera:', err);
        }
      }

      this.sendMeta({ kind: 'screenshare', active: false });
      this.optimizeVideoQuality();
      this.emit('screenshare_stopped', this.localStream);
    }

    closePeerConnection() {
      if (this.audioMixer) {
        this.audioMixer.mixedTrack.stop();
        this.audioMixer.context.close().catch(() => {});
        this.audioMixer = null;
      }
      if (this.pc) {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
        this.pc = null;
      }
      if (this.metaChannel) {
        this.metaChannel.onclose = null;
        this.metaChannel.onopen = null;
        this.metaChannel.onmessage = null;
        try {
          this.metaChannel.close();
        } catch {
          // Ignora canal já fechado
        }
        this.metaChannel = null;
      }
      this.audioSender = null;
      this.videoSender = null;
      this.pendingCandidates = [];
    }

    async cleanup() {
      await this.stopScreenShare();

      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }

      if (this.remoteStream) {
        this.remoteStream.getTracks().forEach((t) => t.stop());
        this.remoteStream = null;
      }

      for (const source of [...this.levelMonitors.keys()]) {
        this.stopLevelMonitor(source);
      }
      if (this.audioContext) {
        await this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }

      this.cameraVideoTrack = null;
      this.micAudioTrack = null;
      this.markMediaReady();
      this.closePeerConnection();
    }
  }

  window.WebRTCManager = WebRTCManager;
})(typeof window !== 'undefined' ? window : globalThis);
