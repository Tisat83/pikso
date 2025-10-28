/* Pikso server — entry point
 * Iteration 3C: storage layer (rooms + feedback) centralized in server/storage/files.cjs
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3101;
const MOD_PASSWORD = process.env.MOD_PASSWORD || '';

// Storage
const createStorage = require('./storage/files.cjs');
const storage = createStorage({ DATA_DIR });

// In-memory state
let rooms = [];
const roomIndex = new Map();

function rebuildIndex() {
  roomIndex.clear();
  for (const r of rooms) roomIndex.set(r.roomId, r);
}

function saveRooms(nextState, immediate = false) {
  if (Array.isArray(nextState)) {
    rooms = nextState;
    rebuildIndex();
  }
  storage.saveRooms(rooms, immediate);
}

function loadRooms() {
  rooms = storage.loadRooms();
  rebuildIndex();
  if (rooms && rooms.length) {
    console.log(`[persist] loaded ${rooms.length} rooms]`);
  } else {
    console.log('[persist] initialized with 1 demo room]');
  }
}
loadRooms();

function uid(len = 10) { return Math.random().toString(36).slice(2, 2 + len); }
function newRoomId() { return 'r-' + uid(10); }

/* ---------- HTTP (Express) ---------- */
const createApp = require('./http/app.cjs');
const app = createApp({
  PUBLIC_DIR,
  getRoomsCount: () => rooms.length,
});

// REST routes
const roomsRouterFactory = require('./http/routes/rooms.cjs');
const contactRouterFactory = require('./http/routes/contact.cjs');

app.use('/api/rooms', roomsRouterFactory({
  roomIndex,
  saveRooms,
  getRoomById: (id) => roomIndex.get(id),
  newRoomId,
  get rooms() { return rooms; },
  set rooms(val) { rooms = val; rebuildIndex(); saveRooms(rooms); },
}));

app.use('/api/contact', contactRouterFactory({
  appendFeedback: storage.appendFeedback,
  getClientIp: (req) => (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || '',
}));

// HTTP server
const server = http.createServer(app);

// Sockets
require('./sockets/index.cjs')({
  server,
  MOD_PASSWORD,
  roomIndex,
  getRooms: () => rooms,
  setRooms: (next) => { rooms = next; rebuildIndex(); saveRooms(rooms); },
  saveRooms,
});

server.listen(PORT, () => {
  console.log(`Pikso server listening on http://localhost:${PORT}`);
});
