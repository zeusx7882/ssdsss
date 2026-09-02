/**
 * Controlador Principal da Interface do Usuário (UI) e Integração
 */

(function () {
  'use strict';

  const Utils = window.VideoConfUtils;

  // Elementos do DOM - Tela de Autenticação
  const authScreen = document.getElementById('auth-screen');
  const authForm = document.getElementById('auth-form');
  const usernameInput = document.getElementById('username-input');
  const roomInput = document.getElementById('room-input');
  const passwordInput = document.getElementById('password-input');
  const authError = document.getElementById('auth-error');
  const authErrorText = document.getElementById('auth-error-text');
  const btnJoin = document.getElementById('btn-join');
  const btnJoinOriginalHtml = btnJoin.innerHTML;

  // Elementos do DOM - Tela da Chamada
  const callScreen = document.getElementById('call-screen');
  const displayRoomName = document.getElementById('display-room-name');
  const participantCountText = document.getElementById('participant-count-text');
  const participantDot = document.getElementById('participant-dot');
  const statusPill = document.getElementById('status-pill');
  const callTimer = document.getElementById('call-timer');

  // Vídeos e Placeholders
  const remoteVideoCard = document.getElementById('remote-video-card');
  const remoteVideo = document.getElementById('remote-video');
  const remotePlaceholder = document.getElementById('remote-placeholder');
  const remotePlaceholderText = document.getElementById('remote-placeholder-text');
  const remoteNameLabel = document.getElementById('remote-name-label');
  const remoteScreenshareBadge = document.getElementById('remote-screenshare-badge');
  const videoGrid = document.getElementById('video-grid');
  const localVideoCard = document.getElementById('local-video-card');
  const localVideo = document.getElementById('local-video');
  const localPlaceholder = document.getElementById('local-placeholder');
  const localNameLabel = document.getElementById('local-name-label');
  const localScreenshareBadge = document.getElementById('local-screenshare-badge');
  const localMutedBadge = document.getElementById('local-muted-badge');
  const btnPipDrag = document.getElementById('btn-pip-drag');
  const btnPipResize = document.getElementById('btn-pip-resize');
  const btnPipToggleScreen = document.getElementById('btn-pip-toggle-screen');
  const pipSizeText = document.getElementById('pip-size-text');
  const pipScreenText = document.getElementById('pip-screen-text');

  // Botões de Controle
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const btnToggleCam = document.getElementById('btn-toggle-cam');
  const btnToggleScreen = document.getElementById('btn-toggle-screen');
  const btnToggleChat = document.getElementById('btn-toggle-chat');
  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const btnEndCall = document.getElementById('btn-end-call');
  const screenBtnText = document.getElementById('screen-btn-text');
  const btnEnableAudio = document.getElementById('btn-enable-audio');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const fullscreenBtnText = document.getElementById('fullscreen-btn-text');

  // Chat
  const chatPanel = document.getElementById('chat-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatEmpty = document.getElementById('chat-empty');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const chatUnreadBadge = document.getElementById('chat-unread-badge');
  const chatTyping = document.getElementById('chat-typing');
  const chatTypingText = document.getElementById('chat-typing-text');

  // Configurações de dispositivos
  const settingsPanel = document.getElementById('settings-panel');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnRefreshDevices = document.getElementById('btn-refresh-devices');
  const audioInputSelect = document.getElementById('audio-input-select');
  const audioOutputSelect = document.getElementById('audio-output-select');
  const audioOutputHelp = document.getElementById('audio-output-help');
  const microphoneStatus = document.getElementById('microphone-status');
  const audioMeterFill = document.getElementById('audio-meter-fill');

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
  let localUserName = 'Você';
  let remoteUserName = null;
  let hasRemotePeer = false;
  let unreadMessages = 0;
  let chatMessageCounter = 0;
  const pendingChatMessages = new Map();
  const MAX_CHAT_HISTORY = 200;
  let nativeVideoFullscreen = false;
  let isSwitchingMicrophone = false;
  let typingStopTimer = null;
  let isLocalTyping = false;
  const PIP_STORAGE_KEY = 'videoconf.localPreview';
  const PIP_EDGE_SNAP = 28;
  const PIP_PADDING = 12;
  let pipState = loadPipState();
  let pipDrag = null;

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
    modalCloseBtn.focus();
  }

  function hideErrorModal() {
    errorModal.style.display = 'none';
  }

  function resetJoinButton() {
    btnJoin.disabled = false;
    btnJoin.innerHTML = btnJoinOriginalHtml;
  }

  function showAuthError(message) {
    authErrorText.textContent = message;
    authError.style.display = 'flex';
  }

  /**
   * Atualiza o contador de tempo da chamada
   */
  function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      callTimer.textContent = Utils.formatDuration(elapsedSeconds);
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
   * Atualiza os nomes exibidos nos cards de vídeo (sempre via textContent)
   */
  function setLocalName(name) {
    localUserName = name;
    localNameLabel.textContent = `${name} (você)`;
  }

  function setRemoteName(name) {
    remoteUserName = name || null;
    remoteNameLabel.textContent = name || 'Participante Remoto';
  }

  /**
   * Transição para a tela de chamada
   */
  function showCallScreen(roomName) {
    authScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    displayRoomName.textContent = roomName;
    startCallTimer();
    requestAnimationFrame(() => {
      applyPipSize();
      applyPipPosition();
    });
  }

  /**
   * Transição de volta para a tela de autenticação
   */
  function showAuthScreen() {
    stopCallTimer();
    exitFullscreen();

    if (webrtc) {
      Promise.resolve(webrtc.cleanup()).catch(() => {});
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

    hasRemotePeer = false;
    setRemoteName(null);
    setRemoteScreenshare(false);
    closeChat();
    closeSettings();
    clearChat();
    chatMessageCounter = 0;
    localVideoCard.classList.remove('is-speaking');
    remoteVideoCard.classList.remove('is-speaking');
    audioMeterFill.style.width = '0%';
    hideEnableAudioButton();
    setRemoteTyping(false);
    setLocalTyping(false, true);

    // Reseta estado dos botões
    resetControlButtons();

    callScreen.style.display = 'none';
    authScreen.style.display = 'flex';
    resetJoinButton();
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
    updateScreenShareButtons(false);
  }

  function loadPipState() {
    try {
      const saved = JSON.parse(localStorage.getItem(PIP_STORAGE_KEY) || '{}');
      return {
        x: Number.isFinite(saved.x) ? saved.x : null,
        y: Number.isFinite(saved.y) ? saved.y : null,
        size: saved.size === 'medium' ? 'medium' : 'small'
      };
    } catch {
      return { x: null, y: null, size: 'small' };
    }
  }

  function savePipState() {
    try {
      localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(pipState));
    } catch {
      // Armazenamento local indisponível; a chamada continua normalmente.
    }
  }

  function getPipBounds(width = localVideoCard.offsetWidth, height = localVideoCard.offsetHeight) {
    const gridRect = videoGrid.getBoundingClientRect();
    return {
      maxX: Math.max(PIP_PADDING, gridRect.width - width - PIP_PADDING),
      maxY: Math.max(PIP_PADDING, gridRect.height - height - PIP_PADDING)
    };
  }

  function clampPipPosition(x, y) {
    const bounds = getPipBounds();
    return {
      x: Math.min(Math.max(PIP_PADDING, x), bounds.maxX),
      y: Math.min(Math.max(PIP_PADDING, y), bounds.maxY)
    };
  }

  function setPipPosition(x, y, persist = true) {
    const next = clampPipPosition(x, y);
    pipState.x = next.x;
    pipState.y = next.y;
    localVideoCard.style.left = `${next.x}px`;
    localVideoCard.style.top = `${next.y}px`;
    localVideoCard.style.right = 'auto';
    localVideoCard.style.bottom = 'auto';
    if (persist) savePipState();
  }

  function snapPipPosition() {
    if (!Number.isFinite(pipState.x) || !Number.isFinite(pipState.y)) return;
    const bounds = getPipBounds();
    let { x, y } = pipState;
    if (x - PIP_PADDING <= PIP_EDGE_SNAP) x = PIP_PADDING;
    if (bounds.maxX - x <= PIP_EDGE_SNAP) x = bounds.maxX;
    if (y - PIP_PADDING <= PIP_EDGE_SNAP) y = PIP_PADDING;
    if (bounds.maxY - y <= PIP_EDGE_SNAP) y = bounds.maxY;
    localVideoCard.classList.add('is-snapping');
    setPipPosition(x, y);
    window.setTimeout(() => localVideoCard.classList.remove('is-snapping'), 260);
  }

  function applyPipPosition() {
    const gridRect = videoGrid.getBoundingClientRect();
    if (!gridRect.width || !gridRect.height) return;
    if (Number.isFinite(pipState.x) && Number.isFinite(pipState.y)) {
      setPipPosition(pipState.x, pipState.y, false);
    }
  }

  function applyPipSize() {
    localVideoCard.classList.toggle('pip-medium', pipState.size === 'medium');
    const nextLabel = pipState.size === 'medium' ? 'Reduzir preview local' : 'Aumentar preview local';
    btnPipResize.setAttribute('aria-label', nextLabel);
    btnPipResize.title = nextLabel;
    pipSizeText.textContent = pipState.size === 'medium' ? 'Pequeno' : 'Médio';
    applyPipPosition();
  }

  function togglePipSize() {
    pipState.size = pipState.size === 'medium' ? 'small' : 'medium';
    applyPipSize();
    savePipState();
  }

  function beginPipDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const interactive = event.target.closest('button, input, select, textarea, a');
    if (interactive && interactive !== btnPipDrag) return;

    const cardRect = localVideoCard.getBoundingClientRect();
    const gridRect = videoGrid.getBoundingClientRect();
    pipDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - cardRect.left,
      offsetY: event.clientY - cardRect.top,
      gridLeft: gridRect.left,
      gridTop: gridRect.top
    };
    localVideoCard.classList.add('is-dragging');
    localVideoCard.setPointerCapture(event.pointerId);
    setPipPosition(cardRect.left - gridRect.left, cardRect.top - gridRect.top, false);
    event.preventDefault();
  }

  function movePip(event) {
    if (!pipDrag || event.pointerId !== pipDrag.pointerId) return;
    const x = event.clientX - pipDrag.gridLeft - pipDrag.offsetX;
    const y = event.clientY - pipDrag.gridTop - pipDrag.offsetY;
    setPipPosition(x, y, false);
    event.preventDefault();
  }

  function endPipDrag(event) {
    if (!pipDrag || event.pointerId !== pipDrag.pointerId) return;
    pipDrag = null;
    localVideoCard.classList.remove('is-dragging');
    try {
      localVideoCard.releasePointerCapture(event.pointerId);
    } catch {
      // O ponteiro pode já ter sido liberado pelo navegador.
    }
    snapPipPosition();
  }

  function updateScreenShareButtons(isSharing) {
    btnToggleScreen.classList.toggle('active', isSharing);
    btnToggleScreen.setAttribute('aria-pressed', isSharing ? 'true' : 'false');
    btnToggleScreen.setAttribute('aria-label', isSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela inteira');
    btnToggleScreen.title = isSharing ? 'Parar seu compartilhamento de tela' : 'Compartilhar sua tela';
    screenBtnText.textContent = isSharing ? 'Parar Tela' : 'Compartilhar Tela';

    btnPipToggleScreen.classList.toggle('active', isSharing);
    btnPipToggleScreen.setAttribute('aria-pressed', isSharing ? 'true' : 'false');
    btnPipToggleScreen.setAttribute('aria-label', isSharing ? 'Parar compartilhamento de tela' : 'Compartilhar sua tela');
    btnPipToggleScreen.title = isSharing ? 'Parar compartilhamento' : 'Compartilhar sua tela';
    pipScreenText.textContent = isSharing ? 'Parar compartilhamento' : 'Compartilhar tela';
  }

  function setScreenButtonsDisabled(disabled) {
    btnToggleScreen.disabled = disabled;
    btnPipToggleScreen.disabled = disabled;
  }

  /* ==========================================================================
     Reprodução do áudio/vídeo remoto (com tratamento de bloqueio de autoplay)
     ========================================================================== */

  function showEnableAudioButton() {
    btnEnableAudio.style.display = 'inline-flex';
  }

  function hideEnableAudioButton() {
    btnEnableAudio.style.display = 'none';
  }

  async function playRemoteVideo() {
    if (webrtc) webrtc.resumeAudioAnalysis();
    remoteVideo.muted = false;
    remoteVideo.volume = 1;
    try {
      await remoteVideo.play();
      hideEnableAudioButton();
    } catch (err) {
      console.warn('Reprodução automática bloqueada pelo navegador:', err);
      showEnableAudioButton();
      showToast('O navegador bloqueou o áudio automático. Clique em "Ativar áudio".', 'warning', 6000);
    }
  }

  btnEnableAudio.addEventListener('click', async () => {
    remoteVideo.muted = false;
    remoteVideo.volume = 1;
    try {
      await remoteVideo.play();
      hideEnableAudioButton();
      showToast('Áudio da chamada ativado.', 'success', 2500);
    } catch (err) {
      console.error('Falha ao ativar o áudio remoto:', err);
      showToast('Não foi possível ativar o áudio. Verifique o volume da aba e do dispositivo.', 'error');
    }
  });

  /* ==========================================================================
     Tela Cheia (Fullscreen API)
     ========================================================================== */

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function requestFullscreenOn(element) {
    if (element.requestFullscreen) return element.requestFullscreen();
    if (element.webkitRequestFullscreen) return element.webkitRequestFullscreen();
    if (element.webkitEnterFullscreen) return element.webkitEnterFullscreen();
    return Promise.reject(new Error('Fullscreen API indisponível.'));
  }

  function exitFullscreen() {
    if (nativeVideoFullscreen && remoteVideo.webkitExitFullscreen) {
      remoteVideo.webkitExitFullscreen();
      return;
    }
    if (!getFullscreenElement()) return;
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  function updateFullscreenButtonState() {
    const isFullscreen = !!getFullscreenElement() || nativeVideoFullscreen;
    btnFullscreen.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
    btnFullscreen.setAttribute(
      'aria-label',
      isFullscreen ? 'Sair da tela cheia' : 'Abrir vídeo remoto em tela cheia'
    );
    btnFullscreen.title = isFullscreen ? 'Sair da tela cheia' : 'Abrir em tela cheia';
    fullscreenBtnText.textContent = isFullscreen ? 'Sair' : 'Tela cheia';
    btnFullscreen.classList.toggle('active', isFullscreen);
    btnFullscreen.querySelector('.icon-fullscreen-on').style.display = isFullscreen ? 'none' : '';
    btnFullscreen.querySelector('.icon-fullscreen-off').style.display = isFullscreen ? '' : 'none';
  }

  btnFullscreen.addEventListener('click', async () => {
    if (getFullscreenElement() || nativeVideoFullscreen) {
      exitFullscreen();
      return;
    }

    if (!Utils.isFullscreenSupported()) {
      showToast('Tela cheia indisponível neste navegador ou bloqueada pelas permissões.', 'warning', 6000);
      return;
    }

    if (!remoteVideo.srcObject) {
      showToast('Ainda não há vídeo remoto para exibir em tela cheia.', 'info');
      return;
    }

    try {
      await requestFullscreenOn(remoteVideoCard);
    } catch (err) {
      console.warn('Falha ao entrar em tela cheia no card, tentando no vídeo:', err);
      try {
        await requestFullscreenOn(remoteVideo);
      } catch (videoErr) {
        console.error('Tela cheia indisponível:', videoErr);
        showToast('Não foi possível abrir em tela cheia neste navegador.', 'error');
      }
    }
  });

  document.addEventListener('fullscreenchange', updateFullscreenButtonState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtonState);
  remoteVideo.addEventListener('webkitbeginfullscreen', () => {
    nativeVideoFullscreen = true;
    updateFullscreenButtonState();
  });
  remoteVideo.addEventListener('webkitendfullscreen', () => {
    nativeVideoFullscreen = false;
    updateFullscreenButtonState();
  });

  /* ==========================================================================
     Destaque do compartilhamento de tela remoto
     ========================================================================== */

  function setRemoteScreenshare(isSharing) {
    remoteScreenshareBadge.style.display = isSharing ? 'inline-block' : 'none';
    remoteVideoCard.classList.toggle('receiving-screenshare', isSharing);
    if (isSharing) {
      const who = remoteUserName || 'O outro participante';
      remoteScreenshareBadge.textContent = 'Compartilhando tela';
      showToast(`${who} está compartilhando a tela. Use "Tela cheia" para ampliar.`, 'info', 6000);
    }
  }

  /* ==========================================================================
     Chat
     ========================================================================== */

  function isChatOpen() {
    return !chatPanel.hidden;
  }

  function openChat() {
    closeSettings();
    chatPanel.hidden = false;
    btnToggleChat.setAttribute('aria-pressed', 'true');
    btnToggleChat.setAttribute('aria-expanded', 'true');
    btnToggleChat.setAttribute('aria-label', 'Fechar chat');
    btnToggleChat.classList.add('active');
    unreadMessages = 0;
    updateUnreadBadge();
    chatInput.focus();
    scrollChatToBottom();
  }

  function closeChat() {
    chatPanel.hidden = true;
    btnToggleChat.setAttribute('aria-pressed', 'false');
    btnToggleChat.setAttribute('aria-expanded', 'false');
    btnToggleChat.setAttribute('aria-label', 'Abrir chat');
    btnToggleChat.classList.remove('active');
  }

  function openSettings() {
    closeChat();
    settingsPanel.hidden = false;
    btnToggleSettings.setAttribute('aria-pressed', 'true');
    btnToggleSettings.setAttribute('aria-expanded', 'true');
    btnToggleSettings.classList.add('active');
    refreshAudioDevices();
  }

  function closeSettings() {
    settingsPanel.hidden = true;
    btnToggleSettings.setAttribute('aria-pressed', 'false');
    btnToggleSettings.setAttribute('aria-expanded', 'false');
    btnToggleSettings.classList.remove('active');
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      audioInputSelect.replaceChildren(new Option('Listagem indisponível', ''));
      audioOutputSelect.replaceChildren(new Option('Seleção indisponível', ''));
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const selectedInput = webrtc && webrtc.micAudioTrack
        ? webrtc.micAudioTrack.getSettings().deviceId
        : audioInputSelect.value;
      const selectedOutput = audioOutputSelect.value;
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      const outputs = devices.filter((device) => device.kind === 'audiooutput');

      audioInputSelect.replaceChildren(...inputs.map((device, index) =>
        new Option(device.label || `Microfone ${index + 1}`, device.deviceId)
      ));
      if (selectedInput) audioInputSelect.value = selectedInput;

      if (typeof remoteVideo.setSinkId === 'function') {
        audioOutputSelect.disabled = false;
        audioOutputSelect.replaceChildren(
          new Option('Padrão do sistema', ''),
          ...outputs.map((device, index) =>
            new Option(device.label || `Saída ${index + 1}`, device.deviceId)
          )
        );
        if (selectedOutput) audioOutputSelect.value = selectedOutput;
        audioOutputHelp.textContent = 'A saída é aplicada ao áudio do participante remoto.';
      } else {
        audioOutputSelect.disabled = true;
        audioOutputSelect.replaceChildren(new Option('Controlada pelo navegador/sistema', ''));
        audioOutputHelp.textContent = 'Este navegador não permite escolher a saída de áudio pela página.';
      }
    } catch (err) {
      console.warn('Não foi possível listar dispositivos:', err);
      showToast('Não foi possível atualizar a lista de dispositivos.', 'warning');
    }
  }

  btnToggleSettings.addEventListener('click', () => {
    if (settingsPanel.hidden) openSettings();
    else closeSettings();
  });
  btnCloseSettings.addEventListener('click', closeSettings);
  btnRefreshDevices.addEventListener('click', refreshAudioDevices);

  audioInputSelect.addEventListener('change', async () => {
    if (!webrtc || !audioInputSelect.value) return;
    isSwitchingMicrophone = true;
    audioInputSelect.disabled = true;
    microphoneStatus.textContent = 'Trocando microfone...';
    try {
      await webrtc.replaceMicrophone(audioInputSelect.value);
      microphoneStatus.textContent = 'Microfone alterado sem encerrar a chamada.';
      showToast('Microfone alterado.', 'success');
    } catch (err) {
      console.error('Falha ao trocar microfone:', err);
      microphoneStatus.textContent = 'Não foi possível usar este microfone.';
      showToast('Falha ao trocar o microfone. Verifique a permissão.', 'error');
      await refreshAudioDevices();
    } finally {
      isSwitchingMicrophone = false;
      audioInputSelect.disabled = false;
    }
  });

  audioOutputSelect.addEventListener('change', async () => {
    if (typeof remoteVideo.setSinkId !== 'function') return;
    try {
      await remoteVideo.setSinkId(audioOutputSelect.value);
      showToast('Saída de áudio alterada.', 'success');
    } catch (err) {
      console.error('Falha ao trocar saída de áudio:', err);
      showToast('O navegador não autorizou esta saída de áudio.', 'error');
    }
  });

  function updateUnreadBadge() {
    if (unreadMessages > 0) {
      chatUnreadBadge.textContent = unreadMessages > 9 ? '9+' : String(unreadMessages);
      chatUnreadBadge.style.display = 'inline-block';
    } else {
      chatUnreadBadge.style.display = 'none';
    }
  }

  function clearChat() {
    chatMessages.querySelectorAll('.chat-message').forEach((el) => el.remove());
    pendingChatMessages.clear();
    chatEmpty.style.display = '';
    unreadMessages = 0;
    updateUnreadBadge();
  }

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setRemoteTyping(isTyping) {
    chatTyping.hidden = !isTyping;
    if (isTyping) {
      chatTypingText.textContent = `${remoteUserName || 'Participante'} está digitando`;
      scrollChatToBottom();
    }
  }

  function setLocalTyping(isTyping, force = false) {
    if (!force && isTyping === isLocalTyping) return;
    isLocalTyping = isTyping;
    if (webrtc) webrtc.setTyping(isTyping);
  }

  function scheduleTypingStop() {
    window.clearTimeout(typingStopTimer);
    typingStopTimer = window.setTimeout(() => setLocalTyping(false), 1800);
  }

  function trimChatHistory() {
    const items = chatMessages.querySelectorAll('.chat-message');
    if (items.length > MAX_CHAT_HISTORY) {
      for (let i = 0; i < items.length - MAX_CHAT_HISTORY; i += 1) {
        items[i].remove();
      }
    }
  }

  /**
   * Cria um elemento de mensagem de chat usando apenas textContent (sem innerHTML),
   * evitando qualquer possibilidade de injeção de HTML.
   */
  function appendChatMessage({ author, text, timestamp, own, system, status }) {
    chatEmpty.style.display = 'none';

    const item = document.createElement('div');
    item.className = 'chat-message';
    if (own) item.classList.add('chat-own');
    if (system) item.classList.add('chat-system');

    if (!system) {
      const meta = document.createElement('div');
      meta.className = 'chat-meta';

      const authorEl = document.createElement('span');
      authorEl.className = 'chat-author';
      authorEl.textContent = author;

      const timeEl = document.createElement('time');
      timeEl.className = 'chat-time';
      const date = new Date(timestamp);
      timeEl.dateTime = date.toISOString();
      timeEl.textContent = Utils.formatClockTime(timestamp);

      meta.appendChild(authorEl);
      meta.appendChild(timeEl);
      item.appendChild(meta);
    }

    const textEl = document.createElement('p');
    textEl.className = 'chat-text';
    textEl.textContent = text;
    item.appendChild(textEl);

    if (status) {
      const statusEl = document.createElement('span');
      statusEl.className = 'chat-status';
      statusEl.textContent = status;
      item.appendChild(statusEl);
    }

    chatMessages.appendChild(item);
    trimChatHistory();
    scrollChatToBottom();
    return item;
  }

  function setMessageStatus(item, status, failed) {
    if (!item) return;
    let statusEl = item.querySelector('.chat-status');
    if (!statusEl) {
      statusEl = document.createElement('span');
      statusEl.className = 'chat-status';
      item.appendChild(statusEl);
    }
    statusEl.textContent = status;
    statusEl.classList.toggle('chat-status-failed', !!failed);
  }

  function addSystemChatMessage(text) {
    appendChatMessage({ text, system: true, timestamp: Date.now() });
  }

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setLocalTyping(false);
    window.clearTimeout(typingStopTimer);

    const text = Utils.sanitizeChatText(chatInput.value);
    if (!text) {
      chatInput.value = '';
      return;
    }

    if (!signaling || !signaling.isOpen()) {
      showToast('Chat indisponível: sem conexão com o servidor.', 'error');
      return;
    }

    if (!hasRemotePeer) {
      showToast('Nenhum outro participante na sala para receber a mensagem.', 'warning');
      return;
    }

    chatMessageCounter += 1;
    const messageId = `m${chatMessageCounter}`;

    const item = appendChatMessage({
      author: localUserName,
      text,
      timestamp: Date.now(),
      own: true,
      status: 'Enviando...'
    });
    pendingChatMessages.set(messageId, item);

    const sent = signaling.sendChat(text, messageId);
    if (!sent) {
      pendingChatMessages.delete(messageId);
      setMessageStatus(item, 'Falha no envio', true);
      showToast('Não foi possível enviar a mensagem.', 'error');
    }

    chatInput.value = '';
    chatInput.focus();
  });

  chatInput.addEventListener('input', () => {
    if (!hasRemotePeer || !Utils.sanitizeChatText(chatInput.value)) {
      setLocalTyping(false);
      return;
    }
    setLocalTyping(true);
    scheduleTypingStop();
  });

  btnToggleChat.addEventListener('click', () => {
    if (isChatOpen()) {
      closeChat();
      btnToggleChat.focus();
    } else {
      openChat();
    }
  });

  btnCloseChat.addEventListener('click', () => {
    closeChat();
    btnToggleChat.focus();
  });

  chatPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeChat();
      btnToggleChat.focus();
    }
  });

  /* ==========================================================================
     Autenticação e entrada na sala
     ========================================================================== */

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';

    const userNameVal = Utils.sanitizeUserName(usernameInput.value);
    if (!userNameVal) {
      showAuthError(`Informe um nome de usuário válido (1 a ${Utils.MAX_USER_NAME_LENGTH} caracteres).`);
      usernameInput.focus();
      return;
    }

    const roomVal = roomInput.value.trim() || 'sala-principal';
    const passwordVal = passwordInput.value;

    if (!passwordVal) {
      showAuthError('Por favor, insira a senha de acesso.');
      passwordInput.focus();
      return;
    }

    if (!Utils.isWebRTCSupported()) {
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
      try {
        await webrtc.initLocalMedia();
        if (!webrtc.hasCamera) {
          localPlaceholder.style.display = 'flex';
          showToast('Câmera indisponível. A chamada continuará somente com áudio.', 'warning');
        }
        await refreshAudioDevices();
      } catch (mediaErr) {
        console.error('Erro ao acessar mídia:', mediaErr);
        if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'PermissionDeniedError') {
          showToast('Permissão de câmera/microfone negada. A chamada continuará sem mídia local.', 'error', 7000);
        } else if (mediaErr.name === 'NotFoundError' || mediaErr.name === 'DevicesNotFoundError') {
          showToast('Nenhum dispositivo de vídeo/áudio encontrado.', 'warning');
        } else if (mediaErr.name === 'NotReadableError') {
          showToast('A câmera ou o microfone já estão sendo usados por outro aplicativo.', 'error');
        } else {
          showToast('Não foi possível iniciar a mídia local. Verifique os dispositivos.', 'warning');
        }
      }
      signaling.join(roomVal, passwordVal, userNameVal);
    } catch (err) {
      console.error('Erro na conexão:', err);
      resetJoinButton();
      showAuthError('Não foi possível conectar ao servidor de sinalização. Verifique se o servidor está ativo e se o endereço usa HTTPS/WSS.');
    }
  });

  function setupAppSignalingEvents(roomName) {
    signaling.on('joined', async (msg) => {
      setLocalName(msg.userName || 'Você');
      showCallScreen(msg.roomId || roomName);
      updateParticipantCount(msg.peerCount || 1);

      // O participante que entrou depois é o "polite peer" da negociação
      webrtc.setPolite(!msg.isInitiator);

      if (msg.peerName) {
        hasRemotePeer = true;
        setRemoteName(msg.peerName);
      }

      if (msg.isInitiator) {
        updateConnectionStatus('Aguardando participante', 'status-waiting');
        showToast('Você entrou na sala. Aguardando o segundo participante.', 'info');
      } else {
        updateConnectionStatus('Conectando...', 'status-waiting');
        showToast('Conectando ao participante da sala...', 'info');
      }

    });

    signaling.on('peer_joined', (msg) => {
      hasRemotePeer = true;
      setRemoteName(msg.userName);
      updateParticipantCount(msg.peerCount || 2);
      updateConnectionStatus('Conectando ao participante...', 'status-waiting');
      showToast(`${msg.userName || 'O outro participante'} entrou na sala!`, 'success');
      addSystemChatMessage(`${msg.userName || 'O outro participante'} entrou na sala.`);
    });

    signaling.on('peer_left', (msg) => {
      const who = msg.userName || remoteUserName || 'O outro participante';
      hasRemotePeer = false;
      updateParticipantCount(msg.peerCount || 1);
      updateConnectionStatus('Aguardando participante', 'status-waiting');
      remoteVideo.srcObject = null;
      remotePlaceholder.style.display = 'flex';
      remotePlaceholderText.textContent = `${who} saiu da chamada.`;
      setRemoteScreenshare(false);
      setRemoteTyping(false);
      setRemoteName(null);
      hideEnableAudioButton();
      exitFullscreen();
      showToast(`${who} desconectou.`, 'warning');
      addSystemChatMessage(`${who} saiu da chamada.`);
    });

    signaling.on('chat', (msg) => {
      const text = Utils.sanitizeChatText(msg.text);
      if (!text) return;

      appendChatMessage({
        author: Utils.sanitizeUserName(msg.userName) || 'Participante',
        text,
        timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
        own: false,
        status: 'Recebida'
      });

      if (!isChatOpen()) {
        unreadMessages += 1;
        updateUnreadBadge();
      }
    });

    signaling.on('chat_delivered', (msg) => {
      const item = pendingChatMessages.get(msg.messageId);
      if (item) {
        pendingChatMessages.delete(msg.messageId);
        setMessageStatus(item, 'Enviada');
      }
    });

    signaling.on('error', (err) => {
      if (err.code === 'AUTH_FAILED') {
        showAuthScreen();
        showAuthError('Senha incorreta. Verifique a senha de acesso e tente novamente.');
        passwordInput.value = '';
        passwordInput.focus();
      } else if (err.code === 'ROOM_FULL') {
        showErrorModal(
          'Sala Cheia',
          'Esta sala já possui 2 participantes conectados. Esta aplicação é restrita a no máximo 2 pessoas por chamada.'
        );
        showAuthScreen();
      } else if (err.code === 'NO_PEER' || err.code === 'INVALID_CHAT') {
        const item = err.messageId ? pendingChatMessages.get(err.messageId) : null;
        if (item) {
          pendingChatMessages.delete(err.messageId);
          setMessageStatus(item, 'Não entregue', true);
        }
        showToast(err.message || 'Não foi possível entregar a mensagem.', 'warning');
      } else {
        showToast(err.message || 'Ocorreu um erro na conexão.', 'error');
      }
    });

    signaling.on('disconnected', () => {
      if (!signaling || !signaling.isExplicitlyClosed) {
        if (webrtc) webrtc.closePeerConnection();
        remoteVideo.srcObject = null;
        remotePlaceholder.style.display = 'flex';
        remotePlaceholderText.textContent = 'Reconectando a sinalização...';
        updateConnectionStatus('Conexão perdida', 'status-reconnecting');
        showToast('Conexão com o servidor perdida. Tentando reconectar...', 'warning', 5000);
      }
    });

    signaling.on('reconnecting', ({ attempt, maxAttempts }) => {
      updateConnectionStatus(`Reconectando ${attempt}/${maxAttempts}`, 'status-reconnecting');
    });

    signaling.on('reconnected', () => {
      updateConnectionStatus('Sinalização restaurada', 'status-waiting');
      showToast('Conexão com o servidor restaurada.', 'success');
    });

    signaling.on('reconnect_failed', () => {
      updateConnectionStatus('Servidor indisponível', 'status-reconnecting');
      showToast('Não foi possível reconectar. Atualize a página para tentar novamente.', 'error', 8000);
    });
  }

  function setupAppWebRTCEvents() {
    webrtc.on('local_stream', (stream) => {
      if (webrtc.isScreenSharing) return;
      localVideo.srcObject = stream;
      localVideo.play().catch(() => {});
    });

    webrtc.on('remote_stream', (stream) => {
      if (remoteVideo.srcObject !== stream) {
        remoteVideo.srcObject = stream;
      }
      playRemoteVideo();
    });

    webrtc.on('remote_track_live', (kind) => {
      if (kind === 'video') {
        remotePlaceholder.style.display = 'none';
      } else if (!webrtc.remoteStream || webrtc.remoteStream.getVideoTracks().length === 0) {
        remotePlaceholder.style.display = 'flex';
        remotePlaceholderText.textContent = 'Áudio conectado. A câmera remota está indisponível.';
      }
    });

    webrtc.on('remote_screenshare', (isSharing) => {
      setRemoteScreenshare(isSharing);
    });

    webrtc.on('remote_typing', (isTyping) => {
      setRemoteTyping(isTyping);
    });

    webrtc.on('connection_state_change', (state) => {
      if (state === 'connected') {
        updateConnectionStatus('Conectado', 'status-connected');
        if (!webrtc.remoteStream || webrtc.remoteStream.getTracks().length === 0) {
          remotePlaceholder.style.display = 'flex';
          remotePlaceholderText.textContent = 'Conectado, aguardando mídia remota...';
        }
      } else if (state === 'connecting' || state === 'new') {
        updateConnectionStatus('Estabelecendo conexão...', 'status-waiting');
      } else if (state === 'disconnected') {
        updateConnectionStatus('Reconectando...', 'status-reconnecting');
      } else if (state === 'failed') {
        updateConnectionStatus('Falha na conexão', 'status-reconnecting');
      } else if (state === 'closed') {
        updateConnectionStatus('Chamada encerrada', 'status-reconnecting');
      }
    });

    webrtc.on('speaking_change', ({ source, speaking }) => {
      const card = source === 'local' ? localVideoCard : remoteVideoCard;
      card.classList.toggle('is-speaking', speaking);
      const label = source === 'local' ? localNameLabel : remoteNameLabel;
      label.setAttribute('aria-label', speaking
        ? `${label.textContent}, falando agora`
        : label.textContent);
    });

    webrtc.on('audio_level', ({ source, level }) => {
      if (source !== 'local') return;
      audioMeterFill.style.width = `${Math.round(level * 100)}%`;
      if (isSwitchingMicrophone) return;
      microphoneStatus.textContent = level > 0.12
        ? 'Microfone funcionando — você está falando.'
        : 'Fale para testar o nível do microfone.';
    });

    webrtc.on('error', (err) => {
      showToast(err.message || 'Erro na conexão de mídia.', 'error', 7000);
    });

    webrtc.on('screenshare_started', (stream) => {
      updateScreenShareButtons(true);
      localScreenshareBadge.style.display = 'inline-block';
      localVideoCard.classList.add('sharing-screen');
      localVideo.srcObject = stream;
      localPlaceholder.style.display = 'none';
      localVideo.play().catch(() => {});
      showToast('Compartilhamento de tela em alta resolução ativo.', 'success');
    });

    webrtc.on('screenshare_stopped', (cameraStream) => {
      updateScreenShareButtons(false);
      localScreenshareBadge.style.display = 'none';
      localVideoCard.classList.remove('sharing-screen');
      localVideo.srcObject = cameraStream || null;
      localPlaceholder.style.display = webrtc && webrtc.hasCamera ? 'none' : 'flex';
      localVideo.play().catch(() => {});
      showToast('Compartilhamento de tela encerrado. Câmera restaurada.', 'info');
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
      btnToggleMic.setAttribute('aria-label', 'Ativar microfone');
      btnToggleMic.title = 'Microfone (Desativado)';
      iconOn.style.display = 'none';
      iconOff.style.display = '';
      localMutedBadge.style.display = 'inline-block';
      showToast('Microfone silenciado.', 'info', 2000);
    } else {
      btnToggleMic.classList.remove('is-off');
      btnToggleMic.setAttribute('aria-pressed', 'false');
      btnToggleMic.setAttribute('aria-label', 'Mutar microfone');
      btnToggleMic.title = 'Microfone (Ativado)';
      iconOn.style.display = '';
      iconOff.style.display = 'none';
      localMutedBadge.style.display = 'none';
      showToast('Microfone ativado.', 'info', 2000);
    }
  });

  btnToggleCam.addEventListener('click', () => {
    if (!webrtc) return;
    if (!webrtc.hasCamera) {
      showToast('Nenhuma câmera disponível neste dispositivo.', 'warning');
      return;
    }
    const isMuted = webrtc.toggleCamera();

    const iconOn = btnToggleCam.querySelector('.icon-cam-on');
    const iconOff = btnToggleCam.querySelector('.icon-cam-off');

    if (isMuted) {
      btnToggleCam.classList.add('is-off');
      btnToggleCam.setAttribute('aria-pressed', 'true');
      btnToggleCam.setAttribute('aria-label', 'Ligar câmera');
      btnToggleCam.title = 'Câmera (Desativada)';
      iconOn.style.display = 'none';
      iconOff.style.display = '';
      localPlaceholder.style.display = webrtc.isScreenSharing ? 'none' : 'flex';
      showToast('Câmera desativada.', 'info', 2000);
    } else {
      btnToggleCam.classList.remove('is-off');
      btnToggleCam.setAttribute('aria-pressed', 'false');
      btnToggleCam.setAttribute('aria-label', 'Desligar câmera');
      btnToggleCam.title = 'Câmera (Ativada)';
      iconOn.style.display = '';
      iconOff.style.display = 'none';
      localPlaceholder.style.display = 'none';
      showToast('Câmera ativada.', 'info', 2000);
    }
  });

  async function toggleScreenShareFromControl() {
    if (!webrtc) return;
    if (!Utils.isDisplayMediaSupported()) {
      showToast('Compartilhamento de tela não suportado neste navegador.', 'error');
      return;
    }
    setScreenButtonsDisabled(true);
    try {
      await webrtc.toggleScreenShare();
    } catch (err) {
      console.error('Erro ao compartilhar tela:', err);
      showToast(err.message || 'Falha ao iniciar compartilhamento de tela.', 'error');
    } finally {
      setScreenButtonsDisabled(false);
    }
  }

  btnToggleScreen.addEventListener('click', toggleScreenShareFromControl);
  btnPipToggleScreen.addEventListener('click', toggleScreenShareFromControl);
  btnPipResize.addEventListener('click', togglePipSize);
  localVideoCard.addEventListener('pointerdown', beginPipDrag);
  localVideoCard.addEventListener('pointermove', movePip);
  localVideoCard.addEventListener('pointerup', endPipDrag);
  localVideoCard.addEventListener('pointercancel', endPipDrag);
  btnPipDrag.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 32 : 12;
    const keys = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    const delta = keys[event.key];
    if (!delta) return;
    const cardRect = localVideoCard.getBoundingClientRect();
    const gridRect = videoGrid.getBoundingClientRect();
    const currentX = Number.isFinite(pipState.x) ? pipState.x : cardRect.left - gridRect.left;
    const currentY = Number.isFinite(pipState.y) ? pipState.y : cardRect.top - gridRect.top;
    setPipPosition(currentX + delta[0], currentY + delta[1]);
    event.preventDefault();
  });
  window.addEventListener('resize', () => {
    applyPipSize();
    applyPipPosition();
  });

  btnEndCall.addEventListener('click', () => {
    showAuthScreen();
    showToast('Você encerrou a chamada.', 'info');
  });

  modalCloseBtn.addEventListener('click', () => {
    hideErrorModal();
    showAuthScreen();
  });

  window.addEventListener('beforeunload', () => {
    if (signaling) {
      signaling.leave();
    }
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (webrtc) refreshAudioDevices();
    });
  }

  updateFullscreenButtonState();
  applyPipSize();
  updateScreenShareButtons(false);
})();
