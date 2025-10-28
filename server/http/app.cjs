const path = require('path');
const express = require('express');
const limits = require('./middleware/limits.cjs');

module.exports = function createApp({ PUBLIC_DIR, getRoomsCount }) {
  const app = express();

  // лимиты и JSON-парсер через отдельный middleware
  app.use(limits.json());

  // корневая
  app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
  });

  // статика без index.html как автоиндекса
  app.use(express.static(PUBLIC_DIR, { index: false }));

  // SPA-доска
  app.get(['/canvas', '/canvas/:id'], (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // health
  app.get('/health', (req, res) => res.json({ ok: true, rooms: getRoomsCount() }));

  return app;
};
