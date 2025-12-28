// public/js/ui/toolbar.js
import { state } from '../state.js';
import { toast, downloadBlob, hexToRgb } from '../util.js';
import { getDPR } from '../util.js';
import { drawAll } from '../canvas/draw.js';
import { clamp } from '../util.js';
import { clampViewToBoard, setCanvasSize, toWorld, fitCanvas, scheduleHashUpdate } from '../canvas/view.js';
import { setTool, refreshSizePreview, eraseAt, findTargetStrokeAt, textFontPx, updateCursor } from '../canvas/tools.js';

export function initTheme(){
  const themeBtn=document.getElementById('themeBtn');
  const pref=localStorage.getItem('pikso:theme')||'light';
  if(pref==='dark') document.body.classList.add('dark');
  themeBtn.addEventListener('click', ()=>{
    document.body.classList.toggle('dark');
    localStorage.setItem('pikso:theme', document.body.classList.contains('dark')?'dark':'light');
  });
}

export function initDOMRefs(){
  state.c=document.getElementById('c'); state.ctx=state.c.getContext('2d');
  state.colorEl=document.getElementById('color'); state.sizeEl=document.getElementById('size'); state.nameEl=document.getElementById('name');
  state.undoBtn=document.getElementById('undo'); state.redoBtn=document.getElementById('redo'); state.clearBtn=document.getElementById('clear');
  state.fitBtn=document.getElementById('fit');
  state.downloadBtn=document.getElementById('downloadBtn'); state.downloadModal=document.getElementById('downloadModal');
  state.dlOk=document.getElementById('dlOk'); state.dlCancel=document.getElementById('dlCancel');
  state.onlineChip=document.getElementById('onlineChip');
  state.loginBtn=document.getElementById('loginBtn'); state.authModal=document.getElementById('authModal');
  state.authCancel=document.getElementById('authCancel'); state.authSubmit=document.getElementById('authSubmit');
  state.roomsWrap=document.getElementById('roomsWrap');
  state.roomsBtn=document.getElementById('roomsBtn');
  state.roomsList=document.getElementById('roomsList');
  state.newBtn=document.getElementById('newPrivate');


  // mobile toolbar toggle + swipe
  state.toolbarEl = document.getElementById('toolbar');
  state.tbHandle = document.getElementById('tbHandle');

  const setCollapsed = (collapsed)=>{
    document.body.classList.toggle('tb-collapsed', !!collapsed);
    localStorage.setItem('pikso:tbCollapsed', collapsed ? '1' : '0');
    if(state.tbHandle) state.tbHandle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };

  // initial
  setCollapsed(localStorage.getItem('pikso:tbCollapsed') === '1');

  // tap on handle
  if(state.tbHandle){
    state.tbHandle.addEventListener('click', ()=>{
      setCollapsed(!document.body.classList.contains('tb-collapsed'));
    });
  }

  // swipe LEFT on toolbar to hide
  if(state.toolbarEl){
    let sx=0, sy=0, tracking=false;

    state.toolbarEl.addEventListener('pointerdown', (e)=>{
      if(e.pointerType!=='touch') return;
      tracking=true; sx=e.clientX; sy=e.clientY;
    }, {passive:true});

    state.toolbarEl.addEventListener('pointermove', (e)=>{
      if(!tracking || e.pointerType!=='touch') return;
      const dx=e.clientX - sx, dy=e.clientY - sy;
      if(dx < -40 && Math.abs(dx) > Math.abs(dy) + 10){
        tracking=false;
        setCollapsed(true);
      }
    }, {passive:true});

    state.toolbarEl.addEventListener('pointerup', ()=>{ tracking=false; }, {passive:true});
    state.toolbarEl.addEventListener('pointercancel', ()=>{ tracking=false; }, {passive:true});
  }

  // swipe RIGHT from left edge to show
  let edgeTrack=false, esx=0, esy=0;
  document.addEventListener('pointerdown', (e)=>{
    if(e.pointerType!=='touch') return;
    if(!document.body.classList.contains('tb-collapsed')) return;
    if(e.clientX > 24) return; // только от левого края
    edgeTrack=true; esx=e.clientX; esy=e.clientY;
  }, {passive:true});

  document.addEventListener('pointermove', (e)=>{
    if(!edgeTrack || e.pointerType!=='touch') return;
    const dx=e.clientX - esx, dy=e.clientY - esy;
    if(dx > 45 && Math.abs(dx) > Math.abs(dy) + 10){
      edgeTrack=false;
      setCollapsed(false);
    }
  }, {passive:true});

  document.addEventListener('pointerup', ()=>{ edgeTrack=false; }, {passive:true});
  document.addEventListener('pointercancel', ()=>{ edgeTrack=false; }, {passive:true});
}


