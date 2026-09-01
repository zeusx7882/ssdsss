/**
 * Utilitários de segurança, formatação e verificação de compatibilidade do navegador
 */

(function (window) {
  'use strict';

  /**
   * Sanitiza strings para evitar qualquer injeção de HTML no DOM
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formata segundos no formato MM:SS ou HH:MM:SS
   */
  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Limites compartilhados com o servidor
   */
  const MAX_USER_NAME_LENGTH = 24;
  const MAX_CHAT_LENGTH = 500;

  /**
   * Valida e sanitiza o nome de usuário no cliente, com as mesmas regras do servidor.
   * Retorna null quando o nome resultante é vazio.
   */
  function sanitizeUserName(rawName) {
    if (typeof rawName !== 'string') return null;
    const clean = rawName
      .replace(/[\u0000-\u001F\u007F<>&"'`\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_USER_NAME_LENGTH);
    return clean.length > 0 ? clean : null;
  }

  /**
   * Valida e sanitiza uma mensagem de chat no cliente.
   * Retorna null quando a mensagem é vazia ou inválida.
   */
  function sanitizeChatText(rawText) {
    if (typeof rawText !== 'string') return null;
    const clean = rawText
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    return clean.length > 0 ? clean : null;
  }

  /**
   * Formata um timestamp (ms) como HH:MM para exibição no chat
   */
  function formatClockTime(timestamp) {
    const date = new Date(typeof timestamp === 'number' ? timestamp : Date.now());
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * Verifica se a Fullscreen API está disponível no navegador atual
   */
  function isFullscreenSupported() {
    if (typeof document === 'undefined') return false;
    const el = document.documentElement;
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      (el && (el.requestFullscreen || el.webkitRequestFullscreen))
    );
  }

  /**
   * Verifica se o navegador atual suporta APIs WebRTC essenciais
   */
  function isWebRTCSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!(
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        window.RTCPeerConnection
      )
    );
  }

  /**
   * Verifica suporte a compartilhamento de tela (getDisplayMedia)
   */
  function isDisplayMediaSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    );
  }

  /**
   * Configuração de áudio em alta qualidade com cancelamento de eco,
   * supressão de ruído e controle de ganho automático
   */
  const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 2
  };

  /**
   * Fallback de áudio compatível com navegadores/dispositivos que não aceitam
   * sampleRate ou channelCount, mantendo o processamento essencial de voz.
   */
  const AUDIO_CONSTRAINTS_FALLBACK = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  /**
   * Perfis progressivos de vídeo para fallbacks caso o hardware não suporte 1080p
   */
  const VIDEO_PROFILES = [
    {
      name: '1080p (Full HD)',
      constraints: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      }
    },
    {
      name: '720p (HD)',
      constraints: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 }
      }
    },
    {
      name: '480p (SD)',
      constraints: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 }
      }
    },
    {
      name: 'Fallback Básico',
      constraints: true
    }
  ];

  /**
   * Constraints para compartilhamento de tela com alta resolução e framerate
   */
  const SCREEN_SHARE_CONSTRAINTS = {
    video: {
      cursor: 'always',
      displaySurface: 'monitor',
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
      frameRate: { ideal: 30, max: 60 }
    },
    // Permite compartilhar o áudio do sistema quando o navegador oferecer a opção.
    // O microfone continua funcionando normalmente (as faixas são mixadas).
    audio: true
  };

  window.VideoConfUtils = {
    escapeHtml,
    formatDuration,
    formatClockTime,
    sanitizeUserName,
    sanitizeChatText,
    isWebRTCSupported,
    isDisplayMediaSupported,
    isFullscreenSupported,
    MAX_USER_NAME_LENGTH,
    MAX_CHAT_LENGTH,
    AUDIO_CONSTRAINTS,
    AUDIO_CONSTRAINTS_FALLBACK,
    VIDEO_PROFILES,
    SCREEN_SHARE_CONSTRAINTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
