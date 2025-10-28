// public/js/net.js
import { state } from './state.js';
import { drawAll } from './canvas/draw.js';
import { refreshSizePreview, setTool } from './canvas/tools.js';
import { toast } from './util.js';

export function initSocket(){
  state.socket = io();
  state.socket.on('connect', function(){
    state.socket.emit('join', { roomId: state.roomId, clientId: state.clientId });
    sendPresence();
    setTimeout(sendPresence, 80);
  });
  state.socket.on('init', function(payload){
    state.strokes=(payload&&payload.strokes)||[];
    state.isOwner = !!(payload && payload.ownerClientId && payload.ownerClientId===state.clientId);
    var arr=(payload&&payload.moderators)||[]; state.moderatorsSet=new Set(arr.map(m=>m.clientId));
    updateMembers((payload&&payload.members)||[]);
    drawAll();
  });
  state.socket.on('moderators', function(list){
    var arr=list||[]; state.moderatorsSet=new Set(arr.map(m=>m.clientId));
    state.iAmModerator = state.moderatorsSet.has(state.clientId) || state.iAmModerator;
    drawAll();
  });
  state.socket.on('members', function(list){ updateMembers(list||[]); drawAll(); });
  state.socket.on('cursor', function(payload){
    var cid=payload&&payload.clientId; if(!cid||cid===state.clientId) return;
    state.remoteCursors.set(cid, { x:payload.x, y:payload.y, visible:!!payload.visible, color:payload.color, name:payload.name }); drawAll();
  });
  state.socket.on('stroke-begin', function(msg){ if(!msg||!msg.tempId) return; if(!state.previews.has(msg.tempId)){ state.previews.set(msg.tempId,{ color:msg.color||'#000', size:+msg.size||3, points:[msg.point]}); drawAll(); } });
  state.socket.on('stroke-progress', function(msg){ var pv=msg&&state.previews.get(msg.tempId); if(!pv||!msg.points) return; pv.points = msg.points; drawAll(); });
  state.socket.on('stroke-finish', function(msg){ if(!msg) return; state.previews.delete(msg.tempId); drawAll(); });
  state.socket.on('stroke', function(s){ if(!s) return; var exists = state.strokes.some(x=>x.id===s.id); if(!exists){ state.strokes.push(s); drawAll(); } });
  state.socket.on('stroke-deleted', function(id){ for (let i = state.strokes.length - 1; i >= 0; i--) { if (state.strokes[i].id === id) { state.strokes.splice(i,1); } } drawAll(); });
  state.socket.on('stroke-restored', function(s){ if(!s) return; var exists=state.strokes.some(x=>x.id===s.id); if(!exists){ state.strokes.push(s);} drawAll(); });
  state.socket.on('cleared', function(){ state.strokes=[]; drawAll(); });
  state.socket.on('room-deleted', function(){ toast('Страница удалена владельцем'); });
  state.socket.on('delete-denied', function(){ toast(state.iAmModerator ? 'Ошибка удаления' : 'Нельзя стирать чужие штрихи'); });
  state.socket.on('clear-denied', function(){ toast('Недостаточно прав для очистки'); });
}

export function sendPresence(){
  const name=(state.nameEl.value||'').trim()||'Гость';
  localStorage.setItem('pikso:name', name);
  state.socket.emit('presence', { roomId: state.roomId, name, color: state.colorEl.value });
}

export function updateMembers(list){
  state.members=list||state.members;
  const chip=state.onlineChip; if(!chip) return;
  let dd=chip._dd;
  if(!dd){ dd=document.createElement('div'); dd.className='dropdown'; chip._dd=dd; }
  chip.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-2px"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"></circle></svg> <span style="margin-left:6px">'+state.members.length+'</span>';
  if(!dd.isConnected) chip.appendChild(dd);
  dd.innerHTML='';
  state.members.forEach(m=>{
    const row=document.createElement('div'); row.className='item';
    const sw=document.createElement('span'); sw.style.width='10px'; sw.style.height='10px'; sw.style.borderRadius='50%'; sw.style.display='inline-block'; sw.style.background=m.color||'#888';
    const name=document.createElement('span'); name.textContent=m.name||'Гость';
    row.appendChild(sw); row.appendChild(name); dd.appendChild(row);
  });
  chip.onmouseenter=()=>{ dd.style.display='block'; };
  chip.onmouseleave=()=>{ dd.style.display='none'; };
}
