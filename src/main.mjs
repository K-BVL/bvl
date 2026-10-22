import { Game, generateIsland, MATERIALS, distance } from './game.mjs';
import { RealmScene } from './scene.mjs';

const $=s=>document.querySelector(s),SAVE='canglan-world-v1',SETTINGS='canglan-settings-v1';
let game,view,started=false,miningHeld=false,orbiting=false,lastPointer=null,lastTime=0,lastSave=0,lastSavedRevision=-1,selected='dirt',resetArmed=0;
const keys=new Set();let settings={quality:'balanced',motion:!matchMedia('(prefers-reduced-motion: reduce)').matches},fps=60,frameSum=0,frameCount=0,audio=null,sound=false,lastTone=0;
try{Object.assign(settings,JSON.parse(localStorage.getItem(SETTINGS)||'{}'));}catch{}
try{const raw=localStorage.getItem(SAVE);if(raw)game=Game.restore(JSON.parse(raw));}catch{localStorage.removeItem(SAVE);}
game??=new Game(generateIsland());
const toast=(message)=>{const e=$('#toast');e.textContent=message;e.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('visible'),2600);};
function stopInput(){keys.clear();miningHeld=false;orbiting=false;game.endMining();}
function start(){if(started)return;started=true;view.active=true;$('#intro').classList.add('leaving');$('#quest').classList.remove('hidden');$('#world').focus();toast('WASD 移动 · 指向身边的方块，长按左键');setTimeout(()=>$('#intro').classList.add('hidden'),700);}
function syncUI(){
  for(const type of ['dirt','stone','crystal'])$('#count-'+type).textContent=game.inventory[type];
  $('#selected-label').textContent=MATERIALS[selected].name;
  for(const [kind,selector] of [['mined','#quest-mine'],['picked','#quest-pick'],['placed','#quest-place']])$(selector).classList.toggle('done',game.stats[kind]>0);
  const complete=game.stats.mined>0&&game.stats.picked>0&&game.stats.placed>0;
  $('#quest-complete').classList.toggle('hidden',!complete);$('#quest').classList.toggle('complete',complete);
  const target=started?view.target:null,can=target&&game.canReach(target);
  $('#target').classList.toggle('hidden',!can);
  if(can){$('#target-name').textContent=MATERIALS[target.type].name;$('#target-info').textContent=target.type==='bedrock'?'浮境根基 · 不可开采':game.progress>0?'凝聚剑意 · 松手重置':'长按左键 · '+MATERIALS[target.type].seconds+' 秒';$('#mine-progress').style.width=(game.progress*100)+'%';}
}
function select(type){selected=type;document.querySelectorAll('.slot').forEach(e=>e.classList.toggle('selected',e.dataset.type===type));syncUI();}
function save(show=true){
  try{localStorage.setItem(SAVE,JSON.stringify(game.serialize()));lastSavedRevision=game.world.revision;if(show){$('#save-status').textContent='◈ 世界已记忆';$('#save-status').classList.add('visible');setTimeout(()=>$('#save-status').classList.remove('visible'),1800);}}
  catch{if(show)toast('浏览器无法保存，请检查储存空间或隐私模式');}
}
function persistSettings(){try{localStorage.setItem(SETTINGS,JSON.stringify(settings));}catch{}}
function openDialog(selector){stopInput();$(selector).showModal();if(selector==='#settings-dialog')$('#performance').textContent=`当前约 ${Math.round(fps)} FPS · ${view.performance().drawCalls} 次绘制 · ${view.performance().triangles.toLocaleString()} 个三角形。此值仅代表当前设备与视角。`;}
function place(){
  if(!started||document.querySelector('dialog[open]'))return;
  const hit=view.pick();if(!hit||!game.canReach(hit)){toast('靠近一点：筑造范围为 6 格');return;}
  if(game.inventory[selected]===0){toast(MATERIALS[selected].name+' 已用完，先去开采');return;}
  const p={x:hit.x+hit.normal.x,y:hit.y+hit.normal.y,z:hit.z+hit.normal.z};
  if(game.place(p,selected)){view.burst(p,selected);tone(540,.13);syncUI();save(false);}else toast('此处无法筑造：请避开身体、边界与已有方块');
}
function tone(freq,duration=.12){if(!sound||!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(freq*.52,audio.currentTime+duration);gain.gain.setValueAtTime(.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.07,audio.currentTime+.01);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}
function runEvents(){
  for(const e of game.events.splice(0)){
    if(e.kind==='mine'){view.burst(e.position,e.type);tone(e.type==='stone'?160:260,.2);}
    if(e.kind==='pickup'){toast('✧ '+MATERIALS[e.type].name+' +1');tone(780,.2);}
    if(e.kind==='rescue')toast('云海托住了你 · 已回到归墟庭');
  }
}

try{
  view=new RealmScene($('#world'),game);view.setQuality(settings.quality);view.motion=settings.motion;
  $('#quality').value=settings.quality;$('#motion').checked=settings.motion;
  if(matchMedia('(pointer: coarse)').matches){for(const id of ['touch-mine','touch-place','touch-move'])$('#'+id).classList.remove('hidden');}
  $('#enter').addEventListener('click',start);$('#help').onclick=()=>openDialog('#help-dialog');$('#settings').onclick=()=>openDialog('#settings-dialog');
  document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>e.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  document.querySelectorAll('.slot').forEach(e=>e.onclick=()=>select(e.dataset.type));
  $('#save-now').onclick=()=>{save();toast('浮境已保存在此浏览器');};
  $('#quality').onchange=e=>{settings.quality=e.target.value;view.setQuality(settings.quality);persistSettings();};
  $('#motion').onchange=e=>{settings.motion=e.target.checked;view.motion=settings.motion;persistSettings();};
  $('#reset').onclick=()=>{if(performance.now()-resetArmed>4000){resetArmed=performance.now();$('#reset-confirm').classList.remove('hidden');return;}localStorage.removeItem(SAVE);location.reload();};
  $('#sound').onclick=async()=>{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();sound=!sound;$('#sound .off-mark').style.display=sound?'none':'';$('#sound').setAttribute('aria-label',sound?'关闭声音':'开启声音');$('#sound').title=sound?'关闭声音':'开启声音';tone(660,.5);};
  const canvas=$('#world');
  canvas.addEventListener('pointerdown',e=>{
    if(!started)return;view.setCursor(e.clientX,e.clientY);lastPointer={x:e.clientX,y:e.clientY};
    if(e.button===1||e.pointerType==='touch'){orbiting=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();}
    else if(e.button===0){miningHeld=true;const hit=view.pick();if(hit)game.beginMining(hit);canvas.setPointerCapture(e.pointerId);}
  });
  canvas.addEventListener('pointermove',e=>{view.setCursor(e.clientX,e.clientY);if(orbiting&&lastPointer){view.yaw-=(e.clientX-lastPointer.x)*.006;view.pitch=Math.max(.18,Math.min(1.15,view.pitch+(e.clientY-lastPointer.y)*.005));}lastPointer={x:e.clientX,y:e.clientY};});
  const release=()=>{miningHeld=false;orbiting=false;game.endMining();};
  addEventListener('pointerup',release);addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();view.setCursor(e.clientX,e.clientY);place();});
  canvas.addEventListener('wheel',e=>{e.preventDefault();view.zoom=Math.max(7,Math.min(25,view.zoom+e.deltaY*.014));},{passive:false});
  addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.code==='KeyH'){openDialog('#help-dialog');return;}if(e.code==='Escape'){stopInput();return;}
    if(!started){if(e.code==='Space'||e.code==='Enter')start();return;}
    keys.add(e.code);if(['Digit1','Digit2','Digit3'].includes(e.code))select(['dirt','stone','crystal'][Number(e.code.slice(-1))-1]);
    if(e.code==='KeyR'){game.player={x:0,y:game.world.surface(0,7),z:7};game.velocityY=0;game.endMining();toast('已返回归墟庭');}
  });
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{stopInput();save(false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopInput();save(false);lastTime=0;}});addEventListener('pagehide',()=>save(false));
  $('#touch-mine').addEventListener('pointerdown',e=>{e.preventDefault();if(!started)start();miningHeld=true;});$('#touch-place').onclick=place;
  document.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(!started)start();keys.add(b.dataset.move);b.setPointerCapture(e.pointerId);});for(const action of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(action,()=>keys.delete(b.dataset.move));});
  function frame(time){
    requestAnimationFrame(frame);if(document.hidden){lastTime=0;return;}
    const dt=lastTime?Math.min(.05,(time-lastTime)/1000):1/60;lastTime=time;
    frameSum+=dt;frameCount++;if(frameSum>=1){fps=frameCount/frameSum;frameSum=0;frameCount=0;}
    const dialog=!!document.querySelector('dialog[open]');let moving=false;
    if(started&&!dialog){
      if(keys.has('KeyQ')||keys.has('ArrowLeft'))view.yaw+=dt*1.3;if(keys.has('KeyE')||keys.has('ArrowRight'))view.yaw-=dt*1.3;
      if(keys.has('ArrowUp'))view.pitch=Math.max(.18,view.pitch-dt*.8);if(keys.has('ArrowDown'))view.pitch=Math.min(1.15,view.pitch+dt*.8);
      const horizontal=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
      let dx=horizontal*Math.cos(view.yaw)-forward*Math.sin(view.yaw),dz=-horizontal*Math.sin(view.yaw)-forward*Math.cos(view.yaw);
      const len=Math.hypot(dx,dz);moving=len>0;if(moving){const speed=keys.has('ShiftLeft')?5.1:3.5;dx=dx/len*speed;dz=dz/len*speed;view.avatarBody.rotation.y=Math.atan2(-dx,-dz);}
      game.movePlayer(dx,dz,dt,keys.has('Space'));
      if(miningHeld){const hit=view.pick();if(hit)game.beginMining(hit);else game.endMining();}
      game.tick(dt);runEvents();
      if(sound&&game.progress>0&&time-lastTone>180){tone(90+game.progress*100,.08);lastTone=time;}
      if(time-lastSave>3500){save();lastSave=time;}
    }
    view.update(dt,moving);syncUI();
    const degree=((view.yaw*180/Math.PI)%360+360)%360;$('#heading').textContent=['南','东南','东','东北','北','西北','西','西南'][Math.round(degree/45)%8];
  }
  requestAnimationFrame(frame);syncUI();
}catch(error){console.error(error);$('#fatal').classList.remove('hidden');$('#fatal-message').textContent='需要支持 WebGL 2 的现代浏览器。请尝试更新浏览器，或检查硬件加速。详细原因：'+error.message;}
