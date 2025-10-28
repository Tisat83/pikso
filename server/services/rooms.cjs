// Домен: комнаты (создание/поиск/удаление/индекс)
module.exports = function createRoomsService({ roomIndex, getRooms, setRooms, saveRooms, newRoomId }) {
  function rebuildIndex() {
    roomIndex.clear();
    for (const r of getRooms()) roomIndex.set(r.roomId, r);
  }

  function ensureRoom(roomId) {
    let room = roomIndex.get(roomId);
    if (!room) {
      room = { roomId, ownerClientId: '', strokes: [], moderators: [] };
      setRooms([room, ...getRooms()]);
      saveRooms(getRooms());
      rebuildIndex();
    }
    return room;
  }

  function createRoomForOwner(clientId) {
    const roomId = 'r-' + (newRoomId ? newRoomId().slice(2) : Math.random().toString(36).slice(2, 12));
    const room = { roomId, ownerClientId: clientId, strokes: [], moderators: [] };
    setRooms([room, ...getRooms()]);
    saveRooms(getRooms());
    rebuildIndex();
    return room;
  }

  function getRoom(roomId) {
    return roomIndex.get(roomId) || null;
  }

  function removeRoom(roomId) {
    const next = getRooms().filter(r => r.roomId !== roomId);
    setRooms(next);
    saveRooms(getRooms());
    rebuildIndex();
  }

  return {
    ensureRoom,
    createRoomForOwner,
    getRoom,
    removeRoom,
  };
};
