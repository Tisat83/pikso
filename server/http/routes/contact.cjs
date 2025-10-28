const express = require('express');

module.exports = function contactRouter({ appendFeedback, getClientIp }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const body = req.body || {};
    const s = v => String(v || '').trim();

    let name = s(body.name).slice(0, 120);
    let email = s(body.email).slice(0, 200);
    let message = s(body.message).slice(0, 4000);

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'invalid' });
    }
    if (email.length < 3 || !email.includes('@')) {
      return res.status(400).json({ error: 'email' });
    }

    const entry = {
      ts: new Date().toISOString(),
      ip: getClientIp(req),
      ua: req.headers['user-agent'] || '',
      name,
      email,
      message
    };

    const ok = appendFeedback(entry);
    if (!ok) return res.status(500).json({ error: 'persist-failed' });
    return res.status(202).json({ ok: true, mail: false });
  });

  return router;
};
