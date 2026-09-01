const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');
const { startServer } = require('../src/server');

describe('Servidor HTTP e Sinalização WebSocket Integrada', () => {
  let serverInstance;
  let baseUrl;
  let wsUrl;
  const testPort = 3456;

  before(async () => {
    const { server } = await startServer(testPort, '127.0.0.1');
    serverInstance = server;
    baseUrl = `http://127.0.0.1:${testPort}`;
    wsUrl = `ws://127.0.0.1:${testPort}/ws`;
  });

  after(async () => {
    return new Promise((resolve) => {
      serverInstance.close(() => resolve());
    });
  });

  it('GET / deve retornar index.html com cabeçalhos de segurança', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=UTF-8');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy'));

    const html = await res.text();
    assert.ok(html.includes('Videoconferência P2P'));
    assert.ok(html.includes('id="auth-screen"'));
    assert.ok(html.includes('id="call-screen"'));
  });

  it('GET /health deve retornar status 200 e json de saúde', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(typeof body.uptime === 'number');
  });

  it('GET /css/style.css e /js/app.js devem servir os arquivos estáticos corretamente', async () => {
    const resCss = await fetch(`${baseUrl}/css/style.css`);
    assert.equal(resCss.status, 200);
    assert.equal(resCss.headers.get('content-type'), 'text/css; charset=UTF-8');

    const resJs = await fetch(`${baseUrl}/js/app.js`);
    assert.equal(resJs.status, 200);
    assert.equal(resJs.headers.get('content-type'), 'application/javascript; charset=UTF-8');
  });

  it('GET com tentativa de Directory Traversal deve ser bloqueado', async () => {
    const res = await fetch(`${baseUrl}/../../etc/passwd`);
    assert.ok(res.status === 403 || res.status === 404);
  });

  it('GET /arquivo-inexistente deve retornar 404', async () => {
    const res = await fetch(`${baseUrl}/inexistente.xyz`);
    assert.equal(res.status, 404);
  });

  it('deve realizar fluxo completo de sinalização WebSocket com 2 clientes e rejeição de 3º', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);
    const ws3 = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((res) => ws1.on('open', res)),
      new Promise((res) => ws2.on('open', res)),
      new Promise((res) => ws3.on('open', res))
    ]);

    // 1. Cliente 1 entra
    const ws1Messages = [];
    ws1.on('message', (data) => ws1Messages.push(JSON.parse(data)));
    ws1.send(JSON.stringify({ type: 'join', roomId: 'sala-teste-ws', password: '1015' }));

    await new Promise((res) => setTimeout(res, 50));
    assert.equal(ws1Messages[0].type, 'joined');
    assert.equal(ws1Messages[0].isInitiator, true);

    // 2. Cliente 2 entra
    const ws2Messages = [];
    ws2.on('message', (data) => ws2Messages.push(JSON.parse(data)));
    ws2.send(JSON.stringify({ type: 'join', roomId: 'sala-teste-ws', password: '1015' }));

    await new Promise((res) => setTimeout(res, 50));
    assert.equal(ws2Messages[0].type, 'joined');
    assert.equal(ws2Messages[0].isInitiator, false);

    // Cliente 1 deve ter recebido 'peer_joined'
    assert.equal(ws1Messages[1].type, 'peer_joined');

    // 3. Cliente 3 tenta entrar na mesma sala e é rejeitado com ROOM_FULL
    const ws3Messages = [];
    ws3.on('message', (data) => ws3Messages.push(JSON.parse(data)));
    ws3.send(JSON.stringify({ type: 'join', roomId: 'sala-teste-ws', password: '1015' }));

    await new Promise((res) => setTimeout(res, 50));
    assert.equal(ws3Messages[0].type, 'error');
    assert.equal(ws3Messages[0].code, 'ROOM_FULL');

    // 4. Teste de troca de sinalização (offer -> answer)
    ws1.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'sdp-teste' } }));
    await new Promise((res) => setTimeout(res, 50));

    const offerMsg = ws2Messages.find((m) => m.type === 'offer');
    assert.ok(offerMsg, 'Cliente 2 deveria ter recebido o offer');
    assert.equal(offerMsg.sdp.sdp, 'sdp-teste');

    // 5. Cliente 1 fecha conexão -> Cliente 2 recebe 'peer_left'
    ws1.close();
    await new Promise((res) => setTimeout(res, 50));

    const leftMsg = ws2Messages.find((m) => m.type === 'peer_left');
    assert.ok(leftMsg, 'Cliente 2 deveria ter recebido peer_left');

    ws2.close();
    ws3.close();
  });
});
