import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Game, MATERIALS, generateIsland, MAX, MIN } from '../src/game.mjs';

const pos = (x,y,z) => ({x,y,z});
function fixture(type='dirt') {
  const w=new World();
  for(let x=-7;x<=7;x++) for(let z=-7;z<=7;z++) w.set(x,0,z,'bedrock');
  w.set(0,1,0,type);
  return new Game(w,{player:pos(0,0.5,2),inventory:{dirt:2,stone:1,crystal:0}});
}
function advance(g,seconds) { for(let t=0;t<seconds-1e-8;t+=.01) g.tick(Math.min(.01,seconds-t)); }

test('single click does not destroy dirt',()=>{ const g=fixture();g.beginMining(pos(0,1,0));advance(g,.05);g.endMining();assert.equal(g.world.get(0,1,0),'dirt');assert.equal(g.progress,0); });
test('dirt requires sustained hold and breaks in less than one second',()=>{ const g=fixture();g.beginMining(pos(0,1,0));advance(g,.7);assert.equal(g.world.get(0,1,0),'dirt');advance(g,.1);assert.equal(g.world.get(0,1,0),null);assert.equal(g.stats.mined,1); });
test('stone needs approximately two seconds',()=>{ const g=fixture('stone');g.beginMining(pos(0,1,0));advance(g,1.99);assert.equal(g.world.get(0,1,0),'stone');advance(g,.03);assert.equal(g.world.get(0,1,0),null); });
test('release resets all mining progress',()=>{ const g=fixture();g.beginMining(pos(0,1,0));advance(g,.5);g.endMining();g.beginMining(pos(0,1,0));advance(g,.5);assert.equal(g.world.get(0,1,0),'dirt');advance(g,.3);assert.equal(g.world.get(0,1,0),null); });
test('changing target resets cracks',()=>{ const g=fixture();g.world.set(1,1,0,'dirt');g.beginMining(pos(0,1,0));advance(g,.5);g.beginMining(pos(1,1,0));assert.equal(g.progress,0);advance(g,.5);assert.equal(g.world.get(1,1,0),'dirt'); });
test('mining out of reach is rejected',()=>{ const g=fixture();g.player=pos(0,.5,10);assert.equal(g.beginMining(pos(0,1,0)),false); });
test('bedrock cannot be mined',()=>{const g=fixture();assert.equal(g.beginMining(pos(1,0,0)),false);});
test('drop preserves the destroyed material and does not add inventory until collected',()=>{ const g=fixture('stone');g.player=pos(0,.5,5);g.beginMining(pos(0,1,0));advance(g,2.01);assert.equal(g.drops.length,1);assert.equal(g.drops[0].type,'stone');assert.equal(g.inventory.stone,1); });
test('falling item lands on solid ground even after a large timestep',()=>{ const g=fixture();g.player=pos(10,1,10);g.spawnDrop('dirt',pos(3,8,0),pos(0,0,0));g.updateDrops(4);assert.equal(g.drops.length,1);assert.ok(Math.abs(g.drops[0].y-(.5+.19))<.001);assert.equal(g.drops[0].vy,0); });
test('drop starts falling when support is removed',()=>{ const g=fixture();g.player=pos(9,2,9);g.world.set(3,2,0,'stone');g.spawnDrop('dirt',pos(3,2.69,0),pos(0,0,0));g.updateDrops(.1);g.world.delete(3,2,0);g.updateDrops(.2);assert.ok(g.drops[0].y<2.69); });
test('outside three cells there is no attraction',()=>{ const g=fixture();g.world.delete(0,1,0);g.player=pos(0,-.11,0);g.spawnDrop('dirt',pos(3.001,.69,0),pos(0,0,0));g.updateDrops(.1);assert.equal(g.drops[0].state,'falling');assert.equal(g.drops[0].x,3.001); });
test('at exactly three cells attraction begins',()=>{ const g=fixture();g.world.delete(0,1,0);g.player=pos(0,-.11,0);g.spawnDrop('dirt',pos(3,.69,0),pos(0,0,0));g.updateDrops(.01);assert.equal(g.drops[0].state,'attracting');assert.ok(g.drops[0].x<3); });
test('leaving the pickup radius cancels attraction',()=>{ const g=fixture();g.world.delete(0,1,0);g.spawnDrop('dirt',pos(2,1.3,2),pos(0,0,0));g.updateDrops(.01);g.player=pos(10,.5,2);g.updateDrops(.01);assert.equal(g.drops[0].state,'falling'); });
test('collection credits exactly once',()=>{ const g=fixture();g.world.delete(0,1,0);g.spawnDrop('crystal',pos(0,1.3,2),pos(0,0,0));g.updateDrops(.01);g.updateDrops(1);assert.equal(g.inventory.crystal,1);assert.equal(g.drops.length,0); });
test('zero inventory cannot place or become negative',()=>{ const g=fixture();assert.equal(g.place(pos(2,1,0),'crystal'),false);assert.equal(g.world.get(2,1,0),null);assert.equal(g.inventory.crystal,0); });
test('placement consumes one and rejects occupied or unsupported cells',()=>{ const g=fixture();assert.equal(g.place(pos(2,1,0),'dirt'),true);assert.equal(g.inventory.dirt,1);assert.equal(g.place(pos(2,1,0),'dirt'),false);assert.equal(g.place(pos(5,3,0),'dirt'),false);assert.equal(g.inventory.dirt,1); });
test('placement cannot intersect player',()=>{ const g=fixture();assert.equal(g.place(pos(0,1,2),'dirt'),false);assert.equal(g.inventory.dirt,2); });
test('placement and world reject out-of-bounds cells',()=>{ const g=fixture();assert.equal(g.place(pos(MAX+1,1,0),'dirt'),false);assert.throws(()=>g.world.set(MIN-1,0,0,'dirt')); });
test('complete mine drop pickup place cycle restores starting inventory and world',()=>{ const g=fixture();const before={...g.inventory};g.beginMining(pos(0,1,0));advance(g,.8);advance(g,1.5);assert.equal(g.drops.length,0);assert.equal(g.inventory.dirt,before.dirt+1);assert.equal(g.place(pos(0,1,0),'dirt'),true);assert.deepEqual(g.inventory,before);assert.equal(g.world.get(0,1,0),'dirt'); });
test('save/reload preserves mined terrain, inventory and uncollected items',()=>{const g=fixture();g.world.delete(0,1,0);g.spawnDrop('stone',pos(3,2,3));const saved=JSON.stringify(g.serialize());const loaded=Game.restore(JSON.parse(saved));assert.equal(loaded.world.get(0,1,0),null);assert.deepEqual(loaded.inventory,g.inventory);assert.equal(loaded.drops.length,1);assert.equal(loaded.drops[0].type,'stone');});
test('corrupt saves are rejected',()=>{assert.throws(()=>Game.restore({version:999}));const g=fixture();const s=g.serialize();s.inventory.dirt=-1;assert.throws(()=>Game.restore(s));});
test('deterministic island is within the 32-cubed bound',()=>{const a=generateIsland(),b=generateIsland();assert.deepEqual([...a.blocks],[...b.blocks]);assert.ok(a.blocks.size>1000);for(const [k,type] of a.blocks){const [x,y,z]=k.split(',').map(Number);assert.ok(x>=MIN&&x<=MAX&&z>=MIN&&z<=MAX&&y>=0&&y<32);assert.ok(MATERIALS[type]);}});
test('player lands at the exact ground height and stays grounded',()=>{const g=fixture();g.player=pos(3,4,3);for(let i=0;i<200;i++)g.movePlayer(0,0,.01);assert.ok(Math.abs(g.player.y-.5)<.001);assert.equal(g.grounded,true);});
test('jump returns to the same ground without tunnelling',()=>{const g=fixture();g.player=pos(3,.5,3);g.movePlayer(0,0,.02);g.movePlayer(0,0,.02,true);assert.ok(g.player.y>.5);for(let i=0;i<200;i++)g.movePlayer(0,0,.01);assert.ok(Math.abs(g.player.y-.5)<.001);});
test('voxel raycast returns the visible cell and outward placement normal',()=>{const g=fixture();const hit=g.world.raycast(pos(0,1,4),pos(0,0,-1));assert.equal(hit.type,'dirt');assert.deepEqual(hit.normal,pos(0,0,1));});
