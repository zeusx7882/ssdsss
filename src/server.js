const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./roomManager');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const roomManager = new RoomManager();

/**
 * Servidor HTTP simples para arquivos estáticos e healthcheck
 */
function requestHandler(req, res) {
  // Cabeçalhos básicos de segurança
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self' ws: wss:; img-src 'self' data:;"
  );

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      activeRooms: roomManager.getRoomCount()
    }));
    return;
  }

  // Sanitização de caminho para servir static files
  let safePath = path.normalize(decodeURIComponent(req.url.split('?')[0]));
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Evita Directory Traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Acesso proibido.');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Não Encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer(requestHandler);

// Servidor WebSocket para sinalização WebRTC
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    roomManager.handleMessage(ws, data);
  });

  ws.on('close', () => {
    roomManager.handleLeave(ws);
  });

  ws.on('error', () => {
    roomManager.handleLeave(ws);
  });
});

// Heartbeat a cada 30 segundos para evitar conexões zumbis
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      roomManager.handleLeave(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // Ignora erro se já fechado
    }
  }
}, 30000);
interval.unref();

wss.on('close', () => {
  clearInterval(interval);
});

function startServer(port = PORT, host = HOST) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`[Servidor WebRTC] Rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
      resolve({ server, wss, roomManager });
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  server,
  wss,
  roomManager,
  startServer
};
