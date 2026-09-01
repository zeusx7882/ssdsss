/**
 * Controlador Principal da Interface do Usuário (UI) e Integração
 */

(function () {
  'use strict';

  // Elementos do DOM - Tela de Autenticação
  const authScreen = document.getElementById('auth-screen');
  const authForm = document.getElementById('auth-form');
  const roomInput = document.getElementById('room-input');
  const passwordInput = document.getElementById('password-input');
  const authError = document.getElementById('auth-error');
  const authErrorText = document.getElementById('auth-error-text');
  const btnJoin = document.getElementById('btn-join');

  // Elementos do DOM - Tela da Chamada
  const callScreen = document.getElementById('call-screen');
  const displayRoomName = document.getElementById('display-room-name');
  const participantCountText = document.getElementById('participant-count-text');
  const participantDot = document.getElementById('participant-dot');
  const statusPill = document.getElementById('status-pill');
  const callTimer = document.getElementById('call-timer');

  // Vídeos e Placeholders
  const remoteVideo = document.getElementById('remote-video');
  const remotePlaceholder = document.getElementById('remote-placeholder');
  const remotePlaceholderText = document.getElementById('remote-placeholder-text');
  const localVideoCard = document.getElementById('local-video-card');
  const localVideo = document.getElementById('local-video');
  const localPlaceholder = document.getElementById('local-placeholder');
  const localScreenshareBadge = document.getElementById('local-screenshare-badge');
  const localMutedBadge = document.getElementById('local-muted-badge');

  // Botões de Controle
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const btnToggleCam = document.getElementById('btn-toggle-cam');
  const btnToggleScreen = document.getElementById('btn-toggle-screen');
  const btnEndCall = document.getElementById('btn-end-call');
  const screenBtnText = document.getElementById('screen-btn-text');

  // Toasts e Modais
  const toastContainer = document.getElementById('toast-container');
  const errorModal = document.getElementById('error-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // Instâncias e Estados
  let signaling = null;
  let webrtc = null;
  let timerInterval = null;
  let callStartTime = null;

  /**
   * Exibe mensagens de notificação Toast temporárias
   */
  function showToast(message, type = 'info', durationMs = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  /**
   * Exibe o modal de erro crítico ou aviso
   */
  function showErrorModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    errorModal.style.display = 'flex';
  }

  function hideErrorModal() {
    errorModal.style.display = 'none';
  }

  /**
   * Atualiza o contador de tempo da chamada
   */
  function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      callTimer.textContent = window.VideoConfUtils.formatDuration(elapsedSeconds);
    }, 1000);
  }

  function stopCallTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    callTimer.textContent = '00:00';
  }

  /**
   * Atualiza a pílula de estado de conexão
   */
  function updateConnectionStatus(text, className) {
    statusPill.textContent = text;
    statusPill.className = `status-pill ${className}`;
  }

  /**
   * Atualiza a contagem de participantes na barra superior
   */
  function updateParticipantCount(count) {
    if (count >= 2) {
      participantCountText.textContent = '2/2 Participantes';
      participantDot.classList.add('active');
    } else {
      participantCountText.textContent = '1/2 Participante';
      participantDot.classList.remove('active');
    }
  }

  /**
   * Transição para a tela de chamada
   */
  function showCallScreen(roomName) {
    authScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    displayRoomName.textContent = roomName;
    startCallTimer();
  }

  /**
   * Transição de volta para a tela de autenticação
   */
  function showAuthScreen() {
    stopCallTimer();
    if (webrtc) {
      webrtc.cleanup();
      webrtc = null;
    }
    if (signaling) {
      signaling.leave();
      signaling = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    localPlaceholder.style.display = 'none';
    remotePlaceholder.style.display = 'flex';
    remotePlaceholderText.textContent = 'Aguardando outro participante entrar...';

    // Reseta estado dos botões
    resetControlButtons();

    callScreen.style.display = 'none';
    authScreen.style.display = 'flex';
    btnJoin.disabled = false;
  }

  function resetControlButtons() {
    btnToggleMic.classList.remove('is-off');
    btnToggleMic.setAttribute('aria-pressed', 'false');
    btnToggleMic.querySelector('.icon-mic-on').style.display = '';
    btnToggleMic.querySelector('.icon-mic-off').style.display = 'none';
    localMutedBadge.style.display = 'none';

    btnToggleCam.classList.remove('is-off');
    btnToggleCam.setAttribute('aria-pressed', 'false');
    btnToggleCam.querySelector('.icon-cam-on').style.display = '';
    btnToggleCam.querySelector('.icon-cam-off').style.display = 'none';

    btnToggleScreen.classList.remove('active');
    btnToggleScreen.setAttribute('aria-pressed', 'false');
    screenBtnText.textContent = 'Compartilhar Tela';
    localScreenshareBadge.style.display = 'none';
    localVideoCard.classList.remove('sharing-screen');
  }

  /**
   * Validação e submissão do formulário de autenticação e entrada na sala
   */
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';

    const roomVal = roomInput.value.trim() || 'sala-principal';
    const passwordVal = passwordInput.value;

    if (!passwordVal) {
      authErrorText.textContent = 'Por favor, insira a senha de acesso.';
      authError.style.display = 'flex';
      passwordInput.focus();
      return;
    }

    if (!window.VideoConfUtils.isWebRTCSupported()) {
      showErrorModal(
        'Navegador Incompatível',
        'Seu navegador não oferece suporte completo para chamadas de vídeo WebRTC. Por favor, use uma versão recente do Chrome, Firefox, Safari ou Edge.'
      );
      return;
    }

    btnJoin.disabled = true;
    btnJoin.textContent = 'Conectando...';

    try {
      signaling = new window.SignalingClient();
      webrtc = new window.WebRTCManager(signaling);

      setupAppSignalingEvents(roomVal);
      setupAppWebRTCEvents();

      await signaling.connect();
      signaling.join(roomVal, passwordVal);
    } catch (err) {
      console.error('Erro na conexão:', err);
      btnJoin.disabled = false;
      btnJoin.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        Entrar na Chamada
      `;
      authErrorText.textContent = 'Não foi possível conectar ao servidor de sinalização. Verifique se o servidor está ativo.';
      authError.style.display = 'flex';
    }
  });

  function setupAppSignalingEvents(roomName) {
    signaling.on('joined', async (msg) => {
      showCallScreen(msg.roomId || roomName);
      updateParticipantCount(msg.peerCount || 1);

      if (msg.isInitiator) {
        updateConnectionStatus('Aguardando participante', 'status-waiting');
        showToast('Você entrou na sala. Aguardando o segundo participante.', 'info');
      } else {
        updateConnectionStatus('Conectando...', 'status-waiting');
        showToast('Conectando ao participante da sala...', 'info');
      }

      // Inicializa mídia local (câmera e microfone com alta qualidade)
      try {
        await webrtc.initLocalMedia();
      } catch (mediaErr) {
        console.error('Erro ao acessar mídia:', mediaErr);
        if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'PermissionDeniedError') {
          showErrorModal(
            'Permissão Negada',
            'O acesso à câmera e ao microfone foi negado. Por favor, permita o acesso nas configurações do navegador para participar da chamada.'
          );
        } else if (mediaErr.name === 'NotFoundError' || mediaErr.name === 'DevicesNotFoundError') {
          showToast('Nenhum dispositivo de vídeo/áudio encontrado.', 'warning');
        } else {
          showToast('Aviso: Não foi possível capturar câmera em alta resolução.', 'warning');
        }
      }
    });

    signaling.on('peer_joined', (msg) => {
      updateParticipantCount(msg.peerCount || 2);
      updateConnectionStatus('Conectando ao participante...', 'status-waiting');
      showToast('O outro participante entrou na sala!', 'success');
    });

    signaling.on('peer_left', (msg) => {
      updateParticipantCount(msg.peerCount || 1);
      updateConnectionStatus('Aguardando participante', 'status-waiting');
      remoteVideo.srcObject = null;
      remotePlaceholder.style.display = 'flex';
      remotePlaceholderText.textContent = 'O outro participante saiu da chamada.';
      showToast('O outro participante desconectou.', 'warning');
    });

    signaling.on('error', (err) => {
      if (err.code === 'AUTH_FAILED') {
        btnJoin.disabled = false;
        btnJoin.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
          Entrar na Chamada
        `;
        authErrorText.textContent = 'Senha incorreta. Verifique a senha de acesso e tente novamente.';
        authError.style.display = 'flex';
        passwordInput.value = '';
        passwordInput.focus();
        showAuthScreen();
      } else if (err.code === 'ROOM_FULL') {
        showErrorModal(
          'Sala Cheia',
          'Esta sala já possui 2 participantes conectados. Esta aplicação é restrita a no máximo 2 pessoas por chamada.'
        );
        showAuthScreen();
      } else {
        showToast(err.message || 'Ocorreu um erro na conexão.', 'error');
      }
    });

    signaling.on('disconnected', () => {
      if (!signaling.isExplicitlyClosed) {
        updateConnectionStatus('Conexão perdida', 'status-reconnecting');
        showToast('Conexão com o servidor perdida.', 'error');
      }
    });
  }

  function setupAppWebRTCEvents() {
    webrtc.on('local_stream', (stream) => {
      localVideo.srcObject = stream;
    });

    webrtc.on('remote_stream', (stream) => {
      remoteVideo.srcObject = stream;
      remotePlaceholder.style.display = 'none';
      updateConnectionStatus('Conectado', 'status-connected');
    });

    webrtc.on('connection_state_change', (state) => {
      if (state === 'connected') {
        updateConnectionStatus('Conectado', 'status-connected');
        remotePlaceholder.style.display = 'none';
      } else if (state === 'connecting') {
        updateConnectionStatus('Estabelecendo conexão...', 'status-waiting');
      } else if (state === 'disconnected' || state === 'failed') {
        updateConnectionStatus('Reconectando...', 'status-reconnecting');
      }
    });

    webrtc.on('screenshare_started', (stream) => {
      btnToggleScreen.classList.add('active');
      btnToggleScreen.setAttribute('aria-pressed', 'true');
      screenBtnText.textContent = 'Parar Tela';
      localScreenshareBadge.style.display = 'inline-block';
      localVideoCard.classList.add('sharing-screen');
      localVideo.srcObject = stream;
      showToast('Compartilhamento de tela em alta resolução ativo.', 'success');
    });

    webrtc.on('screenshare_stopped', (cameraStream) => {
      btnToggleScreen.classList.remove('active');
      btnToggleScreen.setAttribute('aria-pressed', 'false');
      screenBtnText.textContent = 'Compartilhar Tela';
      localScreenshareBadge.style.display = 'none';
      localVideoCard.classList.remove('sharing-screen');
      localVideo.srcObject = cameraStream;
      showToast('Compartilhamento de tela encerrado.', 'info');
    });
  }

  // Controles de Mídia
  btnToggleMic.addEventListener('click', () => {
    if (!webrtc) return;
    const isMuted = webrtc.toggleMicrophone();

    const iconOn = btnToggleMic.querySelector('.icon-mic-on');
    const iconOff = btnToggleMic.querySelector('.icon-mic-off');

    if (isMuted) {
      btnToggleMic.classList.add('is-off');
      btnToggleMic.setAttribute('aria-pressed', 'true');
      btnToggleMic.title = 'Microfone (Desativado)';
      iconOn.style.display = 'none';
      iconOff.style.display = '';
      localMutedBadge.style.display = 'inline-block';
      showToast('Microfone silenciado.', 'info', 2000);
    } else {
      btnToggleMic.classList.remove('is-off');
      btnToggleMic.setAttribute('aria-pressed', 'false');
      btnToggleMic.title = 'Microfone (Ativado)';
      iconOn.style.display = '';
      iconOff.style.display = 'none';
      localMutedBadge.style.display = 'none';
      showToast('Microfone ativado.', 'info', 2000);
    }
  });

  btnToggleCam.addEventListener('click', () => {
    if (!webrtc) return;
    const isMuted = webrtc.toggleCamera();

    const iconOn = btnToggleCam.querySelector('.icon-cam-on');
    const iconOff = btnToggleCam.querySelector('.icon-cam-off');

    if (isMuted) {
      btnToggleCam.classList.add('is-off');
      btnToggleCam.setAttribute('aria-pressed', 'true');
      btnToggleCam.title = 'Câmera (Desativada)';
      iconOn.style.display = 'none';
      iconOff.style.display = '';
      localPlaceholder.style.display = 'flex';
      showToast('Câmera desativada.', 'info', 2000);
    } else {
      btnToggleCam.classList.remove('is-off');
      btnToggleCam.setAttribute('aria-pressed', 'false');
      btnToggleCam.title = 'Câmera (Ativada)';
      iconOn.style.display = '';
      iconOff.style.display = 'none';
      localPlaceholder.style.display = 'none';
      showToast('Câmera ativada.', 'info', 2000);
    }
  });

  btnToggleScreen.addEventListener('click', async () => {
    if (!webrtc) return;
    try {
      await webrtc.toggleScreenShare();
    } catch (err) {
      console.error('Erro ao compartilhar tela:', err);
      showToast(err.message || 'Falha ao iniciar compartilhamento de tela.', 'error');
    }
  });

  btnEndCall.addEventListener('click', () => {
    showAuthScreen();
    showToast('Você encerrou a chamada.', 'info');
  });

  modalCloseBtn.addEventListener('click', () => {
    hideErrorModal();
    showAuthScreen();
  });

})();
