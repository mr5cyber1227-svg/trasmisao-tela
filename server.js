const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const rooms = new Map(); // code -> { host, viewers: Map(id -> ws) }

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/room/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  res.writeHead(404);
  res.end('Não encontrado');
});

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

new WebSocketServer({ server, path: '/ws' }).on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = (url.searchParams.get('room') || '').toUpperCase().slice(0, 16);
  const role = url.searchParams.get('role');
  if (!code) return ws.close();

  if (role === 'host') {
    if (rooms.has(code)) { send(ws, { type: 'error', reason: 'room-taken' }); return ws.close(); }
    const room = { host: ws, viewers: new Map() };
    rooms.set(code, room);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'signal') send(room.viewers.get(m.to), { type: 'signal', data: m.data });
    });
    ws.on('close', () => {
      room.viewers.forEach((v) => { send(v, { type: 'ended' }); v.close(); });
      rooms.delete(code);
    });
  } else {
    const room = rooms.get(code);
    if (!room) { send(ws, { type: 'not-found' }); return ws.close(); }
    const id = Math.random().toString(36).slice(2, 10);
    room.viewers.set(id, ws);
    send(room.host, { type: 'viewer-joined', id });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'signal') send(room.host, { type: 'signal', from: id, data: m.data });
    });
    ws.on('close', () => {
      room.viewers.delete(id);
      send(room.host, { type: 'viewer-left', id });
    });
  }
});

server.listen(PORT, () => console.log('Rodando na porta ' + PORT));
