// Socket.IO wiring + службы домена
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

  // Сервисы домена
  const roomsSvc = createRoomsService({
    roomIndex,
    getRooms,
    setRooms,
    saveRooms: () => saveRooms(getRooms()),
    newRoomId: () => 'r-' + Math.random().toString(36).slice(2, 12),
  });

  const membersSvc = createMembersService({ io });

  const strokesSvc = createStrokesService({
    saveRooms: () => saveRooms(getRooms()),
  });

  io.on('connection', (socket) => {
    socket.on('join', ({ roomId, clientId }) => {
      roomId = roomId || 'demo';
      const room = roomsSvc.ensureRoom(roomId);

      socket.join(roomId);
      membersSvc.ensureRoom(roomId);

      const rec = membersSvc.setPresence(roomId, socket.id, { clientId });
      if (!rec.name)  rec.name  = 'Гость';
      if (!rec.color) rec.color = '#0F8FFF';
      membersSvc.broadcast(roomId);

      socket.emit('init', {
        strokes: room.strokes || [],
        ownerClientId: room.ownerClientId || '',
        moderators: room.moderators || [],
        members: membersSvc.list(roomId)
      });
    });

    socket.on('presence', ({ roomId, name, color } = {}) => {
      if (!roomId) return;
      membersSvc.setPresence(roomId, socket.id, { name, color });
      membersSvc.broadcast(roomId);
    });

    socket.on('cursor', (payload = {}) => {
      const { roomId } = payload;
      if (!roomId) return;
      const rec = membersSvc.setPresence(roomId, socket.id, {
        name: payload.name, color: payload.color, clientId: payload.clientId
      });
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
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;

      const added = strokesSvc.addStroke(room, stroke);
      if (added && stroke.authorId) {
        const recId = stroke.authorId;
        membersSvc.resetRedo(roomId, recId);
      }
      socket.to(roomId).emit('stroke-finish', { tempId });
      io.to(roomId).emit('stroke', stroke);
    });

    socket.on('delete-stroke', ({ roomId, id } = {}) => {
      if (!roomId || !id) return;
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;

      const clientId = membersSvc.getClientId(roomId, socket.id);
      const isMod = Array.isArray(room.moderators) && room.moderators.some(x => x.clientId === clientId);
      const s = (room.strokes || []).find(x => x.id === id);
      if (!s) return;
      if (s.authorId !== clientId && !isMod) {
        socket.emit('delete-denied');
        return;
      }
      const removed = strokesSvc.deleteStrokeById(room, id);
      if (removed) io.to(roomId).emit('stroke-deleted', id);
    });

    socket.on('undo', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const removed = strokesSvc.undo(room, clientId, membersSvc);
      if (removed) io.to(roomId).emit('stroke-deleted', removed.id);
    });

    socket.on('redo', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const restored = strokesSvc.redo(room, clientId, membersSvc);
      if (restored) io.to(roomId).emit('stroke-restored', restored);
    });

    socket.on('clear', (roomId) => {
      if (!roomId) return;
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;
      const clientId = membersSvc.getClientId(roomId, socket.id);
      const isOwner = !!(clientId && room.ownerClientId === clientId);
      const isMod = Array.isArray(room.moderators) && room.moderators.some(x => x.clientId === clientId);
      if (!isOwner && !isMod) {
        socket.emit('clear-denied');
        return;
      }
      strokesSvc.clear(room);
      io.to(roomId).emit('cleared');
    });

    socket.on('set-moderator', ({ roomId, password, clientId, value } = {}) => {
      if (!roomId || !clientId) return;
      if (!MOD_PASSWORD || password !== MOD_PASSWORD) return;
      const room = roomsSvc.getRoom(roomId);
      if (!room) return;
      room.moderators = Array.isArray(room.moderators) ? room.moderators : [];
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
