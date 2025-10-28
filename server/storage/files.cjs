// server/storage/files.cjs
// Centralized persistence for Pikso (rooms.json + feedback.jsonl).
const fs = require('fs');
const path = require('path');

module.exports = function createStorage({ DATA_DIR }) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
  const FEED_FILE  = path.join(DATA_DIR, 'feedback.jsonl');
  let saveTimer = null;

  function loadRooms() {
    try {
      const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
      const json = JSON.parse(raw);
      if (!json || !Array.isArray(json.rooms)) throw new Error('bad format');
      return json.rooms;
    } catch (e) {
      return [{ roomId: 'demo', ownerClientId: 'demo', strokes: [], moderators: [] }];
    }
  }

  function saveRooms(rooms, immediate = false) {
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

  function appendFeedback(entry) {
    try {
      fs.appendFileSync(FEED_FILE, JSON.stringify(entry) + '\n', 'utf8');
      return true;
    } catch (e) {
      console.error('[feedback] append error:', e);
      return false;
    }
  }

  return { loadRooms, saveRooms, appendFeedback };
};
