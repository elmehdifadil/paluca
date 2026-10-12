import assert from 'node:assert/strict';
import {completeAnswers,scoreAnswers,prescribe,workshops} from '../src/accompaniment.js';
const a={p1:'oui',p2:'non',p3:'partiel',s1:'oui',s2:'Python',s3:'Rigueur',t1:'non',t2:'non',t3:'oui',m1:'non',m2:'oui',m3:'non',m4:'non'};
assert.equal(completeAnswers({...a,s2:''}),false);assert.equal(completeAnswers(a),true);
assert.deepEqual(scoreAnswers(a),{projet:50,soi:100,territoire:33,methode:25,global:52});
assert.equal(prescribe(a,scoreAnswers(a),null).status,'configuration_requise');
const cases=[['100',1],['010',2],['001',3],['110',4],['101',5],['011',6],['111',7]] as const;
for(const [bits,n]of cases){const scores={soi:bits[0]==='1'?20:90,projet:bits[1]==='1'?20:90,methode:bits[2]==='1'?20:90,territoire:10};const result=prescribe(a,scores,{thresholds:{soi:50,projet:50,methode:50,territoire:50},version:1});assert.equal(result.case,n);assert.ok(result.workshops.every(w=>workshops.some(x=>x.id===w.id)));if(n===7)assert.equal(result.workshops.length,6);if([3,5,6].includes(n)){assert.ok(result.workshops.some(w=>w.id==='methode-cv'));assert.ok(result.workshops.some(w=>w.id==='methode-entretien'));assert.ok(!result.workshops.some(w=>w.id==='methode-lettre'));}console.log('OK règle '+n);}
assert.deepEqual(prescribe(a,{soi:90,projet:90,methode:90,territoire:0},{thresholds:{soi:50,projet:50,methode:50,territoire:50}}).workshops,[]);
console.log('OK : barème original, réponses obligatoires, sept règles, aucune règle TERRITOIRE inventée.');
