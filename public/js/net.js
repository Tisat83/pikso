// Socket.IO + состояние. Курсоры, превью чужих штрихов, erase-circle,
// и виджет "глазик" с поповером списка участников (с точным показом самого себя).
import { state } from './state.js';
import { drawAll } from './canvas/draw.js';

/* ======================= Presence UI (eye + popover) ======================= */
function ensurePresenceEye() {
  let el = document.getElementById('presenceEye');
  if (el) return el;

  el = document.createElement('button');
  el.id = 'presenceEye';
  el.type = 'button';
  el.style.position = 'fixed';
  el.style.right = '12px';
  el.style.bottom = '12px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.gap = '8px';
  el.style.padding = '6px 10px';
  el.style.background = 'white';
  el.style.color = '#0b1220';
  el.style.border = '1px solid rgba(0,0,0,.12)';
  el.style.borderRadius = '999px';
  el.style.boxShadow = '0 8px 20px rgba(0,0,0,.08)';
  el.style.font = '13px/1 system-ui, Segoe UI, Roboto, Arial';
  el.style.userSelect = 'none';
  el.style.cursor = 'pointer';
  el.style.zIndex = '99999';

  el.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    '<path d="M12 5c5.5 0 9.5 4.5 10.5 6-1 1.5-5 6-10.5 6S2.5 12.5 1.5 11C2.5 9.5 6.5 5 12 5Z" ' +
    'stroke="#0b1220" stroke-width="1.5" fill="none"/>' +
    '<circle cx="12" cy="11" r="3" fill="#0b1220"/></svg>' +
    '<span id="presenceCount">0</span>';

  document.body.appendChild(el);
  return el;
}

