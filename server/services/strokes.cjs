// Домен: штрихи/очистка/undo/redo + пиксельный ластик (маска erase-circle с таймстампом)
module.exports = function createStrokesService({ saveRooms }) {
  function ensureArrays(room) {
    room.strokes = room.strokes || [];
    room.erases  = room.erases  || [];
  }

  function addStroke(room, stroke) {
    ensureArrays(room);
    // сервер гарантирует штампы времени на штрихи
    if (typeof stroke.t !== 'number') stroke.t = Date.now();
    if (!room.strokes.some(s => s.id === stroke.id)) {
      room.strokes.push(stroke);
      saveRooms();
      return true;
    }
    return false;
  }

  function deleteStrokeById(room, id) {
    ensureArrays(room);
    const idx = room.strokes.findIndex(s => s.id === id);
    if (idx === -1) return null;
    const removed = room.strokes[idx];
    room.strokes.splice(idx, 1);
    saveRooms();
    return removed;
  }

  function clear(room) {
    ensureArrays(room);
    const removed = room.strokes.slice();
    room.strokes = [];
    room.erases  = []; // чистим маску
    saveRooms();
    return removed;
  }

  function undo(room, clientId, membersSvc) {
    if (!clientId) return null;
    ensureArrays(room);
    for (let i = room.strokes.length - 1; i >= 0; i--) {
      const s = room.strokes[i];
      if (s && s.authorId === clientId) {
        room.strokes.splice(i, 1);
        saveRooms();
        membersSvc.pushRedo(room.roomId, clientId, s);
        return s;
      }
    }
    return null;
  }

  function redo(room, clientId, membersSvc) {
    if (!clientId) return null;
    ensureArrays(room);
    const s = membersSvc.popRedo(room.roomId, clientId);
    if (!s) return null;
    room.strokes.push(s);
    saveRooms();
    return s;
  }

  // === ПИКСЕЛЬНОЕ стирание: регистрируем круг маски с временем
  function registerEraseCircle(room, x, y, radius) {
    ensureArrays(room);
    const r = Math.max(0, +radius || 0);
    if (!isFinite(x) || !isFinite(y) || !isFinite(r) || r <= 0) return null;
    const circle = { x: +x, y: +y, r, t: Date.now() };
    room.erases.push(circle);
    saveRooms();
    return circle;
  }

  return {
    addStroke, deleteStrokeById, clear, undo, redo,
    registerEraseCircle
  };
};
