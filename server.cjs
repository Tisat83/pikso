/* server.cjs — Pikso MVP (CommonJS)
 * Node.js + Express + Socket.IO
 * Статика: /public, персист: data/rooms.json
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3101;
const MOD_PASSWORD = process.env.MOD_PASSWORD || '';
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Persistence ----------
let rooms = [];

function rebuildIndex() {
  roomIndex.clear();
  for (const r of rooms) roomIndex.set(r.roomId, r);
}

let saveTimer = null;
function saveRooms(nextState, immediate = false) {
  if (Array.isArray(nextState)) {
    rooms = nextState;
    rebuildIndex();
  }
  const doWrite = () => {
    try {
      const payload = JSON.stringify({ rooms }, null, 2);
      fs.writeFileSync(ROOMS_FILE, payload, 'utf8');
    } catch (e) {
      console.error('[persist] write error:', e);
    }
  };
  if (immediate) return doWrite();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doWrite, 300);
}

function loadRooms() {
  try {
    const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
    const json = JSON.parse(raw);
    if (!json || !Array.isArray(json.rooms)) throw 0;
    rooms = json.rooms;
    rebuildIndex();
    console.log(`[persist] loaded ${rooms.length} rooms]`);
  } catch (e) {
    rooms = [{ roomId: 'demo', ownerClientId: 'demo', strokes: [], moderators: [] }];
    saveRooms(rooms, true);
    console.log('[persist] initialized with 1 demo room]');
  }
}

function uid(len = 10) {
  return Math.random().toString(36).slice(2, 2 + len);
}
function newRoomId() { return 'r-' + uid(10); }

// room index
const roomIndex = new Map();
loadRooms();

// ---------- Express ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.json({ limit: '1mb' }));

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Главная (лендинг)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA fallback для /canvas/*
app.get(['/canvas', '/canvas/:id'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// health
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.length }));

// ---------- REST: приватные комнаты ----------
app.post('/api/rooms', (req, res) => {
  const clientId = (req.body && String(req.body.clientId || '').trim()) || '';
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const roomId = newRoomId();
  const room = { roomId, ownerClientId: clientId, strokes: [], moderators: [] };
  rooms.unshift(room);
  saveRooms(rooms);
  res.json({ roomId });
});

app.get('/api/rooms', (req, res) => {
  const owner = (req.query && String(req.query.ownerClientId || '').trim()) || '';
  if (!owner) return res.json({ rooms: [] });
  const list = rooms.filter(r => r.ownerClientId === owner).map(r => ({ roomId: r.roomId }));
  res.json({ rooms: list });
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').trim();
  const clientId = (req.body && String(req.body.clientId || '').trim()) || '';
  const room = roomIndex.get(roomId);
  if (!room) return res.status(404).json({ error: 'not found' });
  if (!clientId || room.ownerClientId !== clientId) return res.status(403).json({ error: 'forbidden' });
  rooms = rooms.filter(r => r.roomId !== roomId);
  saveRooms(rooms);
  try { io.to(roomId).emit('cleared'); } catch (_) {}
  res.status(204).end();
});

// ---------- Socket.IO ----------
// members & redo stacks per room
const membersByRoom = new Map();
const redoStacks = new Map();
function ensureRoomStructures(roomId) {
  if (!membersByRoom.has(roomId)) membersByRoom.set(roomId, new Map());
  if (!redoStacks.has(roomId)) redoStacks.set(roomId, new Map());
}
function listMembers(roomId) {
  const map = membersByRoom.get(roomId);
  if (!map) return [];
  return Array.from(map.values());
}
function broadcastMembers(roomId) {
  io.to(roomId).emit('members', listMembers(roomId));
}

io.on('connection', (socket) => {
  socket.on('join', ({ roomId, clientId }) => {
    if (!roomId) roomId = 'demo';
    let room = roomIndex.get(roomId);
    if (!room) {
      room = { roomId, ownerClientId: '', strokes: [], moderators: [] };
      rooms.unshift(room);
      saveRooms(rooms);
    }
    socket.join(roomId);
    ensureRoomStructures(roomId);
    // register member
    const m = membersByRoom.get(roomId);
    const rec = m.get(socket.id) || { name: 'Гость', color: '#0F8FFF' };
    if (clientId) rec.clientId = String(clientId);
    m.set(socket.id, rec);
    broadcastMembers(roomId);
    socket.emit('init', {
      strokes: room.strokes || [],
      ownerClientId: room.ownerClientId || '',
      moderators: room.moderators || [],
      members: listMembers(roomId)
    });
  });

  socket.on('presence', ({ roomId, name, color } = {}) => {
    if (!roomId) return;
    ensureRoomStructures(roomId);
    const m = membersByRoom.get(roomId);
    const rec = m.get(socket.id) || {};
    if (name) rec.name = String(name);
    if (color) rec.color = String(color);
    m.set(socket.id, rec);
    broadcastMembers(roomId);
  });

  socket.on('cursor', (payload = {}) => {
    const { roomId } = payload;
    if (!roomId) return;
    ensureRoomStructures(roomId);
    const m = membersByRoom.get(roomId);
    const rec = m.get(socket.id) || {};
    if (payload.name) rec.name = String(payload.name);
    if (payload.color) rec.color = String(payload.color);
    if (payload.clientId) rec.clientId = String(payload.clientId);
    m.set(socket.id, rec);
    const out = Object.assign({}, payload, { clientId: rec.clientId });
    socket.to(roomId).emit('cursor', out);
  });

  socket.on('stroke-begin', (msg) => {
    if (!msg || !msg.roomId) return;
    socket.to(msg.roomId).emit('stroke-begin', msg);
  });
  socket.on('stroke-progress', (msg) => {
    if (!msg || !msg.roomId) return;
    socket.to(msg.roomId).emit('stroke-progress', msg);
  });

  socket.on('stroke', (msg = {}) => {
    const { roomId, stroke, tempId } = msg;
    if (!roomId || !stroke || !stroke.id) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    room.strokes = room.strokes || [];
    if (!room.strokes.some(s => s.id === stroke.id)) {
      room.strokes.push(stroke);
      saveRooms(rooms);
    }
    ensureRoomStructures(roomId);
    const redos = redoStacks.get(roomId);
    if (stroke.authorId) redos.set(stroke.authorId, []);
    socket.to(roomId).emit('stroke-finish', { tempId });
    io.to(roomId).emit('stroke', stroke);
  });

  socket.on('delete-stroke', ({ roomId, id } = {}) => {
    if (!roomId || !id) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    const strokes = room.strokes || [];
    const idx = strokes.findIndex(s => s.id === id);
    if (idx === -1) return;
    const s = strokes[idx];
    const m = membersByRoom.get(roomId)?.get(socket.id);
    const clientId = m && m.clientId;
    const isMod = Array.isArray(room.moderators) && room.moderators.some(x => x.clientId === clientId);
    if (s.authorId !== clientId && !isMod) {
      socket.emit('delete-denied');
      return;
    }
    strokes.splice(idx, 1);
    room.strokes = strokes;
    saveRooms(rooms);
    io.to(roomId).emit('stroke-deleted', id);
  });

  socket.on('undo', (roomId) => {
    if (!roomId) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    const m = membersByRoom.get(roomId)?.get(socket.id);
    const clientId = m && m.clientId;
    if (!clientId) return;
    const strokes = room.strokes || [];
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].authorId === clientId) {
        const removed = strokes.splice(i, 1)[0];
        ensureRoomStructures(roomId);
        const redos = redoStacks.get(roomId);
        const stack = redos.get(clientId) || [];
        stack.push(removed);
        redos.set(clientId, stack);
        saveRooms(rooms);
        io.to(roomId).emit('stroke-deleted', removed.id);
        return;
      }
    }
  });

  socket.on('redo', (roomId) => {
    if (!roomId) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    const m = membersByRoom.get(roomId)?.get(socket.id);
    const clientId = m && m.clientId;
    if (!clientId) return;
    ensureRoomStructures(roomId);
    const redos = redoStacks.get(roomId);
    const stack = redos.get(clientId) || [];
    const s = stack.pop();
    if (!s) return;
    room.strokes = room.strokes || [];
    room.strokes.push(s);
    redos.set(clientId, stack);
    saveRooms(rooms);
    io.to(roomId).emit('stroke-restored', s);
  });

  socket.on('clear', (roomId) => {
    if (!roomId) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    const m = membersByRoom.get(roomId)?.get(socket.id);
    const clientId = m && m.clientId;
    const isOwner = !!(clientId && room.ownerClientId === clientId);
    const isMod = Array.isArray(room.moderators) && room.moderators.some(x => x.clientId === clientId);
    if (!isOwner && !isMod) {
      socket.emit('clear-denied');
      return;
    }
    room.strokes = [];
    saveRooms(rooms);
    io.to(roomId).emit('cleared');
  });

  socket.on('set-moderator', ({ roomId, password, clientId, value } = {}) => {
    if (!roomId || !clientId) return;
    if (!MOD_PASSWORD || password !== MOD_PASSWORD) return;
    const room = roomIndex.get(roomId);
    if (!room) return;
    room.moderators = Array.isArray(room.moderators) ? room.moderators : [];
    const exists = room.moderators.some(x => x.clientId === clientId);
    if (value && !exists) room.moderators.push({ clientId });
    if (!value && exists) room.moderators = room.moderators.filter(x => x.clientId !== clientId);
    saveRooms(rooms);
    io.to(roomId).emit('moderators', room.moderators);
    io.to(roomId).emit('moderator-set', { clientId, value: !!value });
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      const map = membersByRoom.get(roomId);
      if (map) {
        map.delete(socket.id);
        broadcastMembers(roomId);
      }
    }
  });
});

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`Pikso server listening on http://localhost:${PORT}`);
});
