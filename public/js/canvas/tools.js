// public/js/canvas/tools.js
// Кистевой ластик: радиус = size (world). Визуальный круг = 2*size*scale (px).
import { state } from '../state.js';
import { clamp } from '../util.js';
import { toWorld, clampPointToBoard, isInsideBoard } from './view.js';
import { drawAll } from './draw.js';

export function setTool(t){
  state.activeTool=t;
  ['pen','line','rect','ellipse','eraser','text'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle('active', t===id);
  });
  document.body.classList.toggle('eraser-on', t==='eraser');
  updateCursor();
  refreshSizePreview();
}

export function initTools(){
  document.getElementById('pen').onclick=()=>setTool('pen');
  document.getElementById('line').onclick=()=>setTool('line');
  document.getElementById('rect').onclick=()=>setTool('rect');
  document.getElementById('ellipse').onclick=()=>setTool('ellipse');
  document.getElementById('text').onclick=()=>setTool('text');
  document.getElementById('gridBtn').onclick=function(){ state.showGrid=!state.showGrid; this.classList.toggle('active', state.showGrid); drawAll(); };
  document.getElementById('eraser').onclick=function(){ setTool(state.activeTool==='eraser' ? 'pen' : 'eraser'); };
}

export function refreshSizePreview(){
  const sizePreview=document.getElementById('sizePreview');
  if(!sizePreview) return;
  sizePreview.innerHTML='';
  const val = +state.sizeEl.value || 1;
  if(state.activeTool==='text'){
    const px = Math.max(8, val*4);
    const span=document.createElement('span');
    span.className='size-text';
    span.textContent='пример';
    span.style.fontSize = px+'px';
    span.style.color = state.colorEl.value;
    span.style.opacity = .9;
    sizePreview.appendChild(span);
  } else {
    const d = Math.max(4, Math.min(48, val));
    const dot=document.createElement('span');
    dot.className='size-dot';
    dot.style.width = d+'px';
    dot.style.height = d+'px';
    dot.style.background = state.colorEl.value;
    sizePreview.appendChild(dot);
  }
}

export function updateCursor(){
  const c = state.c;
  if(state.activeTool==='eraser'){
    if(!state.lastWorld || !isInsideBoard(state.lastWorld)){ c.style.cursor='not-allowed'; return; }
    c.style.cursor='none'; // рисуем свой круг
  }else if(state.activeTool==='text'){
    c.style.cursor = (!state.lastWorld || !isInsideBoard(state.lastWorld)) ? 'not-allowed' : 'text';
  }else{
    c.style.cursor = (!state.lastWorld || !isInsideBoard(state.lastWorld)) ? 'not-allowed' : 'crosshair';
  }
}

// Нужна для импорта в main.js (подсветки/ховеры и т.п.). Оставляем как было.
export function findTargetStrokeAt(x,y,r){
  for(let i=state.strokes.length-1;i>=0;i--){
    const s=state.strokes[i];
    if(s.type==='text'){
      const px=s.font||16; const w=(s.text||'').length*px*0.6, h=px;
      if(x>=s.x && x<=s.x+w && y>=s.y && y<=s.y+h) return s;
      continue;
    }
    for(let j=1;j<s.points.length;j++){
      if(distToSegment(x,y,s.points[j-1].x,s.points[j-1].y,s.points[j].x,s.points[j].y) <= (s.size*0.6 + r)) return s;
    }
  }
  return null;
}

export function distToSegment(px,py,x1,y1,x2,y2){
  const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1; const dot=A*C+B*D,len=C*C+D*D; let t=len?dot/len:-1;
  t=Math.max(0,Math.min(1,t)); const xx=x1+C*t, yy=y1+D*t; const dx0=px-xx, dy0=py-yy; return Math.sqrt(dx0*dx0+dy0*dy0);
}
export function clampWorldPoint(p){ return { x: clamp(p.x, state.BOARD.minX, state.BOARD.maxX), y: clamp(p.y, state.BOARD.minY, state.BOARD.maxY) }; }
export function textFontPx(){ return Math.max(8, (+state.sizeEl.value||3)*4); }

export function showTextInput(clientX, clientY, worldPoint){
  window.__textInputOpen = true;
  const input=document.createElement('input');
  input.type='text'; input.placeholder='Текст'; input.id='pikso-text-input';
  input.style.position='fixed';
  const pad=8, x=Math.max(pad, Math.min(clientX, innerWidth-220)), y=Math.max(pad, Math.min(clientY, innerHeight-40));
  input.style.left=x+'px'; input.style.top=y+'px'; input.style.transform='translate(-2px,-18px)';
  input.style.padding='6px 8px'; input.style.border='1px solid '+getComputedStyle(document.body).getPropertyValue('--panel-border');
  input.style.borderRadius='8px'; input.style.background=getComputedStyle(document.body).getPropertyValue('--panel');
  input.style.color=getComputedStyle(document.body).getPropertyValue('--fg'); input.style.zIndex='9999';
  input.style.minWidth='200px'; input.style.font='14px system-ui,Segoe UI,Roboto,Arial'; input.style.boxShadow='0 8px 24px rgba(0,0,0,.15)';
  document.body.appendChild(input);
  setTimeout(()=>input.focus(),0);

  function commit(ok){
    const val=input.value;
    input.remove();
    window.__textInputOpen = false;
    if(!ok || !val) return;
    const s={ id:'txt-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), type:'text', authorId: state.clientId, color: state.colorEl.value, font: textFontPx(), text: val, x: clamp(worldPoint.x, state.BOARD.minX, state.BOARD.maxX), y: clamp(worldPoint.y, state.BOARD.minY, state.BOARD.maxY) };
    state.strokes.push(s); drawAll();
    state.socket.emit('stroke', { roomId: state.roomId, stroke: s, tempId: null });
  }
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') commit(true); if(e.key==='Escape') commit(false); });
  input.addEventListener('blur', ()=>commit(true));
}

// === КИСТЕВОЙ ЛАСТИК (эмитим только erase-circle) ===
export function eraseAt(clientX, clientY){
  const w = toWorld(clientX, clientY);
  if(!isInsideBoard(w)) return;
  const radius = (+state.sizeEl.value || 3); // world units
  if (state.socket) state.socket.emit('erase-circle', { roomId: state.roomId, x: w.x, y: w.y, radius });
}

// Визуальный кружок — экранный диаметр = 2 * radius_world * scale
let circleDiv;
function ensureCircle(){
  if(circleDiv) return circleDiv;
  circleDiv=document.createElement('div');
  circleDiv.style.position='fixed';
  circleDiv.style.pointerEvents='none';
  circleDiv.style.border='1px dashed var(--fg)';
  circleDiv.style.borderRadius='50%';
  circleDiv.style.opacity='0.85';
  circleDiv.style.zIndex='9999';
  document.body.appendChild(circleDiv);
  return circleDiv;
}
export function showBrushAt(clientX, clientY){
  if(state.activeTool!=='eraser'){ if(circleDiv) circleDiv.style.display='none'; return; }
  const radiusWorld=(+state.sizeEl.value||3);
  const d=Math.max(4, 2*radiusWorld*state.scale);
  const el=ensureCircle();
  el.style.width=d+'px'; el.style.height=d+'px';
  el.style.left=(clientX-d/2)+'px'; el.style.top=(clientY-d/2)+'px';
  el.style.display='block';
}
export function hideBrush(){ if(circleDiv) circleDiv.style.display='none'; }
