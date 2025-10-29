// Рендер: таймлайн (штрихи + стирания), локальный/удалённый предпросмотр,
// курсоры (окружность + прозрачная плашка-лейбл справа-сверху) и сетка.
import { state } from '../state.js';
import { setTransform, clearScreen } from './view.js';

/* ============ helpers ============ */
function strokePath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
}

function drawText(ctx, s) {
  ctx.fillStyle = s.color || '#000';
  ctx.font = (s.font || 16) + 'px system-ui, Segoe UI, Roboto, Arial';
  ctx.textBaseline = 'top';
  ctx.fillText(s.text || '', s.x, s.y);
}

function drawStroke(ctx, s) {
  if (!s || !Array.isArray(s.points) || s.points.length < 2) return;
  strokePath(ctx, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color || '#000';
  ctx.lineWidth = Math.max(1, s.size || 1);
  ctx.stroke();
}

export function drawGrid() {
  if (!state.showGrid) return;
  const ctx = state.ctx;
  ctx.save();
  setTransform(ctx);
  const step = 50;
  ctx.beginPath();
  for (let x = state.BOARD.minX; x <= state.BOARD.maxX; x += step) {
    ctx.moveTo(x, state.BOARD.minY);
    ctx.lineTo(x, state.BOARD.maxY);
  }
  for (let y = state.BOARD.minY; y <= state.BOARD.maxY; y += step) {
    ctx.moveTo(state.BOARD.minX, y);
    ctx.lineTo(state.BOARD.maxX, y);
  }
  ctx.lineWidth = 1 / state.scale;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid');
  ctx.stroke();
  ctx.restore();
}

function hexToRGB(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return { r: 15, g: 136, b: 255 };
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}
function rgba(hex, alpha=1) {
  const {r,g,b} = hexToRGB(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ======= курсоры других пользователей: пустой кружок + прозрачная плашка вправо-вверх ======= */
function drawCursors() {
  const ctx = state.ctx;
  const curs = state.cursors || {};
  ctx.save();
  setTransform(ctx);

  for (const cid of Object.keys(curs)) {
    const c = curs[cid];
    if (!c || !c.visible) continue;

    const color = c.color || '#6C63FF';
    const outline = rgba(color, 1);

    // 1) кружок-курсор (контур в цвет, без заливки)
    const r = 4; // world units
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI*2);
    ctx.lineWidth = 2 / state.scale;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // 2) позиция бейджа: справа-вверх от точки
    ctx.save();
    ctx.font = `bold ${12 / state.scale}px system-ui, Segoe UI, Roboto, Arial`;
    ctx.textBaseline = 'middle';
    const name = (c.name || 'Гость').slice(0, 24);
    const padX = 8 / state.scale;
    const padY = 6 / state.scale;
    const textW = ctx.measureText(name).width;
    const bw = textW + padX*2;
    const bh = 20 / state.scale;
    const offsetX = 14 / state.scale;
    const offsetY = 18 / state.scale;
    const bx = c.x + offsetX;
    const by = c.y - offsetY; // вверх

    // 3) соединительная линия: из правого края круга в СЕРЕДИНУ левого края бейджа
    ctx.beginPath();
    ctx.moveTo(c.x + r, c.y);
    ctx.lineTo(bx, by + bh/2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5 / state.scale;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // 4) прозрачная капсула (только контур в цвет)
    roundRect(ctx, bx, by, bw, bh, 10 / state.scale);
    ctx.lineWidth = 1.5 / state.scale;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // 5) текст в цвет
    ctx.fillStyle = outline;
    ctx.fillText(name, bx + padX, by + bh/2);
    ctx.restore();
  }

  ctx.restore();
}

/* ============ timeline ============ */
function drawTimeline() {
  const ctx = state.ctx;
  const events = [];

  for (const s of (state.strokes || [])) {
    events.push({ type: 'stroke', t: typeof s.t === 'number' ? s.t : 0, data: s });
  }
  for (const e of (state.erases || [])) {
    events.push({ type: 'erase', t: typeof e.t === 'number' ? e.t : 0, data: e });
  }
  events.sort((a,b)=>a.t-b.t);

  ctx.save();
  setTransform(ctx);

  for (const ev of events) {
    if (ev.type === 'stroke') {
      const s = ev.data;
      if (s.type === 'text') drawText(ctx, s);
      else drawStroke(ctx, s);
    } else if (ev.type === 'erase') {
      const c = ev.data;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // локальный предпросмотр текущего штриха
  if (state.drawing && state.current && Array.isArray(state.current.points) && state.current.points.length >= 2) {
    const s = state.current;
    if (s.type === 'text') drawText(ctx, s);
    else { ctx.globalCompositeOperation = 'source-over'; drawStroke(ctx, s); }
  }

  // удалённые предпросмотры
  const temps = state.remoteTemps || {};
  for (const tid of Object.keys(temps)) {
    const t = temps[tid];
    if (!t || !Array.isArray(t.points) || t.points.length < 2) continue;
    ctx.globalCompositeOperation = 'source-over';
    drawStroke(ctx, t);
  }

  ctx.restore();
}

export function drawAll() {
  clearScreen();
  drawTimeline();
  drawGrid();
  drawCursors();  // курсоры с прозрачными бейджами
}
