// public/js/canvas/draw.js
import { state } from '../state.js';
import { getDPR } from '../util.js';
import { clampViewToBoard, setTransform, clearScreen } from './view.js';

export function drawGrid(){
  const step=50, vw=innerWidth/state.scale, vh=innerHeight/state.scale, ox=-state.dx/state.scale, oy=-state.dy/state.scale;
  const startX=Math.floor(ox/step)*step - step*2;
  const startY=Math.floor(oy/step)*step - step*2;
  const endX=ox + vw + step*2;
  const endY=oy + vh + step*2;
  const ctx=state.ctx;
  ctx.save();
  ctx.lineWidth = (1/state.scale);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid').trim() || '#e5e7eb';
  ctx.beginPath();
  for(let x=startX;x<=endX;x+=step){ ctx.moveTo(x,startY); ctx.lineTo(x,endY); }
  for(let y=startY;y<=endY;y+=step){ ctx.moveTo(startX,y); ctx.lineTo(endX,y); }
  ctx.stroke();
  ctx.setLineDash([8/state.scale,8/state.scale]); ctx.lineWidth=2/state.scale; ctx.strokeStyle='rgba(15,143,255,0.5)';
  const B=state.BOARD;
  ctx.strokeRect(B.minX, B.minY, B.maxX-B.minX, B.maxY-B.minY);
  ctx.restore();
}

export function drawStroke(s){
  const ctx=state.ctx;
  if(s.type==='text'){
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha=1;
    const px = s.font || Math.max(8, (+state.sizeEl.value||3)*4);
    ctx.font = (px/state.scale)+'px system-ui,Segoe UI,Roboto,Arial';
    ctx.fillStyle = s.color || '#000';
    ctx.textBaseline = 'top';
    ctx.fillText(s.text||'', s.x, s.y);
    ctx.restore();
    return;
  }
  ctx.lineJoin=ctx.lineCap='round';
  ctx.strokeStyle=s.color;
  ctx.lineWidth=s.size/state.scale;
  ctx.beginPath();
  for(let i=0;i<s.points.length;i++){
    const p=s.points[i];
    if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
  }
  ctx.stroke();
}

export function drawAll(){
  clearScreen(); setTransform();
  if(state.showGrid) drawGrid();
  for(let si=0; si<state.strokes.length; si++){ drawStroke(state.strokes[si]); }
  if(state.current && state.current.points && state.current.points.length>0 && state.current.type!=='text'){
    const ctx=state.ctx;
    ctx.setLineDash([]); ctx.globalAlpha=1; ctx.lineJoin=ctx.lineCap='round'; ctx.strokeStyle=state.current.color; ctx.lineWidth=state.current.size/state.scale;
    ctx.beginPath(); const ptsC=state.current.points; ctx.moveTo(ptsC[0].x, ptsC[0].y); for(let k=1;k<ptsC.length;k++){ const cp=ptsC[k]; ctx.lineTo(cp.x,cp.y);} ctx.stroke();
  }
  state.previews.forEach(function(pv){
    if(!pv || pv.points.length<2) return;
    const ctx=state.ctx;
    ctx.setLineDash([6,6]); ctx.globalAlpha=.9; ctx.lineJoin=ctx.lineCap='round'; ctx.strokeStyle=pv.color; ctx.lineWidth=pv.size/state.scale;
    ctx.beginPath(); const pts=pv.points; ctx.moveTo(pts[0].x,pts[0].y); for(let j=1;j<pts.length;j++){ const q=pts[j]; ctx.lineTo(q.x,q.y);} ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
  });
  state.remoteCursors.forEach(function(cur,cid){
    if(!cur||!cur.visible) return; const ctx=state.ctx; ctx.save(); const rr=6/state.scale; ctx.lineWidth=1/state.scale; ctx.strokeStyle=cur.color||'#111';
    ctx.beginPath(); ctx.arc(cur.x,cur.y,rr,0,Math.PI*2); ctx.stroke();
    const tx=cur.x+10/state.scale, ty=cur.y-10/state.scale; ctx.beginPath(); ctx.moveTo(cur.x+rr/2,cur.y-rr/2); ctx.lineTo(tx,ty); ctx.stroke();
    const label=(cur.name||'Гость')+(state.moderatorsSet.has(cid)?' ★':''); ctx.font=(12/state.scale)+'px system-ui,Segoe UI,Roboto,Arial';
    const w=ctx.measureText(label).width; const pad=6/state.scale, h=16/state.scale; ctx.fillStyle=cur.color||'#111'; ctx.fillRect(tx,ty-h,w+pad*2,h); ctx.fillStyle='#fff'; ctx.fillText(label, tx+pad, ty-h/2+4/state.scale);
    ctx.restore();
  });
}
