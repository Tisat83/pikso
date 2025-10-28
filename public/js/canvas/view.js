// public/js/canvas/view.js
import { state } from '../state.js';
import { getDPR, clamp } from '../util.js';
import { drawAll } from './draw.js';

export function isInsideBoard(p){ const B=state.BOARD; return p.x>=B.minX && p.x<=B.maxX && p.y>=B.minY && p.y<=B.maxY; }
export function clampPointToBoard(p){ const B=state.BOARD; p.x = clamp(p.x, B.minX, B.maxX); p.y = clamp(p.y, B.minY, B.maxY); return p; }

export function clampViewToBoard(){
  const B=state.BOARD, w=innerWidth, h=innerHeight, s=state.scale;
  const minDx = w - (B.maxX - B.minX) * s;
  const maxDx = -B.minX * s;
  const minDy = h - (B.maxY - B.minY) * s;
  const maxDy = -B.minY * s;
  state.dx = clamp(state.dx, minDx, maxDx);
  state.dy = clamp(state.dy, minDy, maxDy);
}

export function setTransform(){ const dpr=getDPR(); state.ctx.setTransform(dpr*state.scale,0,0,dpr*state.scale,state.dx*dpr,state.dy*dpr); }
export function clearScreen(){ const dpr=getDPR(); state.ctx.setTransform(dpr,0,0,dpr,0,0); state.ctx.clearRect(0,0,state.c.width,state.c.height); }
export function setCanvasSize(){ const dpr=getDPR(), w=innerWidth, h=innerHeight; state.c.width=Math.floor(w*dpr); state.c.height=Math.floor(h*dpr); state.c.style.width=w+'px'; state.c.style.height=h+'px'; }
export function toWorld(x,y){ return { x:(x-state.dx)/state.scale, y:(y-state.dy)/state.scale }; }

export function updateHashNow(){
  const tlx = Math.round(-state.dx/state.scale);
  const tly = Math.round(-state.dy/state.scale);
  const hash='#'+tlx+','+tly+','+state.scale.toFixed(2);
  if(location.hash!==hash) history.replaceState(null,'', location.pathname+hash);
}
export function scheduleHashUpdate(){ clearTimeout(state._hashTimer); state._hashTimer=setTimeout(updateHashNow,120); }
export function applyViewFromHash(){
  const m=(location.hash||'').match(/^#(-?\d+),(-?\d+),(\d+(?:\.\d+)?)/);
  if(!m) return false;
  const sc=parseFloat(m[3]||'1');
  state.scale = clamp(sc, state.MIN_Z, state.MAX_Z);
  state.dx = -(+m[1]||0) * state.scale;
  state.dy = -(+m[2]||0) * state.scale;
  clampViewToBoard();
  return true;
}

export function fitCanvas(){ setCanvasSize(); clampViewToBoard(); drawAll(); }
addEventListener('resize', ()=>{ fitCanvas(); scheduleHashUpdate(); });
