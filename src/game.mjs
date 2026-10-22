// Pure simulation. Rendering and input never change inventory directly.
export const MIN=-16, MAX=15, DROP_RADIUS=.19;
export const MATERIALS=Object.freeze({
  dirt:{name:'青苔土',seconds:.75,color:0x8da36b},
  stone:{name:'玄青石',seconds:2,color:0x6c8b9b},
  crystal:{name:'琉璃晶',seconds:1.4,color:0x6ae3da},
  bedrock:{name:'浮岛基岩',seconds:Infinity,color:0x344d63}
});
export const key=(x,y,z)=>`${x},${y},${z}`;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const integerCell=p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.z);
const inside=p=>integerCell(p)&&p.x>=MIN&&p.x<=MAX&&p.z>=MIN&&p.z<=MAX&&p.y>=0&&p.y<32;
const overlap=(a,b,r)=>a+r>b-.5+1e-6&&a-r<b+.5-1e-6;
const vector=p=>({x:p.x,y:p.y,z:p.z});

export class World {
  constructor(){this.blocks=new Map();this.revision=0;}
  get(x,y,z){return this.blocks.get(key(x,y,z))??null;}
  set(x,y,z,type){if(!inside({x,y,z})||!MATERIALS[type])throw Error('Invalid block');this.blocks.set(key(x,y,z),type);this.revision++;}
  delete(x,y,z){const changed=this.blocks.delete(key(x,y,z));if(changed)this.revision++;return changed;}
  collides(p,r=.19,height=r*2){
    for(let x=Math.floor(p.x-r+.5);x<=Math.floor(p.x+r+.5);x++)
    for(let y=Math.floor(p.y+.5);y<=Math.floor(p.y+height-.0001+.5);y++)
    for(let z=Math.floor(p.z-r+.5);z<=Math.floor(p.z+r+.5);z++)
      if(this.get(x,y,z)&&overlap(p.x,x,r)&&overlap(p.z,z,r)&&p.y<y+.5-1e-6&&p.y+height>y-.5+1e-6)return true;
    return false;
  }
  surface(x,z){for(let y=31;y>=0;y--)if(this.get(Math.round(x),y,Math.round(z)))return y+.5;return -5;}
  raycast(origin,dir,reach=45){
    let x=Math.floor(origin.x+.5),y=Math.floor(origin.y+.5),z=Math.floor(origin.z+.5);
    const step={x:Math.sign(dir.x),y:Math.sign(dir.y),z:Math.sign(dir.z)};
    const delta={x:dir.x?Math.abs(1/dir.x):Infinity,y:dir.y?Math.abs(1/dir.y):Infinity,z:dir.z?Math.abs(1/dir.z):Infinity};
    const next={};for(const a of ['x','y','z'])next[a]=dir[a]===0?Infinity:((({x,y,z})[a]+step[a]*.5)-origin[a])/dir[a];
    let t=0,normal={x:0,y:1,z:0};
    while(t<=reach){
      const type=this.get(x,y,z);if(type)return {x,y,z,type,normal:{...normal},distance:t};
      const a=next.x<next.y?(next.x<next.z?'x':'z'):(next.y<next.z?'y':'z');
      t=next[a];next[a]+=delta[a];normal={x:0,y:0,z:0};normal[a]=-step[a];
      if(a==='x')x+=step.x;else if(a==='y')y+=step.y;else z+=step.z;
    }return null;
  }
}

