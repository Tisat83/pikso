// Socket.IO wiring + доменные сервисы (пиксельный ластик + таймлайн)
const { Server } = require('socket.io');
const createRoomsService = require('../services/rooms.cjs');
const createMembersService = require('../services/members.cjs');
const createStrokesService = require('../services/strokes.cjs');

module.exports = function initSockets({
  server,
  MOD_PASSWORD,
  roomIndex,
  getRooms,
  setRooms,
  saveRooms,
}) {
  const io = new Server(server, { cors: { origin: true, credentials: true } });

  const roomsSvc = createRoomsService({
    roomIndex, getRooms, setRooms, saveRooms,
    newRoomId: () => 'r-' + Math.random().toString(36).slice(2, 12),
  });
  const membersSvc = createMembersService({ io });
  const strokesSvc = createStrokesService({ saveRooms });

  io.on('connection', (socket) => {
    socket.on('join', ({ roomId, clientId }) => {
      if (!roomId || !clientId) return;
      const room = roomsSvc.ensureRoom(roomId);
      socket.join(roomId);
      membersSvc.setPresence(roomId, socket.id, { clientId, name: 'Гость', color: '#0F8FFF' });
      socket.emit('init', {
        strokes: room.strokes || [],
        erases:  room.erases  || [],
        ownerClientId: room.ownerClientId || null,
        moderators: room.moderators || [],
        members: membersSvc.list(roomId) || []
      });
    });

    socket.on('presence', ({ roomId, name, color }) => {
      if (!roomId) return;
      membersSvc.setPresence(roomId, socket.id, { name, color });
    });

    socket.on('cursor', (msg) => {
      if (!msg || !msg.roomId) return;
      const clientId = membersSvc.getClientId(msg.roomId, socket.id);
      io.to(msg.roomId).emit('cursor', { clientId, x: msg.x, y: msg.y, visible: !!msg.visible, color: msg.color, name: msg.name });
    });

    socket.on('stroke-begin', (msg) => { if (msg && msg.roomId) socket.to(msg.roomId).emit('stroke-begin', msg); });
    socket.on('stroke-progress', (msg) => { if (msg && msg.roomId) socket.to(msg.roomId).emit('stroke-progress', msg); });
    socket.on('stroke-finish', (msg) => { if (msg && msg.roomId) socket.to(msg.roomId).emit('stroke-finish', msg); });

    socket.on('stroke', ({ roomId, stroke }) => {
      if (!roomId || !stroke) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      if (typeof stroke.t !== 'number') stroke.t = Date.now(); // штамп времени
      if (strokesSvc.addStroke(room, stroke)) io.to(roomId).emit('stroke', stroke);
    });

    socket.on('delete-stroke', ({ roomId, id }) => {
      if (!roomId || !id) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const s = (room.strokes || []).find(x => x.id === id);
      const modSet = new Set((room.moderators || []).map(m => m.clientId));
      const allowed = s && (s.authorId === clientId || modSet.has(clientId));
      if (!allowed) { socket.emit('delete-denied'); return; }
      const removed = strokesSvc.deleteStrokeById(room, id);
      if (removed) io.to(roomId).emit('stroke-deleted', id);
    });

    // === Пиксельный ластик: 'erase-circle'  (+ алиас на старое 'erase-brush')
    function handleErase({ roomId, x, y, radius }) {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      const circle = strokesSvc.registerEraseCircle(room, x, y, radius);
      if (!circle) return;
      io.to(roomId).emit('erase-circle', circle); // транслируем всем
    }
    socket.on('erase-circle', handleErase);
    socket.on('erase-brush', handleErase); // алиас для совместимости

    socket.on('undo', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const removed = strokesSvc.undo(room, clientId, membersSvc);
      if (removed) io.to(roomId).emit('stroke-deleted', removed.id);
    });

    socket.on('redo', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const restored = strokesSvc.redo(room, clientId, membersSvc);
      if (restored) io.to(roomId).emit('stroke-restored', restored);
    });

    socket.on('clear', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const owner = room.ownerClientId && room.ownerClientId === clientId;
      const modSet = new Set((room.moderators || []).map(m => m.clientId));
      if (!owner && !modSet.has(clientId)) { socket.emit('clear-denied'); return; }
      strokesSvc.clear(room);
      io.to(roomId).emit('cleared'); // клиент сбросит и strokes, и erases
    });

    socket.on('set-moderator', ({ roomId, password, clientId, value }) => {
      if (!roomId || !clientId || password !== (process.env.MOD_PASSWORD || '')) return;
      const room = roomsSvc.getRoom(roomId); if (!room) return;
      room.moderators = room.moderators || [];
      const exists = room.moderators.some(x => x.clientId === clientId);
      if (value && !exists) room.moderators.push({ clientId });
      if (!value && exists) room.moderators = room.moderators.filter(x => x.clientId !== clientId);
      saveRooms(getRooms());
      io.to(roomId).emit('moderators', room.moderators);
      io.to(roomId).emit('moderator-set', { clientId, value: !!value });
    });

    socket.on('disconnecting', () => {
      membersSvc.clearSocket(socket);
    });
  });

  return io;
};
