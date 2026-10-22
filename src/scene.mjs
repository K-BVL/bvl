import * as THREE from '../vendor/three.module.min.js';
import { MATERIALS, key, distance } from './game.mjs';

const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const palette={jade:0x79aaa0,leaf:0x99c2a2,darkLeaf:0x4c8f8a,wood:0x3e6870,gold:0xddc691,stone:0xa7b8ae,roof:0x3b787e,light:0xa3fff0};
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,flatShading:true,...extra});
const basic=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1});
const random=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

export class RealmScene {
  constructor(canvas,game){
    this.game=game;this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0x759a9d,.019);
    this.camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,150);
    this.scene.add(new THREE.HemisphereLight(0xe1f3dc,0x304663,2.4));
    const sun=new THREE.DirectionalLight(0xffe5b1,3.1);sun.position.set(-9,19,7);this.scene.add(sun);
    const rim=new THREE.DirectionalLight(0x89e7ec,1.5);rim.position.set(8,5,-10);this.scene.add(rim);
    this.static=new THREE.Group();this.scene.add(this.static);this.dynamic=new THREE.Group();this.scene.add(this.dynamic);
    this.elapsed=0;this.yaw=.38;this.pitch=.48;this.zoom=15.5;this.active=false;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lookAt=v(0,5.5,0);this.raycaster=new THREE.Raycaster();this.ndc=new THREE.Vector2();this.cursor={x:innerWidth*.53,y:innerHeight*.55};this.target=null;
    this.dropMeshes=new Map();this.effects=[];this.revision=-1;this.materialCache=new Map();this.blocksMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,flatShading:true});
    this.buildScenery();this.buildCharacter();this.buildSelection();this.rebuildTerrain();this.buildMotes();this.updateCamera(1,true);
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);};addEventListener('resize',this.resize);
  }
  cached(color){if(!this.materialCache.has(color))this.materialCache.set(color,mat(color));return this.materialCache.get(color);}
  mesh(geo,color,p,scale,parent=this.static){const m=new THREE.Mesh(geo,typeof color==='number'?this.cached(color):color);if(p)m.position.copy(p);if(scale)m.scale.copy(scale);parent.add(m);return m;}
  box(color,x,y,z,sx,sy,sz,parent=this.static){return this.mesh(new THREE.BoxGeometry(1,1,1),color,v(x,y,z),v(sx,sy,sz),parent);}
  branch(a,b,r1=.2,r2=.12,color=palette.wood){const delta=b.clone().sub(a),m=this.mesh(new THREE.CylinderGeometry(r2,r1,delta.length(),6),color,a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return m;}
  buildScenery(){
    const w=this.game.world;
    // Ancient sacred tree, built entirely from original low-poly geometry.
    const tx=-5,tz=-4,base=w.surface(tx,tz);
    this.branch(v(tx,base,tz),v(tx+.3,base+4.2,tz),.65,.24);
    for(let i=0;i<8;i++){
      const a=i*2.4,root=v(tx+.2,base+2.4+(i%3)*.5,tz),end=v(tx+Math.sin(a)*(2+i%2),base+4.5+random(i)*1.7,tz+Math.cos(a)*2);
      this.branch(root,end,.23,.07);
      for(let j=0;j<3;j++)this.mesh(new THREE.IcosahedronGeometry(1,0),[palette.leaf,palette.jade,palette.darkLeaf][(i+j)%3],end.clone().add(v((random(i*7+j)-.5)*2,j*.45-.3,(random(i*8+j+4)-.5)*1.6)),v(1.7,1.05,1.45));
    }
    // Lanterns hanging below the canopy.
    for(const [x,y,z] of [[-7,7,-2],[-3.2,8,-3],[-6.2,8,-6]]){
      this.branch(v(x,y+1.5,z),v(x,y,z),.012,.012,palette.gold);
      this.mesh(new THREE.OctahedronGeometry(.2),basic(0xffdb91),v(x,y,z),v(1,1.4,1));
    }
    // A two-tier pavilion with raised eaves and jade columns.
    const px=6,pz=-4,py=w.surface(px,pz);
    this.box(palette.stone,px,py+.1,pz,4.4,.2,3.6);
    for(const x of [-1.5,1.5])for(const z of [-1.15,1.15]){
      this.box(palette.wood,px+x,py+1.5,pz+z,.16,2.8,.16);this.box(palette.gold,px+x,py+2.7,pz+z,.21,.13,.21);
    }
    for(const [ry,size] of [[py+3.25,3.4],[py+4.1,2.1]]){
      const roof=this.mesh(new THREE.ConeGeometry(size,1,4),palette.roof,v(px,ry,pz),v(1,.8,.85));roof.rotation.y=Math.PI/4;
      const edge=this.mesh(new THREE.ConeGeometry(size+.08,.12,4),palette.gold,v(px,ry-.37,pz),v(1,1,.85));edge.rotation.y=Math.PI/4;
      for(const x of [-1,1])for(const z of [-1,1])this.branch(v(px+x*size*.7,ry-.35,pz+z*size*.6),v(px+x*(size*.7+.23),ry-.1,pz+z*(size*.6+.18)),.04,.025,palette.gold);
    }
    this.mesh(new THREE.OctahedronGeometry(.22),palette.gold,v(px,py+4.7,pz),v(.5,2,.5));
    // An old circular shrine and the sword of the island.
    const sx=-1.7,sz=-3.5,sy=w.surface(sx,sz);
    this.mesh(new THREE.CylinderGeometry(2.05,2.35,.25,12),palette.stone,v(sx,sy+.12,sz));
    this.mesh(new THREE.CylinderGeometry(1.6,1.8,.16,12),palette.wood,v(sx,sy+.32,sz));
    this.shrineSword=new THREE.Group();this.shrineSword.position.set(sx,sy+3,sz);this.dynamic.add(this.shrineSword);
    this.makeSword(this.shrineSword,2.2);
    // Celestial bronze rings behind the shrine, with suspended rune segments.
    this.halo=new THREE.Group();this.halo.position.set(-2.5,9.4,-6);this.halo.rotation.y=.15;this.dynamic.add(this.halo);
    const ringMat=mat(palette.gold,{metalness:.65,roughness:.4,emissive:0x705a22,emissiveIntensity:.6});
    this.mesh(new THREE.TorusGeometry(4,.035,6,100),ringMat,v(),null,this.halo);
    this.mesh(new THREE.TorusGeometry(3.68,.013,4,100),basic(0xc0e8ca,.7),v(),null,this.halo);
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2,m=this.box(palette.gold,Math.sin(a)*3.83,Math.cos(a)*3.83,0,.03,i%3===0?.19:.08,.03,this.halo);m.rotation.z=-a;
    }
    this.orbitRing=new THREE.Group();this.orbitRing.position.copy(this.halo.position);this.orbitRing.rotation.set(.45,.2,-.3);this.dynamic.add(this.orbitRing);
    this.mesh(new THREE.TorusGeometry(4.16,.014,4,100),basic(0x8edace,.5),v(),null,this.orbitRing);
    // Small ruins and stepping stones provide readable depth without covering the resources.
    for(let i=0;i<11;i++){const x=Math.sin(i*.8)*.6,z=7-i*.85,y=w.surface(x,z);const stone=this.box(0xc1c5ae,x,y+.03,z,.75,.09,.53);stone.rotation.y=i*.3;}
    for(const [x,z,h] of [[-8,3,2.4],[9,3,1.5],[-7,-7,1.8],[3,-8,2.2]]){
      const y=w.surface(x,z);this.box(palette.wood,x,y+h/2,z,.58,h,.58);this.box(palette.stone,x,y+h,z,.8,.16,.8);
      this.mesh(new THREE.OctahedronGeometry(.18),basic(0xa9ecdd),v(x,y+h+.3,z));
    }
    // The small crystals are scenery; the large voxel crystals remain fully mineable.
    for(const [x,z] of [[-9,-1],[7,7],[9,-2],[-8,-6]]){
      const y=w.surface(x,z);for(let i=0;i<4;i++){const m=this.mesh(new THREE.ConeGeometry(.22,.8+i*.14,5),mat(0x79c6c2,{emissive:0x3c9f9b,emissiveIntensity:.25}),v(x+(random(i+5)-.5),y+.4,z+(random(i+7)-.5)));m.rotation.z=(random(i)-.5)*.5;}
    }
    // Grass tufts, flowers and scattered stones.
    const grassPositions=[];
    for(let i=0;i<400;i++){
      const x=(random(i*3+1)-.5)*24,z=(random(i*3+2)-.5)*22,y=w.surface(x,z);
      if(y<2||Math.abs(x)<2&&z<7&&z>-3)continue;
      grassPositions.push([x,y,z]);
    }
    const tuftGeo=new THREE.ConeGeometry(.13,.48,3),tufts=new THREE.InstancedMesh(tuftGeo,mat(0x9fbb88),grassPositions.length),dummy=new THREE.Object3D();
    grassPositions.forEach(([x,y,z],i)=>{dummy.position.set(x,y+.18,z);dummy.rotation.set(0,i*2.4,(random(i)-.5)*.3);dummy.scale.setScalar(.6+random(i+3)*.8);dummy.updateMatrix();tufts.setMatrixAt(i,dummy.matrix);});this.scene.add(tufts);
    // Clouds sit below the island. No external textures or borrowed game assets.
    this.clouds=new THREE.Group();this.scene.add(this.clouds);
    const cloudMat=basic(0xcbe6da,.14);
    for(let i=0;i<28;i++){const a=i*2.4,r=10+random(i)*5;this.mesh(new THREE.IcosahedronGeometry(1,1),cloudMat,v(Math.sin(a)*r,-.6+random(i+8)*1.2,Math.cos(a)*r),v(2.5+random(i)*3,.35,1.8+random(i+3)*2),this.clouds);}
    // A translucent waterfall follows the island's eastern edge.
    this.waterfall=new THREE.Group();this.dynamic.add(this.waterfall);
    for(let i=0;i<5;i++){const x=10+i*.13,z=-2.1+i*.08,y=w.surface(x,z);this.box(basic(0xa8e3e2,.18+i*.035),x,(y-1)/2,z,.1,y+1,.13,this.waterfall);}
    // Fold static geometry by material to keep draw calls modest on older machines.
    this.mergeStatic();
  }
  mergeStatic(){
    this.static.updateMatrixWorld(true);const groups=new Map();
    this.static.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);const list=groups.get(o.material)??[];list.push(geo);groups.set(o.material,list);});
    this.static.clear();
    for(const [material,geos] of groups){const p=[],n=[];for(const g of geos){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));this.static.add(new THREE.Mesh(g,material));}
  }
  makeSword(parent,size=1){
    const blade=mat(0xd3f2e5,{metalness:.55,roughness:.3,emissive:0x4cae9e,emissiveIntensity:.25});
    const body=this.mesh(new THREE.ConeGeometry(.16,size,4),blade,v(0,size*.28,0),v(1,1,.42),parent);body.rotation.z=Math.PI;
    this.box(palette.gold,0,size*.83,0,.7,.08,.13,parent);this.box(0x31545b,0,size*1.01,0,.12,size*.32,.12,parent);
    this.mesh(new THREE.OctahedronGeometry(.12),basic(0xc9f6dc),v(0,size*1.21,0),null,parent);
    this.box(basic(0xd2ffe7),0,size*.22,.045,.026,size*.67,.02,parent);
  }
  buildCharacter(){
    this.character=new THREE.Group();this.scene.add(this.character);
    this.avatarBody=new THREE.Group();this.character.add(this.avatarBody);
    const robe=mat(0xdde3d2),dark=mat(0x234f5e),gold=mat(palette.gold);
    this.mesh(new THREE.CylinderGeometry(.22,.37,.75,6),dark,v(0,.72,0),null,this.avatarBody);
    this.mesh(new THREE.ConeGeometry(.36,.9,5),robe,v(0,.8,.08),v(.95,1,1),this.avatarBody);
    this.box(0xc5ae7d,0,.9,-.22,.38,.08,.08,this.avatarBody);
    this.mesh(new THREE.SphereGeometry(.17,8,6),mat(0xddc7a0),v(0,1.38,0),null,this.avatarBody);
    this.mesh(new THREE.ConeGeometry(.54,.2,8),dark,v(0,1.62,0),v(1,1,.85),this.avatarBody);
    this.mesh(new THREE.TorusGeometry(.43,.018,3,8),gold,v(0,1.55,0),null,this.avatarBody).rotation.x=Math.PI/2;
    this.legs=[];for(const x of [-.13,.13])this.legs.push(this.box(0x264553,x,.19,0,.14,.38,.17,this.avatarBody));
    this.scarf=this.box(0x9ac2aa,.26,1.11,.32,.18,.04,.72,this.avatarBody);
    this.familiar=new THREE.Group();this.scene.add(this.familiar);this.makeSword(this.familiar,.65);this.familiar.rotation.z=-.3;
    const shadow=this.mesh(new THREE.CircleGeometry(.4,24),basic(0x163844,.2),v(),null,this.character);shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;
  }
  buildSelection(){
    this.selection=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.022,1.022,1.022)),new THREE.LineBasicMaterial({color:0xe7e6b4,transparent:true,opacity:.85}));this.selection.visible=false;this.scene.add(this.selection);
    this.crackTextures=[];
    for(let stage=0;stage<6;stage++){
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
      for(let i=0;i<stage+1;i++){ctx.beginPath();ctx.moveTo(64,64);for(let j=1;j<5;j++){const a=i*2.399+(random(j+i)-.5)*.6;ctx.lineTo(64+Math.cos(a)*(j*17),64+Math.sin(a)*(j*17));}ctx.strokeStyle='#193635';ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle='#d4ffe6';ctx.lineWidth=.8;ctx.stroke();}
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;this.crackTextures.push(texture);
    }
    this.crackMaterial=new THREE.MeshBasicMaterial({map:this.crackTextures[0],transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    this.cracks=new THREE.Mesh(new THREE.BoxGeometry(1.026,1.026,1.026),this.crackMaterial);this.cracks.visible=false;this.scene.add(this.cracks);
  }
  rebuildTerrain(){
    if(this.terrain){this.terrain.geometry.dispose();this.scene.remove(this.terrain);}
    const geo=new THREE.BoxGeometry(1,1,1).toNonIndexed(),p=geo.attributes.position.array,n=geo.attributes.normal.array;
    const positions=[],normals=[],colors=[],neighbors=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(const [k,type] of this.game.world.blocks){
      const [x,y,z]=k.split(',').map(Number),base=new THREE.Color(MATERIALS[type].color);
      for(let f=0;f<6;f++){
        const [dx,dy,dz]=neighbors[f];if(this.game.world.get(x+dx,y+dy,z+dz))continue;
        const c=base.clone();if(type==='dirt'&&f!==2)c.set(0x5f7c72);if(type==='dirt'&&f===2)c.set(0x9aaf7b);if(type==='stone'&&f===2)c.set(0x879d9b);
        c.multiplyScalar(.89+random(x*3+y*17+z*13)*.2);
        if(type==='crystal')c.multiplyScalar(1.25);
        for(let i=f*18;i<f*18+18;i+=3){positions.push(p[i]+x,p[i+1]+y,p[i+2]+z);normals.push(n[i],n[i+1],n[i+2]);colors.push(c.r,c.g,c.b);}
      }
    }
    geo.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingSphere();
    this.terrain=new THREE.Mesh(g,this.blocksMaterial);this.scene.add(this.terrain);this.revision=this.game.world.revision;
  }
  buildMotes(){
    const positions=[],colors=[];for(let i=0;i<100;i++){positions.push((random(i)-.5)*25,5+random(i+8)*10,(random(i+17)-.5)*24);const c=new THREE.Color(i%4===0?0xffd89d:0x9de9cc);colors.push(c.r,c.g,c.b);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.motes=new THREE.Points(g,new THREE.PointsMaterial({size:.055,vertexColors:true,transparent:true,opacity:.8,depthWrite:false}));this.scene.add(this.motes);
  }
  updateCamera(dt,immediate=false){
    const p=this.game.player;let target;
    if(this.active){target=v(p.x,p.y+1,p.z-1.8);}else target=v(.1,6.4,-.8);
    this.lookAt.lerp(target,immediate?1:1-Math.exp(-dt*4));
    const yaw=this.active?this.yaw:.47,zoom=this.active?this.zoom:24,pitch=this.active?this.pitch:.38;
    const desired=this.lookAt.clone().add(v(Math.sin(yaw)*zoom*Math.cos(pitch),Math.sin(pitch)*zoom,Math.cos(yaw)*zoom*Math.cos(pitch)));
    // Keep the camera above solid terrain, even when orbiting a raised ledge.
    desired.y=Math.max(desired.y,this.game.world.surface(desired.x,desired.z)+1);
    this.camera.position.lerp(desired,immediate?1:1-Math.exp(-dt*5));this.camera.lookAt(this.lookAt);
  }
  setCursor(x,y){this.cursor={x,y};}
  pick(){
    const rect=this.canvas.getBoundingClientRect();this.ndc.set((this.cursor.x-rect.left)/rect.width*2-1,-(this.cursor.y-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.ndc,this.camera);const r=this.raycaster.ray;this.target=this.game.world.raycast(r.origin,r.direction,60);return this.target;
  }
  burst(position,type){
    const group=new THREE.Group(),color=type==='crystal'?0xa5ffeb:type==='stone'?0xbad5d4:0xd2d9a2;
    group.position.set(position.x,position.y,position.z);const m=basic(color);
    for(let i=0;i<16;i++){const p=this.mesh(new THREE.OctahedronGeometry(.07),m,v(),null,group);p.userData.velocity=v((random(i)-.5)*5,1+random(i+18)*4,(random(i+7)-.5)*5);}
    const ring=this.mesh(new THREE.TorusGeometry(.1,.012,3,50),basic(0xb7ffe5,.8),v(),null,group);ring.rotation.x=Math.PI/2;group.userData={age:0,ring};this.scene.add(group);this.effects.push(group);
  }
  setQuality(value){const ratio={low:1,balanced:1.5,high:2}[value]??1.5;this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));this.renderer.setSize(innerWidth,innerHeight);this.clouds.visible=value!=='low';this.motes.visible=value!=='low';}
  update(dt,moving=false){
    this.elapsed+=dt;const t=this.elapsed;
    if(this.revision!==this.game.world.revision)this.rebuildTerrain();
    this.updateCamera(dt);this.character.position.set(this.game.player.x,this.game.player.y,this.game.player.z);
    if(moving){this.avatarBody.rotation.z=Math.sin(t*10)*.035;this.legs[0].rotation.x=Math.sin(t*10)*.5;this.legs[1].rotation.x=-Math.sin(t*10)*.5;}else{this.avatarBody.rotation.z=0;this.legs.forEach(l=>l.rotation.x=0);}
    if(this.motion){this.shrineSword.position.y=7.9+Math.sin(t*.8)*.15;this.halo.rotation.z=Math.sin(t*.08)*.03;this.orbitRing.rotation.y=.2+Math.sin(t*.12)*.2;this.motes.rotation.y=t*.012;this.clouds.rotation.y=t*.003;this.scarf.rotation.x=Math.sin(t*2)*.08;}
    const familiarTarget=this.game.mining?v(this.game.mining.x,this.game.mining.y+1,this.game.mining.z+.5):v(this.game.player.x+.7,this.game.player.y+1.3+Math.sin(t*2)*.08,this.game.player.z-.4);
    this.familiar.position.lerp(familiarTarget,1-Math.exp(-dt*7));this.familiar.rotation.z=this.game.mining?-.7+Math.sin(t*22)*.5:-.3;
    const target=this.active?this.pick():null;this.selection.visible=!!target&&this.game.canReach(target);if(this.selection.visible)this.selection.position.set(target.x,target.y,target.z);
    this.cracks.visible=!!this.game.mining&&this.game.progress>0;
    if(this.cracks.visible){const m=this.game.mining;this.cracks.position.set(m.x,m.y,m.z);this.crackMaterial.map=this.crackTextures[Math.min(5,Math.floor(this.game.progress*6))];}
    const ids=new Set();for(const d of this.game.drops){
      ids.add(d.id);let mesh=this.dropMeshes.get(d.id);
      if(!mesh){const color=MATERIALS[d.type].color,material=mat(color,{emissive:d.type==='crystal'?0x64bba6:0x223b32,emissiveIntensity:.3});mesh=new THREE.Mesh(new THREE.BoxGeometry(.38,.38,.38),material);const border=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0xc4e0c4,transparent:true,opacity:.5}));mesh.add(border);this.scene.add(mesh);this.dropMeshes.set(d.id,mesh);}
      mesh.position.set(d.x,d.y,d.z);mesh.rotation.y=d.rotation; // No bobbing: items remain on the physical floor.
    }
    for(const [id,m] of this.dropMeshes)if(!ids.has(id)){this.scene.remove(m);m.geometry.dispose();m.material.dispose();for(const child of m.children){child.geometry.dispose();child.material.dispose();}this.dropMeshes.delete(id);}
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.userData.age+=dt;const age=e.userData.age;for(const child of e.children){if(child.userData.velocity){child.position.addScaledVector(child.userData.velocity,dt);child.userData.velocity.y-=8*dt;}if(child.material.transparent)child.material.opacity=Math.max(0,1-age*1.7);}e.userData.ring.scale.setScalar(1+age*12);if(age>.65){this.scene.remove(e);e.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});this.effects.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  performance(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pixelRatio:this.renderer.getPixelRatio(),threeRevision:THREE.REVISION};}
}
