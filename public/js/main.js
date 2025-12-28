// public/js/main.js — дополнен показом круга ластика и вызовами eraseAt при драге
import { state } from './state.js';
import { uuid, clamp, toast } from './util.js';
import { setCanvasSize, toWorld, clampViewToBoard, applyViewFromHash, scheduleHashUpdate, isInsideBoard, clampPointToBoard } from './canvas/view.js';
import { drawAll } from './canvas/draw.js';
import { initTools, setTool, refreshSizePreview, eraseAt, updateCursor, showTextInput, showBrushAt, hideBrush } from './canvas/tools.js';
import { initTheme, initDOMRefs, initIdentity, parseRoomFromURL, refreshPermissions, wireToolbar, wireRoomsList, exportPNG, exportPDFVector, fitToDrawing, resetView } from './ui/toolbar.js';
import { initSocket, sendPresence } from './net.js';

// Init
initTheme();
initDOMRefs();
initTools();
initIdentity();

state.roomId = parseRoomFromURL() || "demo";
if (!localStorage.getItem('pikso:clientId')) localStorage.setItem('pikso:clientId', uuid());
state.clientId = localStorage.getItem('pikso:clientId');

setCanvasSize();
if (!applyViewFromHash()) {
  state.scale=1; state.dx=0; state.dy=0; clampViewToBoard(); history.replaceState(null,'', location.pathname+'#0,0,1.00');
}
drawAll();
scheduleHashUpdate();

wireToolbar();
wireRoomsList();

initSocket();
sendPresence(); setTimeout(sendPresence, 80);

state.c.addEventListener('contextmenu', e=>e.preventDefault());
state._touchPts = state._touchPts || new Map();
state.touchPanning = false;

state.c.addEventListener('pointerdown', (e)=>{
  if (window.__textInputOpen) return;

  // touch: регистрируем палец; если 2 пальца — включаем pan+pinch
  if(e.pointerType==='touch' && state._touchPts){
    state._touchPts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state._touchPts.size>=2){
      const pts=[...state._touchPts.values()];
      const mid={x:(pts[0].x+pts[1].x)/2, y:(pts[0].y+pts[1].y)/2};
      const dist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);

      state.touchPanning=true;
      state.panning=true;
      state.lastPan=mid;
      state._pinchLastDist=dist;

      e.preventDefault();
      return;
    }
  }


  const isRight=e.button===2, isPan=isRight || (state.spaceDown && e.button===0);
  if(isPan){ state.panning=true; state.touchPanning=false; state.lastPan={x:e.clientX,y:e.clientY}; return; }
  if(e.button!==0) return;
  if(state.touchPanning) return;

  const w0 = toWorld(e.clientX,e.clientY);
  if(!isInsideBoard(w0)) { updateCursor(); return; }

  if(state.activeTool==='text'){
    e.preventDefault(); e.stopPropagation();
    showTextInput(e.clientX, e.clientY, w0);
    return;
  }
  if(state.activeTool==='eraser'){
    state.erasingDrag=true; state.c.setPointerCapture(e.pointerId);
    eraseAt(e.clientX, e.clientY);
    return;
  }

  const wp=clampPointToBoard(w0);
  state.drawing=true; state.c.setPointerCapture(e.pointerId);
  state.currentTempId='tmp-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  state.current={ id: state.currentTempId, authorId: state.clientId, color: state.colorEl.value, size:+state.sizeEl.value, points:[wp], __shapeStart: wp };
  drawAll();
  state.socket.emit('stroke-begin',{roomId:state.roomId,tempId:state.currentTempId,color:state.current.color,size:state.current.size,point:wp});
});