export class Game {
  constructor(world,options={}){
    this.world=world;this.player=vector(options.player??{x:0,y:5.5,z:7});this.velocityY=0;this.grounded=false;
    this.inventory={dirt:6,stone:4,crystal:0,...options.inventory};this.drops=[];this.nextId=1;
    this.mining=null;this.progress=0;this.events=[];this.stats={mined:0,picked:0,placed:0};this.elapsed=0;
  }
  pickupPoint(){return {x:this.player.x,y:this.player.y+.8,z:this.player.z};}
  canReach(p){return distance(this.pickupPoint(),p)<=6;}
  beginMining(p){
    const type=this.world.get(p.x,p.y,p.z);
    if(!integerCell(p)||!type||type==='bedrock'||!this.canReach(p)){this.endMining();return false;}
    if(this.mining?.key!==key(p.x,p.y,p.z)){this.mining={...vector(p),key:key(p.x,p.y,p.z),type,elapsed:0};this.progress=0;}
    return true;
  }
  endMining(){this.mining=null;this.progress=0;}
  tick(dt){
    if(!Number.isFinite(dt)||dt<0)return;
    this.elapsed+=dt;
    if(this.mining){
      const m=this.mining;
      if(!this.canReach(m)||this.world.get(m.x,m.y,m.z)!==m.type){this.endMining();}
      else {
        m.elapsed+=dt;this.progress=Math.min(1,m.elapsed/MATERIALS[m.type].seconds);
        if(m.elapsed+1e-9>=MATERIALS[m.type].seconds){
          this.world.delete(m.x,m.y,m.z);this.spawnDrop(m.type,m);this.stats.mined++;
          this.events.push({kind:'mine',type:m.type,position:vector(m)});this.endMining();
        }
      }
    }
    this.updateDrops(dt);
  }
  spawnDrop(type,p,velocity={x:.65,y:2.7,z:.35}){
    const d={id:this.nextId++,type,...vector(p),vx:velocity.x,vy:velocity.y,vz:velocity.z,state:'falling',rotation:0,age:0};
    this.drops.push(d);return d;
  }
  updateDrops(dt){
    // Fixed substeps prevent tunnelling through a one-cell floor at low FPS.
    const count=Math.max(1,Math.ceil(dt/(1/120))),h=dt/count;
    for(let i=0;i<count;i++)for(const d of this.drops){
      if(d.collected)continue;d.age+=h;d.rotation+=h*1.9;
      const target=this.pickupPoint(),dist=distance(d,target);
      if(dist<=3){
        d.state='attracting';
        if(dist<.32){d.collected=true;this.inventory[d.type]++;this.stats.picked++;this.events.push({kind:'pickup',type:d.type});continue;}
        const speed=Math.min(9,3+d.age*2),step=Math.min(dist,speed*h);
        const proposal={x:d.x+(target.x-d.x)/dist*step,y:d.y+(target.y-d.y)/dist*step,z:d.z+(target.z-d.z)/dist*step};
        if(!this.world.collides({x:proposal.x,y:proposal.y-DROP_RADIUS,z:proposal.z},DROP_RADIUS)){
          Object.assign(d,proposal);d.vx=d.vy=d.vz=0;continue;
        }
      }else d.state='falling';
      d.vy-=16*h;
      for(const axis of ['x','z']){
        const v=axis==='x'?'vx':'vz',proposal={x:d.x,y:d.y-DROP_RADIUS,z:d.z};proposal[axis]+=d[v]*h;
        if(!this.world.collides(proposal,DROP_RADIUS))d[axis]=proposal[axis];else d[v]=0;
      }
      const old=d.y,next=d.y+d.vy*h;
      let landing=-Infinity;
      if(d.vy<=0){
        for(let x=Math.floor(d.x-DROP_RADIUS+.5);x<=Math.floor(d.x+DROP_RADIUS+.5);x++)
        for(let z=Math.floor(d.z-DROP_RADIUS+.5);z<=Math.floor(d.z+DROP_RADIUS+.5);z++)
        for(let y=Math.floor(old-DROP_RADIUS+.5);y>=Math.max(0,Math.floor(next-DROP_RADIUS-.5));y--)
          if(this.world.get(x,y,z)&&overlap(d.x,x,DROP_RADIUS)&&overlap(d.z,z,DROP_RADIUS)&&old-DROP_RADIUS>=y+.5-1e-6&&next-DROP_RADIUS<=y+.5)landing=Math.max(landing,y+.5+DROP_RADIUS);
      }
      if(Number.isFinite(landing)){d.y=landing;d.vy=0;d.vx*=.88;d.vz*=.88;}
      else if(!this.world.collides({x:d.x,y:next-DROP_RADIUS,z:d.z},DROP_RADIUS))d.y=next;
      else d.vy=0;
      // World-edge rescue retains the item, rather than deleting material.
      if(d.y<-6){d.x=0;d.z=4;d.y=this.world.surface(0,4)+.7;d.vx=d.vy=d.vz=0;}
    }
    this.drops=this.drops.filter(d=>!d.collected);
  }
  place(p,type){
    if(!inside(p)||!(this.inventory[type]>0)||!this.canReach(p)||this.world.get(p.x,p.y,p.z))return false;
    const neighbors=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    if(!neighbors.some(([x,y,z])=>this.world.get(p.x+x,p.y+y,p.z+z)))return false;
    const q=this.player;if(overlap(q.x,p.x,.28)&&overlap(q.z,p.z,.28)&&q.y<p.y+.5&&q.y+1.65>p.y-.5)return false;
    this.world.set(p.x,p.y,p.z,type);this.inventory[type]--;this.stats.placed++;this.events.push({kind:'place',type,position:vector(p)});return true;
  }
  movePlayer(dx,dz,dt,jump=false){
    if(jump&&this.grounded){this.velocityY=7;this.grounded=false;}
    const steps=Math.max(1,Math.ceil(dt/.008));
    for(let i=0;i<steps;i++){
      const h=dt/steps,p=this.player;
      for(const a of ['x','z']){
        const next={...p};next[a]+=(a==='x'?dx:dz)*h;
        if(!this.world.collides(next,.28,1.65))p[a]=next[a];
        else if(this.grounded){next.y+=.55;if(!this.world.collides(next,.28,1.65)){p[a]=next[a];p.y=next.y;}}
      }
      this.velocityY-=20*h;const ny=p.y+this.velocityY*h;
      if(this.world.collides({x:p.x,y:ny,z:p.z},.28,1.65)){
        let safe=p.y,blocked=ny;
        for(let j=0;j<16;j++){const middle=(safe+blocked)/2;if(this.world.collides({x:p.x,y:middle,z:p.z},.28,1.65))blocked=middle;else safe=middle;}
        p.y=safe;if(this.velocityY<0)this.grounded=true;this.velocityY=0;
      }else{p.y=ny;this.grounded=false;}
      if(p.y<-5||Math.abs(p.x)>16||Math.abs(p.z)>16){this.player={x:0,y:this.world.surface(0,7),z:7};this.velocityY=0;this.events.push({kind:'rescue'});}
    }
  }
  serialize(){return {version:1,blocks:[...this.world.blocks],player:{...this.player},inventory:{...this.inventory},drops:this.drops.map(d=>({...d})),nextId:this.nextId,stats:{...this.stats}};}
  static restore(s){
    if(s?.version!==1||!Array.isArray(s.blocks)||s.blocks.length>32768||!s.inventory||!s.player||!Array.isArray(s.drops))throw Error('Invalid save');
    for(const type of ['dirt','stone','crystal'])if(!Number.isSafeInteger(s.inventory[type])||s.inventory[type]<0||s.inventory[type]>100000)throw Error('Invalid inventory');
    for(const a of ['x','y','z'])if(!Number.isFinite(s.player[a])||Math.abs(s.player[a])>64)throw Error('Invalid player');
    const world=new World();for(const entry of s.blocks){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string')throw Error('Invalid cell');const coords=entry[0].split(',').map(Number);if(coords.length!==3)throw Error('Invalid cell');world.set(...coords,entry[1]);}
    const g=new Game(world,{player:s.player,inventory:s.inventory});
    if(s.drops.length>32768)throw Error('Too many drops');
    g.drops=s.drops.map((d,i)=>{if(!['dirt','stone','crystal'].includes(d.type))throw Error('Invalid item');for(const a of ['x','y','z','vx','vy','vz'])if(!Number.isFinite(d[a])||Math.abs(d[a])>128)throw Error('Invalid item');return {...d,id:i+1,state:'falling',age:0,rotation:0};});
    g.nextId=g.drops.length+1;for(const a of ['mined','picked','placed'])g.stats[a]=Number.isSafeInteger(s.stats?.[a])&&s.stats[a]>=0?s.stats[a]:0;
    return g;
  }
}

export function generateIsland(){
  const w=new World();
  for(let x=-13;x<=13;x++)for(let z=-12;z<=12;z++){
    const r=Math.hypot(x/1.06,z);if(r>11.7+Math.sin(x*1.7+z*.9)*.7)continue;
    const height=(Math.abs(x)<5&&z>-3&&z<9)?4:4+Math.round(Math.sin(x*.35)*Math.cos(z*.4));
    const bottom=Math.max(0,Math.floor(r/4)-1);
    for(let y=bottom;y<=height;y++)w.set(x,y,z,y===bottom?'bedrock':y===height?'dirt':'stone');
  }
  // Hand-built garden resources give the player clear, reachable first targets.
  for(const [x,z,type] of [[-2,3,'dirt'],[1,2,'stone'],[3,4,'crystal'],[-4,0,'stone'],[4,-1,'crystal'],[5,5,'stone'],[-3,5,'dirt']])w.set(x,Math.floor(w.surface(x,z)+.5),z,type);
  return w;
}
