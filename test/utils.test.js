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
});