state.c.addEventListener('pointermove', (e)=>{
  // --- touch: 2 пальца = pan + pinch zoom ---
  if(e.pointerType==='touch' && state._touchPts){
    if(state._touchPts.has(e.pointerId)) state._touchPts.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(state.touchPanning){
      const pts=[...state._touchPts.values()];
      if(pts.length>=2){
        const mid={x:(pts[0].x+pts[1].x)/2, y:(pts[0].y+pts[1].y)/2};
        const dist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);

        // pan по смещению середины
        if(state.lastPan){
          state.dx += (mid.x - state.lastPan.x);
          state.dy += (mid.y - state.lastPan.y);
        }
        state.lastPan = mid;

        // pinch zoom (инкрементально)
        if(state._pinchLastDist){
          const prevScale = state.scale;
          const wx = (mid.x - state.dx) / prevScale;
          const wy = (mid.y - state.dy) / prevScale;

          const factor = dist / state._pinchLastDist;
          state.scale = Math.max(state.MIN_Z, Math.min(state.MAX_Z, prevScale * factor));

          state.dx = mid.x - wx * state.scale;
          state.dy = mid.y - wy * state.scale;
        }
        state._pinchLastDist = dist;

        clampViewToBoard(); drawAll(); scheduleHashUpdate();
      }
      e.preventDefault();
      return;
    }
  }

  // --- обычная логика (мышь / 1 палец рисование) ---
  const w=toWorld(e.clientX,e.clientY), now=performance.now();
  state.lastWorld = w; updateCursor();

  // круг ластика
  if(state.activeTool==='eraser') showBrushAt(e.clientX, e.clientY); else hideBrush();

  if(!window.__lastCursor || now-window.__lastCursor>30){
    window.__lastCursor=now;
    state.socket.emit('cursor',{roomId:state.roomId,x:clamp(w.x,state.BOARD.minX,state.BOARD.maxX),y:clamp(w.y,state.BOARD.minY,state.BOARD.maxY),visible:true,name:(state.nameEl.value||'').trim()||'Гость',color:state.colorEl.value});
  }

  if(state.panning){
    const dxs=e.clientX-state.lastPan.x,dys=e.clientY-state.lastPan.y;
    state.dx+=dxs; state.dy+=dys; state.lastPan={x:e.clientX,y:e.clientY};
    clampViewToBoard(); drawAll(); scheduleHashUpdate(); return;
  }

  if(state.activeTool==='eraser'){
    if(state.erasingDrag){ eraseAt(e.clientX, e.clientY); }
    return;
  }

  if(!state.drawing||!state.current) return;

  const a=state.current.__shapeStart||state.current.points[0];
  if(state.activeTool==='pen'){
    state.current.points.push(clampPointToBoard(w));
  } else if(state.activeTool==='line'){
    let bx=w; if(state.shiftDown){ const dx0=w.x-a.x, dy0=w.y-a.y; bx=(Math.abs(dx0)>Math.abs(dy0))?{x:w.x,y:a.y}:{x:a.x,y:w.y}; }
    state.current.points=[clampPointToBoard(a), clampPointToBoard(bx)];
  } else if(state.activeTool==='rect'){
    let rb=w;
    if(state.shiftDown){
      const s=Math.max(Math.abs(w.x-a.x), Math.abs(w.y-a.y));
      rb={x:a.x+(w.x>=a.x?s:-s), y:a.y+(w.y>=a.y?s:-s)};
    }
    const pts=[
      {x:Math.min(a.x,rb.x), y:Math.min(a.y,rb.y)},
      {x:Math.max(a.x,rb.x), y:Math.min(a.y,rb.y)},
      {x:Math.max(a.x,rb.x), y:Math.max(a.y,rb.y)},
      {x:Math.min(a.x,rb.x), y:Math.max(a.y,rb.y)},
      {x:Math.min(a.x,rb.x), y:Math.min(a.y,rb.y)}
    ];
    state.current.points=pts.map(clampPointToBoard);
  } else if(state.activeTool==='ellipse'){
    let eb=w;
    if(state.shiftDown){
      const s2=Math.max(Math.abs(w.x - a.x), Math.abs(w.y - a.y));
      eb={x:a.x+(w.x>=a.x?s2:-s2), y:a.y+(w.y>=a.y?s2:-s2)};
    }
    const cx=(a.x+eb.x)/2, cy=(a.y+eb.y)/2;
    const rx=Math.abs(eb.x-a.x)/2, ry=Math.abs(eb.y-a.y)/2;
    const seg=64; const pts=[];
    for(let i=0;i<=seg;i++){ const t=(i/seg)*Math.PI*2; pts.push(clampPointToBoard({x:cx+Math.cos(t)*rx, y:cy+Math.sin(t)*ry})); }
    state.current.points=pts;
  }

  state.socket.emit('stroke-progress',{roomId:state.roomId,tempId:state.currentTempId,points:state.current.points});
  drawAll();
});

