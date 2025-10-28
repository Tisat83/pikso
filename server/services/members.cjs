// Домен: участники/присутствие + стеки redo по пользователям
module.exports = function createMembersService({ io }) {
  const membersByRoom = new Map(); // roomId -> Map(socketId -> {name,color,clientId})
  const redoStacks = new Map();    // roomId -> Map(clientId -> Stroke[])

  function ensureRoom(roomId) {
    if (!membersByRoom.has(roomId)) membersByRoom.set(roomId, new Map());
    if (!redoStacks.has(roomId)) redoStacks.set(roomId, new Map());
  }

  function setPresence(roomId, socketId, patch = {}) {
    ensureRoom(roomId);
    const m = membersByRoom.get(roomId);
    const rec = m.get(socketId) || {};
    if (patch.name != null)  rec.name  = String(patch.name);
    if (patch.color != null) rec.color = String(patch.color);
    if (patch.clientId != null) rec.clientId = String(patch.clientId);
    m.set(socketId, rec);
    return rec;
  }

  function getClientId(roomId, socketId) {
    const m = membersByRoom.get(roomId);
    return m?.get(socketId)?.clientId || null;
  }

  function list(roomId) {
    const m = membersByRoom.get(roomId);
    return m ? Array.from(m.values()) : [];
  }

  function broadcast(roomId) {
    io.to(roomId).emit('members', list(roomId));
  }

  function clearSocket(socket) {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      const map = membersByRoom.get(roomId);
      if (map) {
        map.delete(socket.id);
        broadcast(roomId);
      }
    }
  }

  function pushRedo(roomId, clientId, stroke) {
    ensureRoom(roomId);
    const map = redoStacks.get(roomId);
    const stack = map.get(clientId) || [];
    stack.push(stroke);
    map.set(clientId, stack);
  }

  function popRedo(roomId, clientId) {
    ensureRoom(roomId);
    const map = redoStacks.get(roomId);
    const stack = map.get(clientId) || [];
    return stack.pop();
  }

  function resetRedo(roomId, clientId) {
    ensureRoom(roomId);
    const map = redoStacks.get(roomId);
    map.set(clientId, []);
  }

  return {
    ensureRoom,
    setPresence,
    getClientId,
    list,
    broadcast,
    clearSocket,
    pushRedo,
    popRedo,
    resetRedo,
  };
};
