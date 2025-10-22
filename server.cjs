// Pikso server.cjs — безопасная загрузка/сохранение комнат + все актуальные фичи
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ROOMS_FILE)) fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms: {} }, null, 2));

// --- robust load ---
function safeLoadRooms() {
  try {
    const raw = fs.readFileSync(ROOMS_FILE, 'utf8') || '';
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    // поддерживаем оба формата: {rooms:{...}} и просто {...}
    if (parsed && typeof parsed === 'object') {
      if (parsed.rooms && typeof parsed.rooms === 'object') return parsed.rooms;
      return parsed;
    }
  } catch (e) {
    console.warn('[persist] rooms.json corrupted, starting fresh:', e.message);
  }
  return {};
}

let rooms = safeLoadRooms();
console.log(`[persist] loaded ${Object.keys(rooms).length} rooms`);

function saveRooms() {
  try {
    if (!rooms || typeof rooms !== 'object') rooms = {};
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms }, null, 2));
  } catch (e) {
    console.error('[persist] save error:', e.message);
  }
}

function uid(n = 10) { return Math.random().toString(36).slice(2, 2 + n); }
function now() { return Date.now(); }

function getOrCreateRoom(roomId, ownerClientId = null) {
  if (!rooms || typeof rooms !== 'object') rooms = {}; // страховка
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      ownerClientId: ownerClientId || null,
      createdAt: now(),
      updatedAt: now(),
      strokes: [],
      undo: [],
      members: {},    // clientId -> {name,color}
      moderators: [], // {clientId,name}
    };
    saveRooms();
  }
  return rooms[roomId];
}

// -------------------- REST --------------------
app.get('/api/rooms', (req, res) => {
  const owner = (req.query.ownerClientId || '').trim();
  if (!owner) return res.json({ rooms: [] });
  const list = Object.values(rooms)
    .filter(r => r.ownerClientId === owner)
    .map(r => ({ roomId: r.id }));
  res.json({ rooms: list });
});

app.post('/api/rooms', (req, res) => {
  try {
    const ownerClientId = (req.body && req.body.clientId) || null;
    const roomId = 'r-' + uid(10);
    getOrCreateRoom(roomId, ownerClientId);
    saveRooms();
    return res.status(201).json({ roomId });
  } catch (e) {
    return res.status(500).json({ error: 'fail' });
  }
});

app.delete('/api/rooms/:id', (req, res) => {
  const id = req.params.id;
  const cid = (req.body && req.body.clientId) || '';
  const r = rooms[id];
  if (!r) return res.status(404).json({ error: 'not_found' });
  if (r.ownerClientId && r.ownerClientId !== cid) return res.status(403).json({ error: 'forbidden' });
  delete rooms[id];
  saveRooms();
  res.json({ ok: true });
});

// ------------------- SOCKETS -------------------
io.on('connection', (socket) => {
  let current = { roomId: null, clientId: null };

  socket.on('join', ({ roomId, clientId }) => {
    current = { roomId, clientId };
    socket.join(roomId);
    const room = getOrCreateRoom(roomId);
    io.to(socket.id).emit('init', {
      strokes: room.strokes,
      ownerClientId: room.ownerClientId,
      moderators: room.moderators,
      members: Object.entries(room.members).map(([cid, v]) => ({ clientId: cid, ...v })),
    });
  });

  socket.on('presence', ({ roomId, name, color }) => {
    const room = getOrCreateRoom(roomId);
    room.members[current.clientId] = { name, color };
    io.to(roomId).emit('members', Object.entries(room.members).map(([cid, v]) => ({ clientId: cid, ...v })));
    saveRooms();
  });

  socket.on('cursor', (p) => { p.clientId = current.clientId; io.to(current.roomId).emit('cursor', p); });

  // live previews
  socket.on('stroke-begin', ({ roomId, tempId, color, size, point }) => {
    io.to(roomId).emit('stroke-begin', { tempId, color, size, point });
  });
  socket.on('stroke-progress', ({ roomId, tempId, points }) => {
    io.to(roomId).emit('stroke-progress', { tempId, points });
  });

  socket.on('stroke', ({ roomId, stroke, tempId }) => {
    const room = getOrCreateRoom(roomId);
    room.strokes.push(stroke);
    room.undo = []; // сбрасываем стек redo
    room.updatedAt = now();
    io.to(roomId).emit('stroke-finish', { tempId });
    io.to(roomId).emit('stroke', stroke);
    saveRooms();
  });

  socket.on('delete-stroke', ({ roomId, id }) => {
    const room = getOrCreateRoom(roomId);
    const idx = room.strokes.findIndex(s => s.id === id);
    if (idx === -1) return;
    const s = room.strokes[idx];
    const isMod = room.moderators.some(m => m.clientId === current.clientId);
    if (s.authorId !== current.clientId && !isMod) {
      io.to(socket.id).emit('delete-denied');
      return;
    }
    room.strokes.splice(idx, 1);
    room.undo.push({ action: 'delete', stroke: s });
    room.updatedAt = now();
    io.to(roomId).emit('stroke-deleted', id);
    saveRooms();
  });

  socket.on('undo', (roomId) => {
    const room = getOrCreateRoom(roomId);
    if (room.strokes.length === 0) return;
    const s = room.strokes.pop();
    room.undo.push({ action: 'add', stroke: s });
    io.to(roomId).emit('stroke-deleted', s.id);
    saveRooms();
  });

  socket.on('redo', (roomId) => {
    const room = getOrCreateRoom(roomId);
    const last = room.undo.pop();
    if (!last) return;
    if (last.action === 'add') {
      room.strokes.push(last.stroke);
      io.to(roomId).emit('stroke', last.stroke);
    } else if (last.action === 'delete') {
      const id = last.stroke.id;
      const idx = room.strokes.findIndex(s => s.id === id);
      if (idx !== -1) room.strokes.splice(idx, 1);
      io.to(roomId).emit('stroke-deleted', id);
    }
    saveRooms();
  });

  socket.on('clear', (roomId) => {
    const room = getOrCreateRoom(roomId);
    const isMod = room.moderators.some(m => m.clientId === current.clientId);
    const isOwner = room.ownerClientId && room.ownerClientId === current.clientId;
    if (!(isMod || isOwner)) {
      io.to(socket.id).emit('clear-denied');
      return;
    }
    room.strokes = [];
    room.undo = [];
    io.to(roomId).emit('cleared');
    saveRooms();
  });

  socket.on('set-moderator', ({ roomId, value }) => {
    const room = getOrCreateRoom(roomId);
    if (value) {
      if (!room.moderators.some(m => m.clientId === current.clientId)) {
        const info = room.members[current.clientId] || { name: 'Гость' };
        room.moderators.push({ clientId: current.clientId, name: info.name || 'Гость' });
      }
    } else {
      room.moderators = room.moderators.filter(m => m.clientId !== current.clientId);
    }
    io.to(socket.id).emit('moderator-set', { value });
    io.to(roomId).emit('moderators', room.moderators);
    saveRooms();
  });

  socket.on('disconnect', () => {
    if (!current.roomId || !current.clientId) return;
    const room = getOrCreateRoom(current.roomId);
    delete room.members[current.clientId];
    io.to(current.roomId).emit('members', Object.entries(room.members).map(([cid, v]) => ({ clientId: cid, ...v })));
    saveRooms();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Pikso listening on :${PORT}`);
});
