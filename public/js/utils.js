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
    audio: false
  };

  window.VideoConfUtils = {
    escapeHtml,
    formatDuration,
    isWebRTCSupported,
    isDisplayMediaSupported,
    AUDIO_CONSTRAINTS,
    VIDEO_PROFILES,
    SCREEN_SHARE_CONSTRAINTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
