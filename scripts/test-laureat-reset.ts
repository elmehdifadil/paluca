import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
process.env.PALUCA_STORE_FILE=path.resolve('.private/reset-test.json');process.env.STORE_ENCRYPTION_KEY='isolated-test-only';delete process.env.VERCEL;
const seed=JSON.parse(fs.readFileSync('data/store.json','utf8'));
const original={...seed,schemaVersion:2,resetHistory:[],laureatResetAt:undefined,profils:[{id:'delete-1',email:'one@example.test',password:'test-pass',actif:true},{id:'delete-2',email:'two@example.test',deleted:true}],rdvs:[{id:'rdv-delete',email:'one@example.test',creneauId:'slot-delete'}],inscriptions:[{id:'ins-delete',email:'one@example.test'}],sessions:[],creneaux:[{id:'slot-delete',reserve:true,status:'reserve',candidat_nom:'Fictif'},{id:'slot-blocked',reserve:false,status:'blocked'}]};
fs.writeFileSync(process.env.PALUCA_STORE_FILE,JSON.stringify(original));
const {apiRouter}=await import('../src/apiRouter.js');const {decryptStore}=await import('../src/persistentStore.js');
const app=express();app.use(express.json());app.use('/api',apiRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
async function api(route:string,cookie='',body?:any){const r=await fetch(url+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:(await r.json()) as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};}
try{
 assert.equal((await api('admin/laureats/reset-plan')).status,401);
 const student=(await api('auth/login','',{email:'one@example.test',password:'test-pass'})).cookie;
 const advisor=(await api('auth/admin','',{username:'conseiller',password:'anapec2026'})).cookie;
 const admin=(await api('auth/admin','',{username:'admin',password:'admin2026'})).cookie;
 assert.equal((await api('admin/laureats/reset-plan',student)).status,403);assert.equal((await api('admin/laureats/reset-plan',advisor)).status,403);
 const plan=(await api('admin/laureats/reset-plan',admin)).data;assert.equal(plan.counts.laureats,2);
 assert.equal((await api('admin/laureats/reset',admin,{fingerprint:plan.fingerprint})).status,409);
 assert.equal((await api('admin/laureats/reset',admin,{confirm:'DELETE_ALL_LAUREATS',fingerprint:'stale'})).status,409);
 let disk=JSON.parse(fs.readFileSync(process.env.PALUCA_STORE_FILE,'utf8'));assert.equal(disk.profils.length,2);
 const result=await api('admin/laureats/reset',admin,{confirm:'DELETE_ALL_LAUREATS',fingerprint:plan.fingerprint});assert.equal(result.status,200);assert.equal(result.data.remaining,0);
 disk=JSON.parse(fs.readFileSync(process.env.PALUCA_STORE_FILE,'utf8'));
 assert.deepEqual([disk.profils.length,disk.rdvs.length,disk.inscriptions.length],[0,0,0]);assert.equal(disk.sessions.some((s:any)=>s.role==='laureat'),false);assert.equal(disk.creneaux[0].reserve,false);assert.equal(disk.creneaux[0].candidat_nom,undefined);assert.equal(disk.creneaux[1].status,'blocked');
 for(const key of ['banners','ateliers','prestations','evenements','conseillers','publications'])assert.deepEqual(disk[key],original[key]);
 const backup=decryptStore(fs.readFileSync(disk.resetHistory[0].backup,'utf8'));assert.equal(backup.profils.length,2);assert.equal(backup.rdvs.length,1);
 assert.equal((await api('me',student)).status,401);
 assert.equal((await api('migration/local',advisor,{collections:{profils:original.profils,rdvs:original.rdvs,inscriptions:original.inscriptions}})).data.imported,0);
 assert.equal((await api('data',advisor,{key:'inscriptions',value:original.inscriptions})).status,400);
 assert.equal((await api('candidates',admin)).data.count,0);
 console.log('PASS : suppression isolée, administration exclusive, périmètre exact, sauvegarde chiffrée relue, catalogues conservés, créneaux libérés, sessions révoquées et aucune réimportation des dossiers supprimés.');
}finally{await new Promise<void>(r=>server.close(()=>r()));}

