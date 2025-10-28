const express = require('express');

// единая точка для лимитов тела/безопасности (расширим позже при необходимости)
function json() {
  return express.json({ limit: '1mb' });
}

module.exports = { json };
