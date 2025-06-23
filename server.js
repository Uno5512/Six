// bootstrap-signaling.js
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// HTTP-сервер просто отвечает 200 на «/»
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bootstrap Signaling Server\n');
});

// WebSocket без комнат, без учёта, без истории
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  console.log(`🔗 Client connected (total ${wss.clients.size})`);

  ws.on('message', data => {
    // тупо ретранслируем входящий пакет всем остальным
    for (let client of wss.clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  });

  ws.on('close', () => {
    console.log(`❌ Client disconnected (total ${wss.clients.size})`);
    // после close сервер не хранит о клиенте ничего
  });

  ws.on('error', err => {
    console.error('⚠️ WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on ws://localhost:${PORT}`);
});