function endStroke(){
  state.socket.emit('cursor',{roomId:state.roomId,x:0,y:0,visible:false,name:(state.nameEl.value||'').trim()||'Гость',color:state.colorEl.value});
  hideBrush();
  if(state.drawing && state.current){
    state.drawing=false;
    const finalStroke={ id: state.current.id, authorId: state.clientId, color: state.current.color, size: state.current.size, points: state.current.points };
    state.strokes.push(finalStroke);
    drawAll();
    state.socket.emit('stroke',{roomId:state.roomId, stroke: finalStroke, tempId: state.currentTempId});
    state.current=null; state.currentTempId=null;
  }
  state.panning=false;
}
state.c.addEventListener('pointerup', (e)=>{
  if (e.pointerType === 'touch' && state._touchPts) {
    state._touchPts.delete(e.pointerId);
    if (state._touchPts.size < 2) state.touchPanning = false;
  }

  state.panning = false;
  if (state.activeTool === 'eraser') { state.erasingDrag = false; hideBrush(); return; }
  endStroke();
});

state.c.addEventListener('pointercancel', (e)=>{
  if (e.pointerType === 'touch' && state._touchPts) {
    state._touchPts.delete(e.pointerId);
    if (state._touchPts.size < 2) state.touchPanning = false;
  }

  state.panning = false;
  if (state.activeTool === 'eraser') { state.erasingDrag = false; hideBrush(); return; }
  endStroke();
});

state.c.addEventListener('pointerleave', ()=>{
  if(state._touchPts) state._touchPts.clear();
  state.touchPanning=false;
  state._pinchLastDist=null;

  state.panning = false;
  state.erasingDrag=false;
  state.lastWorld=null;
  updateCursor();
  hideBrush();
  state.socket.emit('cursor',{roomId:state.roomId,x:0,y:0,visible:false,name:(state.nameEl.value||'').trim()||'Гость',color:state.colorEl.value});
});

addEventListener('wheel', function(e){
  if (window.__textInputOpen) return;
  e.preventDefault();
  const prev=state.scale;
  const f = Math.pow(1.001, -e.deltaY);
  state.scale = Math.max(state.MIN_Z, Math.min(state.MAX_Z, prev * f));
  const mx=e.clientX, my=e.clientY;
  const wx=(mx-state.dx)/prev, wy=(my-state.dy)/prev;
  state.dx = mx - wx*state.scale;
  state.dy = my - wy*state.scale;
  clampViewToBoard();
  drawAll();
  scheduleHashUpdate();
}, {passive:false});

addEventListener('keydown', function(e){
  if(e.key==='Shift') state.shiftDown=true;
  if(e.code==='Space') state.spaceDown=true;
  const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT' || tag==='TEXTAREA') return;
  if(!e.ctrlKey && !e.metaKey){
    const k=(e.key||'').toLowerCase();
    if(k==='p') setTool('pen');
    if(k==='l') setTool('line');
    if(k==='r') setTool('rect');
    if(k==='o') setTool('ellipse');
    if(k==='t') setTool('text');
    if(k==='g'){ state.showGrid=!state.showGrid; document.getElementById('gridBtn').classList.toggle('active', state.showGrid); drawAll(); }
    if(k==='0'){ resetView(); }
    if(k==='='){ const e2=new WheelEvent('wheel',{deltaY:-120}); state.c.dispatchEvent(e2); }
    if(k==='-'){ const e3=new WheelEvent('wheel',{deltaY:120}); state.c.dispatchEvent(e3); }
  }
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()==='z'){ e.preventDefault(); state.socket.emit('undo', state.roomId); }
  if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==='z'){ e.preventDefault(); state.socket.emit('redo', state.roomId); }
  if(e.key==='Delete'){ e.preventDefault(); state.socket.emit('clear', state.roomId); }
});
addEventListener('keyup', function(e){ if(e.code==='Space') state.spaceDown=false; if(e.key==='Shift') state.shiftDown=false; });

// expose for tools
window.refreshSizePreview = refreshSizePreview;
