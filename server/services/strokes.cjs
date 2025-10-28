// Домен: штрихи/очистка/undo/redo
module.exports = function createStrokesService({ saveRooms }) {
  function addStroke(room, stroke) {
    room.strokes = room.strokes || [];
    if (!room.strokes.some(s => s.id === stroke.id)) {
      room.strokes.push(stroke);
      saveRooms();
      return true;
    }
    return false;
  }

  function deleteStrokeById(room, id) {
    const strokes = room.strokes || [];
    const idx = strokes.findIndex(s => s.id === id);
    if (idx === -1) return null;
    const removed = strokes.splice(idx, 1)[0];
    room.strokes = strokes;
    saveRooms();
    return removed;
  }

  function clear(room) {
    room.strokes = [];
    saveRooms();
  }

  function undo(room, clientId, membersSvc) {
    if (!clientId) return null;
    const strokes = room.strokes || [];
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].authorId === clientId) {
        const removed = strokes.splice(i, 1)[0];
        room.strokes = strokes;
        membersSvc.pushRedo(room.roomId, clientId, removed);
        saveRooms();
        return removed;
      }
    }
    return null;
  }

  function redo(room, clientId, membersSvc) {
    if (!clientId) return null;
    const s = membersSvc.popRedo(room.roomId, clientId);
    if (!s) return null;
    room.strokes = room.strokes || [];
    room.strokes.push(s);
    saveRooms();
    return s;
  }

  return { addStroke, deleteStrokeById, clear, undo, redo };
};