export function initIdentity(){
  state.nameEl.value=localStorage.getItem('pikso:name')||'';
  state.colorEl.value=localStorage.getItem('pikso:color')||'#0F8FFF';
  state.clientId=(function(){ let id=localStorage.getItem("pikso:clientId"); if(!id){ id=crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); localStorage.setItem("pikso:clientId", id);} return id; })();
}

export function parseRoomFromURL(){
  const m=(location.pathname||'').match(/^\/canvas\/([^\/?#]+)/);
  if(m && m[1]) return decodeURIComponent(m[1]);
  if(location.hash && /^(#r-|#demo)/.test(location.hash)) return location.hash.slice(1);
  return null;
}

export function refreshPermissions(){ if(state.clearBtn){ const allowed=state.iAmModerator||state.isOwner; state.clearBtn.disabled=!allowed; state.clearBtn.title=allowed?'Очистить холст':'Только модератор или владелец'; } }

export function wireToolbar(){
  state.nameEl.addEventListener('input', ()=>{ localStorage.setItem('pikso:name', (state.nameEl.value||'').trim()); });
  state.colorEl.addEventListener('change', function(){ localStorage.setItem('pikso:color', state.colorEl.value); refreshSizePreview(); });

  // size popover
  const sizeBtn=document.getElementById('sizeBtn');
  const sizePopover=document.getElementById('sizePopover');
  if(sizePopover && sizePopover.parentElement !== document.body) document.body.appendChild(sizePopover);
  const sizeRange=state.sizeEl;
  const sizeVal=document.getElementById('sizeVal');
  const sizePreview=document.getElementById('sizePreview');
  sizeVal.textContent=(+sizeRange.value||1);
  function positionSizePopover(){
    const r = sizeBtn.getBoundingClientRect();
    const pad = 10;
    const w = sizePopover.offsetWidth || 220;
    const h = sizePopover.offsetHeight || 160;

    let left = r.right + 10;
    let top  = Math.round(r.top);

    // если справа не влазит — показываем слева
    if(left + w > window.innerWidth - pad){
      left = Math.max(pad, r.left - 10 - w);
    }
    // не вылезаем за низ/верх
    top = Math.min(window.innerHeight - pad - h, Math.max(pad, top));

    sizePopover.style.left = left + 'px';
    sizePopover.style.top  = top + 'px';
  }

  sizeBtn.addEventListener('click', (e)=>{
    const willOpen = (sizePopover.style.display !== 'block');
    sizePopover.style.display = willOpen ? 'block' : 'none';
    if(willOpen){
      refreshSizePreview();
      // дать браузеру посчитать размеры popover
      requestAnimationFrame(()=>{ positionSizePopover(); });
    }
    e.stopPropagation();
  });

  document.addEventListener('click', (e)=>{
    if(sizePopover.style.display==='block' && !sizePopover.contains(e.target) && e.target!==sizeBtn){
      sizePopover.style.display='none';
    }
  });

  // если открыто — при скролле/ресайзе перепозиционируем
  const tbEl = document.getElementById('toolbar');
  window.addEventListener('resize', ()=>{ if(sizePopover.style.display==='block') positionSizePopover(); }, {passive:true});
  if(tbEl) tbEl.addEventListener('scroll', ()=>{ if(sizePopover.style.display==='block') positionSizePopover(); }, {passive:true});

  sizeRange.addEventListener('input', function(){ sizeVal.textContent=(+this.value||1); refreshSizePreview(); });

  // actions & shortcuts
  state.undoBtn.addEventListener('click', ()=>{ state.socket.emit('undo', state.roomId); });
  state.redoBtn.addEventListener('click', ()=>{ state.socket.emit('redo', state.roomId); });
  state.clearBtn.addEventListener('click', ()=>{ state.socket.emit('clear', state.roomId); });
  state.fitBtn.onclick=function(){ if(!window.__fitToggle){ fitToDrawing(); window.__fitToggle=true; } else { resetView(); window.__fitToggle=false; } };

  document.getElementById('shareBtn').addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(location.href); toast('Ссылка скопирована'); }
    catch(e){ prompt('Скопируйте ссылку вручную:', location.href); }
  });
  state.dlCancel.addEventListener('click', ()=>{ state.downloadModal.classList.remove('show'); });
  state.downloadBtn.addEventListener('click', ()=>{ state.downloadModal.classList.add('show'); });
  state.dlOk.addEventListener('click', function(){
    const fmt=[...document.querySelectorAll('#downloadModal input[name="fmt"]')].find(x=>x.checked)?.value||'png';
    state.downloadModal.classList.remove('show'); if(fmt==='png') exportPNG(); else exportPDFVector();
  });

  state.loginBtn.addEventListener('click', ()=>state.authModal.classList.add('show'));
  state.authCancel.addEventListener('click', ()=>state.authModal.classList.remove('show'));
  state.authSubmit.addEventListener('click', ()=>{ state.authModal.classList.remove('show'); toast('Вход/регистрация скоро'); });
  document.getElementById('helpBtn').addEventListener('click', ()=>document.getElementById('helpModal').classList.add('show'));
  document.getElementById('helpOk').addEventListener('click', ()=>document.getElementById('helpModal').classList.remove('show'));
}

export function niceConfirm(text){
  return new Promise(function(resolve){
    const m=document.getElementById('confirmModal');
    const t=document.getElementById('confirmText');
    const ok=document.getElementById('confirmOk');
    const cancel=document.getElementById('confirmCancel');
    t.textContent=text||'Вы уверены?';
    m.classList.add('show');
    function close(v){ m.classList.remove('show'); ok.onclick=null; cancel.onclick=null; document.removeEventListener('keydown', onKey); resolve(v); }
    function onKey(e){ if(e.key==='Escape') close(false); if(e.key==='Enter') close(true); }
    ok.onclick=function(){ close(true); };
    cancel.onclick=function(){ close(false); };
    setTimeout(function(){ document.addEventListener('keydown', onKey); }, 0);
  });
}

export function addMyRoomLocal(id){ const key='pikso:myRooms'; let arr=[]; try{arr=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){} if(!arr.includes(id)){arr.unshift(id); localStorage.setItem(key, JSON.stringify(arr.slice(0,100)));} }
export function removeMyRoomLocal(id){ const key='pikso:myRooms'; let arr=[]; try{arr=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){} arr=arr.filter(x=>x!==id); localStorage.setItem(key, JSON.stringify(arr)); }
export function getMyRoomsLocal(){ try{ return JSON.parse(localStorage.getItem('pikso:myRooms')||'[]'); }catch(e){ return []; } }
export async function fetchMyRoomsServer(){ try{ const r=await fetch('/api/rooms?ownerClientId='+encodeURIComponent(state.clientId)); if(!r.ok) return []; const d=await r.json(); return (d.rooms||[]).map(x=>x.roomId);}catch(e){return [];} }

export async function refreshRoomsList(){
  const local=getMyRoomsLocal(); const server=await fetchMyRoomsServer(); const merged=Array.from(new Set([].concat(server, local)));
  state.roomsList.innerHTML=''; if(merged.length===0){ const empty=document.createElement('div'); empty.style.opacity='.7'; empty.style.padding='6px 8px'; empty.textContent='Пока нет приватных страниц'; state.roomsList.appendChild(empty); return; }
  merged.forEach(function(id){
    const row=document.createElement('div'); row.className='roomRow';
    const left=document.createElement('div'); left.innerHTML='<div><b>/'+id+'</b></div><div class="roomId">#'+id+'</div>';
    const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px'; actions.style.alignItems='center';
    const openBtn=document.createElement('button'); openBtn.className='btn'; openBtn.textContent='Открыть'; openBtn.onclick=function(ev){ ev.stopPropagation(); location.href='/canvas/'+id+(location.hash||''); };
    const delBtn=document.createElement('button'); delBtn.type='button'; delBtn.className='roomDelBtn'; delBtn.title='Удалить страницу'; delBtn.setAttribute('data-room-id', id);
    delBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';
    actions.appendChild(openBtn); actions.appendChild(delBtn); row.appendChild(left); row.appendChild(actions); state.roomsList.appendChild(row);
  });
}

export function wireRoomsList(){
  state.roomsList.addEventListener('click', async function(e){
    const btn = e.target.closest && e.target.closest('.roomDelBtn');
    if(!btn) return; e.stopPropagation();
    const id = btn.getAttribute('data-room-id');
    const ok = await niceConfirm('Удалить страницу /'+id+'?'); if(!ok) return;
    try{
      const r = await fetch('/api/rooms/'+encodeURIComponent(id), {
        method:'DELETE', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ clientId: state.clientId })
      });
      if(r.status===204){ removeMyRoomLocal(id); toast('Страница удалена'); refreshRoomsList(); }
      else if(r.status===403){ toast('Удалять может только владелец'); }
      else if(r.status===404){ toast('Страница не найдена'); removeMyRoomLocal(id); refreshRoomsList(); }
      else { toast('Не удалось удалить'); }
    }catch(_){ toast('Ошибка соединения'); }
  });

  state.newBtn.addEventListener('click', async function(){ try{ const r=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId: state.clientId})}); if(!r.ok) throw 0; const data=await r.json(); addMyRoomLocal(data.roomId); location.href='/canvas/'+data.roomId+'#0,0,1.00'; }catch(e){ alert('Не удалось создать страницу'); } });
  // ВЫНОСИМ список страниц в body, чтобы он не резался панелью и не прятался за холстом (особенно на мобиле)
  if(state.roomsList && state.roomsList.parentElement !== document.body) document.body.appendChild(state.roomsList);

  state.roomsBtn.addEventListener('click', function(e){
    e.stopPropagation();

    const isOpen = (state.roomsList.style.display === 'block');
    state.roomsList.style.display = isOpen ? 'none' : 'block';

    if(!isOpen){
      // позиционируем рядом с кнопкой
      const r = state.roomsBtn.getBoundingClientRect();
      const pad = 10;
      const w = 280;
      const h = Math.min(window.innerHeight * 0.5, 360);

      let left = r.right + 10;
      let top  = r.top;

      if(left + w > window.innerWidth - pad) left = Math.max(pad, r.left - 10 - w);
      top = Math.min(window.innerHeight - pad - h, Math.max(pad, top));

      state.roomsList.style.left = left + 'px';
      state.roomsList.style.top  = top + 'px';
      state.roomsList.style.maxHeight = h + 'px';

      refreshRoomsList();
    }
  });

  document.addEventListener('click', function(){
    state.roomsList.style.display = 'none';
  });

}