function ensurePresencePanel() {
  let panel = document.getElementById('presencePanel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'presencePanel';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '52px'; // над глазиком
  panel.style.minWidth = '160px';
  panel.style.maxWidth = '260px';
  panel.style.padding = '8px 10px';
  panel.style.background = 'white';
  panel.style.color = '#0b1220';
  panel.style.border = '1px solid rgba(0,0,0,.12)';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 12px 28px rgba(0,0,0,.12)';
  panel.style.font = '13px/1.35 system-ui, Segoe UI, Roboto, Arial';
  panel.style.zIndex = '99999';
  panel.style.display = 'none';

  const list = document.createElement('div');
  list.id = 'presenceList';
  list.style.display = 'grid';
  list.style.gridTemplateColumns = 'auto 1fr';
  list.style.rowGap = '8px';
  list.style.columnGap = '8px';
  panel.appendChild(list);

  document.body.appendChild(panel);
  return panel;
}

function updatePresenceEyeAndPanel() {
  const eye = ensurePresenceEye();
  const panel = ensurePresencePanel();
  const countEl = eye.querySelector('#presenceCount');

  // Берём список от сервера и подменяем свою запись актуальным именем/цветом
  const members = (state.members || []).map(m => (m ? { ...m } : {}));
  const myName = (state.nameEl && state.nameEl.value || 'Гость').trim() || 'Гость';
  const myColor = state.colorEl ? state.colorEl.value : '#0F8FFF';
  for (const m of members) {
    if (m && m.clientId === state.clientId) {
      m.name = myName;
      m.color = myColor;
    }
  }
  const count = members.length;

  countEl.textContent = String(count);
  eye.style.display = count > 0 ? 'flex' : 'none';

  // перерисовать список
  const list = panel.querySelector('#presenceList');
  list.innerHTML = '';
  for (const m of members) {
    const dot = document.createElement('span');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.marginTop = '6px';
    dot.style.background = m.color || '#0F8FFF';

    const name = document.createElement('div');
    name.textContent = (m.name || 'Гость');
    name.style.whiteSpace = 'nowrap';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';

    list.appendChild(dot);
    list.appendChild(name);
  }

  // hover / click поведение
  let hideTimer = null;
  const open = ()=>{ panel.style.display = members.length ? 'block' : 'none'; };
  const close = ()=>{ panel.style.display = 'none'; };

  eye.onmouseenter = ()=>{ clearTimeout(hideTimer); open(); };
  eye.onmouseleave = ()=>{ hideTimer = setTimeout(close, 200); };
  panel.onmouseenter = ()=>{ clearTimeout(hideTimer); };
  panel.onmouseleave = ()=>{ hideTimer = setTimeout(close, 200); };
  eye.onclick = ()=>{ panel.style.display = (panel.style.display==='block'?'none':'block'); };
}

/* ======================= Socket wiring ======================= */
function emitPresenceNow() {
  if (!state.socket) return;
  const name = (state.nameEl && state.nameEl.value || '').trim() || 'Гость';
  const color = state.colorEl ? state.colorEl.value : '#0F8FFF';
  state.socket.emit('presence', { roomId: state.roomId, name, color });
}

export function initSocket() {
  // eslint-disable-next-line no-undef
  const socket = io({ transports: ['websocket'] });
  state.socket = socket;

  state.cursors = {};      // { clientId: {x,y,visible,color,name} }
  state.remoteTemps = {};  // { tempId: { color, size, points: [...] } }

  socket.on('connect', () => {
    socket.emit('join', { roomId: state.roomId, clientId: state.clientId });
    // сразу отправим presence (исправляет "два Гость" и отсутствие себя)
    setTimeout(emitPresenceNow, 10);
  });

  socket.on('init', (payload) => {
    state.strokes = payload.strokes || [];
    state.erases  = payload.erases  || [];
    state.ownerClientId = payload.ownerClientId || null;
    state.moderators = payload.moderators || [];
    state.members = payload.members || [];
    // Повторно отправим presence, когда DOM refs точно готовы
    setTimeout(emitPresenceNow, 30);
    updatePresenceEyeAndPanel();
    drawAll();
  });

  socket.on('members', (list) => {
    state.members = list || [];
    updatePresenceEyeAndPanel();
    drawAll();
  });

  socket.on('cursor', (msg) => {
    if (!msg || !msg.clientId) return;
    if (msg.clientId === state.clientId) return; // свой курсор не рисуем
    state.cursors[msg.clientId] = msg;
    drawAll();
  });

  // === Превью штрихов других пользователей
  socket.on('stroke-begin', (msg) => {
    if (!msg || !msg.tempId) return;
    if (msg.clientId && msg.clientId === state.clientId) return;
    state.remoteTemps[msg.tempId] = {
      color: msg.color || '#000',
      size:  Math.max(1, +msg.size || 1),
      points: [msg.point].filter(Boolean)
    };
    drawAll();
  });

  socket.on('stroke-progress', (msg) => {
    if (!msg || !msg.tempId) return;
    const t = state.remoteTemps[msg.tempId];
    if (!t) return;
    if (Array.isArray(msg.points) && msg.points.length) t.points = msg.points;
    drawAll();
  });

  socket.on('stroke-finish', (msg) => {
    if (!msg || !msg.tempId) return;
    delete state.remoteTemps[msg.tempId];
    drawAll();
  });

  // === Финальные штрихи
  socket.on('stroke', (stroke) => {
    state.strokes.push(stroke);
    drawAll();
  });

  socket.on('stroke-deleted', (id) => {
    state.strokes = state.strokes.filter(s => s.id !== id);
    drawAll();
  });

  socket.on('stroke-restored', (stroke) => {
    state.strokes.push(stroke);
    drawAll();
  });

  // === Пиксельный ластик
  socket.on('erase-circle', (circle) => {
    state.erases = state.erases || [];
    state.erases.push(circle);
    drawAll();
  });

  socket.on('cleared', () => {
    state.strokes = [];
    state.erases  = [];
    state.remoteTemps = {};
    drawAll();
    updatePresenceEyeAndPanel();
    setTimeout(emitPresenceNow, 10);
  });

  // кнопки/инпуты меняют имя/цвет — сразу шлём presence и обновляем список
  if (state.nameEl) state.nameEl.addEventListener('input', () => { emitPresenceNow(); updatePresenceEyeAndPanel(); });
  if (state.colorEl) state.colorEl.addEventListener('input', () => { emitPresenceNow(); updatePresenceEyeAndPanel(); });

  // первый рендер компонентов
  updatePresenceEyeAndPanel();
  addEventListener('resize', updatePresenceEyeAndPanel);
}

export function sendPresence() {
  emitPresenceNow();
}
