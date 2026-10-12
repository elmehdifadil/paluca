import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('public/paluca-client.js','utf8');
function client(responses){let calls=0;const window={fetch:async()=>responses[Math.min(calls++,responses.length-1)]()};const context={window,location:{hostname:'localhost'},setTimeout:fn=>fn(),URL,Promise,Headers};vm.createContext(context);vm.runInContext(source,context);context.fetch=window.fetch;return {api:window.palApi,calls:()=>calls};}
const unavailable=()=>new Response(JSON.stringify({success:false,error:'indisponible'}),{status:503});
let c=client([unavailable,()=>new Response(JSON.stringify({success:true,count:1}))]);assert.equal((await c.api('candidates?nom=SALMA')).count,1);assert.equal(c.calls(),2);
c=client([unavailable]);await assert.rejects(()=>c.api('candidates'));assert.equal(c.calls(),3);
c=client([unavailable]);await assert.rejects(()=>c.api('candidates/one',{nom:'Fictif'},'PATCH'));assert.equal(c.calls(),1,'Une écriture ne doit jamais être rejouée automatiquement');
c=client([()=>new Response(JSON.stringify({success:false,error:'authentification'}),{status:401})]);await assert.rejects(()=>c.api('candidates'));assert.equal(c.calls(),1);
console.log('PASS : reprise bornée des lectures indisponibles, aucune répétition des écritures ou refus d’authentification.');