// Export functions kept identical
export function computeBounds(pad){
  pad=pad||16;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=Infinity*-1;
  for(let i=0;i<state.strokes.length;i++){
    const s=state.strokes[i];
    if(s.type==='text'){
      const px=s.font||16; const w=(s.text||'').length*px*0.6; const h=px;
      const pts=[{x:s.x,y:s.y},{x:s.x+w,y:s.y+h}];
      for(let t=0;t<pts.length;t++){ const p=pts[t]; if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
      continue;
    }
    for(let j=0;j<s.points.length;j++){ const p=s.points[j]; if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
  }
  if(!isFinite(minX)) return null;
  return {x:minX-pad,y:minY-pad,w:(maxX-minX)+pad*2,h:(maxY-minY)+pad*2};
}

export function exportPNG(){
  const bbox=computeBounds(24);
  const off=document.createElement('canvas'), octx=off.getContext('2d');
  if(!bbox){
    off.width=Math.max(1,Math.round(innerWidth)); off.height=Math.max(1,Math.round(innerHeight));
    octx.fillStyle=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#fff'; octx.fillRect(0,0,off.width,off.height);
    off.toBlob(b=>downloadBlob(b,'pikso-export.png'),'image/png'); return;
  }
  const scaleOut=2;
  off.width=Math.max(1,Math.round(bbox.w*scaleOut)); off.height=Math.max(1,Math.round(bbox.h*scaleOut));
  octx.fillStyle=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#fff'; octx.fillRect(0,0,off.width,off.height);
  octx.setTransform(scaleOut,0,0,scaleOut,-bbox.x*scaleOut,-bbox.y*scaleOut);
  for(let si=0;si<state.strokes.length;si++){
    const s=state.strokes[si];
    if(s.type==='text'){
      const px=s.font||16;
      octx.font = px+'px system-ui,Segoe UI,Roboto,Arial';
      octx.fillStyle = s.color||'#000';
      octx.textBaseline='top';
      octx.fillText(s.text||'', s.x, s.y);
      continue;
    }
    octx.lineJoin=octx.lineCap='round'; octx.strokeStyle=s.color; octx.lineWidth=s.size;
    octx.beginPath(); for(let i=0;i<s.points.length;i++){ const p=s.points[i]; if(i===0) octx.moveTo(p.x,p.y); else octx.lineTo(p.x,p.y);} octx.stroke();
  }
  off.toBlob(b=>downloadBlob(b,'pikso-export.png'),'image/png');
}

export function exportPDFVector(){
  const bbox=computeBounds(24);
  const pdf=new window.jspdf.jsPDF({orientation:bbox&&((bbox.w/bbox.h)>(595.28/841.89))?'landscape':'portrait', unit:'pt', format:'a4'});
  const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight(), margin=36;
  if(!bbox){
    pdf.setFontSize(12); pdf.text('Pikso — пустая страница', margin, margin+12);
    const blob0=pdf.output('blob'); downloadBlob(blob0,'pikso-export.pdf'); return;
  }
  const maxW=pageW-margin*2, maxH=pageH-margin*2; const s=Math.min(maxW/bbox.w, maxH/bbox.h);
  const offX=margin-bbox.x*s, offY=margin-bbox.y*s;
  const MIN_SEG=.5;
  function decimate(pts){ if(pts.length<=2) return pts; const out=[pts[0]]; let last=pts[0]; for(let i=1;i<pts.length;i++){ const p=pts[i]; const dx=p.x-last.x,dy=p.y-last.y; if((dx*dx+dy*dy)>=(MIN_SEG*MIN_SEG)){ out.push(p); last=p; } } if(out[out.length-1]!==pts[pts.length-1]) out.push(pts[pts.length-1]); return out; }
  for(let si=0;si<state.strokes.length;si++){
    const s1=state.strokes[si];
    if(s1.type==='text'){
      const px=s1.font||16;
      pdf.setFontSize(px*s);
      const rgb=hexToRgb(s1.color||'#000'); pdf.setTextColor(rgb.r,rgb.g,rgb.b);
      pdf.text(String(s1.text||''), s1.x*s+offX, s1.y*s+offY, { baseline:'top' });
      continue;
    }
    const rgb=hexToRgb(s1.color||'#000'); pdf.setDrawColor(rgb.r,rgb.g,rgb.b);
    pdf.setLineWidth(s1.size*s); if(pdf.setLineCap) pdf.setLineCap('round'); if(pdf.setLineJoin) pdf.setLineJoin('round');
    const pts=decimate(s1.points); if(pts.length<2) continue; let prev=pts[0];
    for(let i=1;i<pts.length;i++){ const p=pts[i]; pdf.line(prev.x*s+offX, prev.y*s+offY, p.x*s+offX, p.y*s+offY); prev=p; }
  }
  const blob=pdf.output('blob'); downloadBlob(blob,'pikso-export.pdf');
}

// View helpers
export function resetView(){ state.scale=1; state.dx=0; state.dy=0; clampViewToBoard(); drawAll(); scheduleHashUpdate(); }
export function fitToDrawing(){
  const bbox=computeBounds(24); if(!bbox){ resetView(); return;}
  const vw=innerWidth,vh=innerHeight;
  let s=Math.min(vw/bbox.w, vh/bbox.h); s=Math.min(state.MAX_Z, Math.max(state.MIN_Z, s));
  state.scale=s;
  const worldW=vw/state.scale, worldH=vh/state.scale;
  const tlx = bbox.x - (worldW - bbox.w)/2;
  const tly = bbox.y - (worldH - bbox.h)/2;
  state.dx = -tlx*state.scale; state.dy = -tly*state.scale;
  clampViewToBoard(); drawAll(); scheduleHashUpdate();
}
