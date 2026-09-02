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

describe('WebRTCManager - metadados de UI', () => {
  it('deve enviar estado de digitação pelo canal de metadados sem usar novos tipos WebSocket', () => {
    const manager = new WebRTCManager({ on() {} });
    const sent = [];
    manager.metaChannel = {
      readyState: 'open',
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    };

    manager.setTyping(true);
    manager.setTyping(false);

    assert.deepEqual(sent, [
      { kind: 'typing', active: true },
      { kind: 'typing', active: false }
    ]);
  });

  it('deve emitir evento remoto quando recebe indicador de digitação', () => {
    const manager = new WebRTCManager({ on() {} });
    const channel = {};
    const received = [];
    manager.pc = {
      createDataChannel() {
        return channel;
      }
    };
    manager.on('remote_typing', (active) => received.push(active));

    manager.setupMetaChannel();
    channel.onmessage({ data: JSON.stringify({ kind: 'typing', active: true }) });
    channel.onmessage({ data: JSON.stringify({ kind: 'typing', active: false }) });

    assert.deepEqual(received, [true, false]);
  });
});
