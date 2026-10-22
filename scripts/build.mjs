import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of ['index.html','style.css','src','assets','vendor'])await cp(path.join(root,file),path.join(dist,file),{recursive:true});
console.log('Static build ready: '+dist);
