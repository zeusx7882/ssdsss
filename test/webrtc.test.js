const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../public/js/webrtc.js');
const { WebRTCManager } = globalThis;

describe('WebRTCManager - controle de microfone', () => {
  it('deve mutar também a faixa de áudio mixada do compartilhamento de tela', () => {
    const manager = new WebRTCManager({ on() {} });
    const microphone = { enabled: true };
    const mixedAudio = { enabled: true };
    manager.localStream = {
      getAudioTracks: () => [microphone]
    };
    manager.audioMixer = { mixedTrack: mixedAudio };

    assert.equal(manager.toggleMicrophone(), true);
    assert.equal(microphone.enabled, false);
    assert.equal(mixedAudio.enabled, false);

    assert.equal(manager.toggleMicrophone(), false);
    assert.equal(microphone.enabled, true);
    assert.equal(mixedAudio.enabled, true);
  });
});
