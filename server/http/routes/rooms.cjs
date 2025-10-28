const express = require('express');

module.exports = function roomsRouter({ roomIndex, saveRooms, getRoomById, newRoomId, rooms: roomsGetterSetter }) {
  const router = express.Router();

  // POST /api/rooms
  router.post('/', (req, res) => {
    const clientId = (req.body && String(req.body.clientId || '').trim()) || '';
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const roomId = newRoomId();
    const room = { roomId, ownerClientId: clientId, strokes: [], moderators: [] };
    const current = roomsGetterSetter;
    const next = [room, ...(Array.isArray(current) ? current : current.rooms || [])];
    // roomsGetterSetter может быть геттером — используем saveRooms
    saveRooms(next);
    return res.json({ roomId });
  });

  // GET /api/rooms?ownerClientId=...
  router.get('/', (req, res) => {
    const owner = (req.query && String(req.query.ownerClientId || '').trim()) || '';
    if (!owner) return res.json({ rooms: [] });
    const list = [];
    // безопасный обход индекса
    for (const r of roomIndex.values()) {
      if (r.ownerClientId === owner) list.push({ roomId: r.roomId });
    }
    return res.json({ rooms: list });
  });

  // DELETE /api/rooms/:roomId
  router.delete('/:roomId', (req, res) => {
    const roomId = String(req.params.roomId || '').trim();
    const clientId = (req.body && String(req.body.clientId || '').trim()) || '';
    const room = getRoomById(roomId);
    if (!room) return res.status(404).json({ error: 'not found' });
    if (!clientId || room.ownerClientId !== clientId) return res.status(403).json({ error: 'forbidden' });

    // фильтруем
    const next = [];
    for (const r of roomIndex.values()) {
      if (r.roomId !== roomId) next.push(r);
    }
    saveRooms(next);

    // уведомления о чистке и удалении комнаты шлём на сокет-слое (оставим как есть на сервере)
    return res.status(204).end();
  });

  return router;
};
