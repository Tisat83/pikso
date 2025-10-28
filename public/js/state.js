// public/js/state.js
// Centralized reactive-ish state to share across modules

export const state = {
  // DOM refs
  c: null, ctx: null,
  colorEl: null, sizeEl: null, nameEl: null,
  undoBtn: null, redoBtn: null, clearBtn: null, fitBtn: null,
  downloadBtn: null, downloadModal: null, dlOk: null, dlCancel: null,
  onlineChip: null, loginBtn: null, authModal: null, authCancel: null, authSubmit: null,
  roomsBtn: null, roomsWrap: null, roomsList: null, newBtn: null,

  // Board/view
  BOARD: { minX: 0, minY: 0, maxX: 16384, maxY: 16384 },
  scale: 1, dx: 0, dy: 0, MIN_Z: .25, MAX_Z: 5,

  // Data
  clientId: null, roomId: "demo",
  strokes: [], previews: new Map(), members: [], remoteCursors: new Map(),
  drawing: false, current: null, currentTempId: null,
  panning: false, spaceDown: false, lastPan: {x:0, y:0},
  hoverDeletable: false, hoverHasStroke: false, erasingDrag: false,
  showGrid: false, shiftDown: false,
  iAmModerator: false, moderatorsSet: new Set(),
  isOwner: false, lastWorld: null,
  activeTool: 'pen',

  // timers
  _hashTimer: null,

  // socket
  socket: null,
};
