const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Carrega utils.js no ambiente Node
require('../public/js/utils.js');
const { VideoConfUtils } = globalThis;

describe('VideoConfUtils - Utilitários do Cliente', () => {
  it('escapeHtml deve sanitizar caracteres perigosos para prevenir XSS', () => {
    assert.equal(
      VideoConfUtils.escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
    assert.equal(
      VideoConfUtils.escapeHtml("Hello & 'World'"),
      'Hello &amp; &#039;World&#039;'
    );
    assert.equal(VideoConfUtils.escapeHtml(null), '');
  });

  it('formatDuration deve formatar tempos em MM:SS e HH:MM:SS', () => {
    assert.equal(VideoConfUtils.formatDuration(0), '00:00');
    assert.equal(VideoConfUtils.formatDuration(9), '00:09');
    assert.equal(VideoConfUtils.formatDuration(75), '01:15');
    assert.equal(VideoConfUtils.formatDuration(3665), '01:01:05');
  });

  it('AUDIO_CONSTRAINTS deve priorizar alta qualidade com cancelamento de eco', () => {
    assert.equal(VideoConfUtils.AUDIO_CONSTRAINTS.echoCancellation, true);
    assert.equal(VideoConfUtils.AUDIO_CONSTRAINTS.noiseSuppression, true);
    assert.equal(VideoConfUtils.AUDIO_CONSTRAINTS.autoGainControl, true);
    assert.equal(VideoConfUtils.AUDIO_CONSTRAINTS.sampleRate, 48000);
  });

  it('VIDEO_PROFILES deve conter perfis de resolução progressivos', () => {
    assert.ok(Array.isArray(VideoConfUtils.VIDEO_PROFILES));
    assert.ok(VideoConfUtils.VIDEO_PROFILES.length >= 3);
    assert.equal(VideoConfUtils.VIDEO_PROFILES[0].constraints.width.ideal, 1920);
    assert.equal(VideoConfUtils.VIDEO_PROFILES[0].constraints.height.ideal, 1080);
  });

  it('SCREEN_SHARE_CONSTRAINTS deve estar configurado para alta resolução', () => {
    assert.ok(VideoConfUtils.SCREEN_SHARE_CONSTRAINTS.video);
    assert.equal(VideoConfUtils.SCREEN_SHARE_CONSTRAINTS.video.width.ideal, 1920);
    assert.equal(VideoConfUtils.SCREEN_SHARE_CONSTRAINTS.video.height.ideal, 1080);
  });

  it('AUDIO_CONSTRAINTS_FALLBACK deve manter apenas as restrições compatíveis', () => {
    const fallback = VideoConfUtils.AUDIO_CONSTRAINTS_FALLBACK;
    assert.equal(fallback.echoCancellation, true);
    assert.equal(fallback.noiseSuppression, true);
    assert.equal(fallback.autoGainControl, true);
    assert.equal(fallback.sampleRate, undefined);
    assert.equal(fallback.channelCount, undefined);
  });

  it('buildAudioConstraints deve preservar processamento e selecionar o microfone com exact', () => {
    const selected = VideoConfUtils.buildAudioConstraints('device-123');
    assert.deepEqual(selected.deviceId, { exact: 'device-123' });
    assert.equal(selected.echoCancellation, true);
    assert.equal(selected.noiseSuppression, true);
    assert.equal(VideoConfUtils.buildAudioConstraints('').deviceId, undefined);

    const fallback = VideoConfUtils.buildAudioConstraints('device-456', true);
    assert.deepEqual(fallback.deviceId, { exact: 'device-456' });
    assert.equal(fallback.sampleRate, undefined);
  });

  it('sanitizeUserName deve validar, limpar e limitar o nome de usuário', () => {
    assert.equal(VideoConfUtils.sanitizeUserName('  Maria   Silva '), 'Maria Silva');
    assert.equal(VideoConfUtils.sanitizeUserName('<b>Ana</b>'), 'bAna/b');
    assert.equal(
      VideoConfUtils.sanitizeUserName('a'.repeat(80)).length,
      VideoConfUtils.MAX_USER_NAME_LENGTH
    );
    assert.equal(VideoConfUtils.sanitizeUserName('   '), null);
    assert.equal(VideoConfUtils.sanitizeUserName(null), null);
    assert.equal(VideoConfUtils.sanitizeUserName(123), null);
  });

  it('sanitizeChatText deve limitar o tamanho e rejeitar mensagens vazias', () => {
    assert.equal(VideoConfUtils.sanitizeChatText('  olá  '), 'olá');
    assert.equal(
      VideoConfUtils.sanitizeChatText('x'.repeat(1000)).length,
      VideoConfUtils.MAX_CHAT_LENGTH
    );
    assert.equal(VideoConfUtils.sanitizeChatText('   '), null);
    assert.equal(VideoConfUtils.sanitizeChatText(undefined), null);
  });

  it('formatClockTime deve formatar o horário como HH:MM', () => {
    const date = new Date(2024, 0, 1, 9, 5, 0);
    assert.equal(VideoConfUtils.formatClockTime(date.getTime()), '09:05');
  });

  it('isFullscreenSupported deve retornar false sem document disponível', () => {
    assert.equal(VideoConfUtils.isFullscreenSupported(), false);
  });
});
