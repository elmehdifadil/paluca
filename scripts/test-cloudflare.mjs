import assert from 'node:assert/strict';

const base = process.env.PALUCA_TEST_URL || 'http://127.0.0.1:8787';
let cookie = '';
async function json(path, body, expectedStatus = 200) {
  const response = await fetch(base + path, body === undefined ? {headers:{cookie}} : {
    method: 'POST', headers: { 'content-type': 'application/json',cookie }, body: JSON.stringify(body),
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal(response.status, expectedStatus, path + ': ' + await response.clone().text());
  return response.json();
}
for (const path of ['/', '/espace', '/connexion', '/login', '/inscription', '/register', '/admin', '/chercheurs/123', '/prestations/123']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /text\/html/);
}
assert.equal((await json('/api/health')).status, 'ok');
const initial = await json('/api/data');
assert.ok(Array.isArray(initial.profils));
assert.ok(Array.isArray(initial.conseillers));
// Only the local emulator may receive mutation tests.
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.equal((await fetch(base + '/api/candidates')).status,401);
await json('/api/auth/admin',{username:'conseiller',password:process.env.PALUCA_TEST_PASSWORD || 'anapec2026'});
await Promise.all(Array.from({length: 8}, (_, i) => json('/api/data', { key: 'news', value: [{id:'migration-test-'+i,titre:'Test '+i}] })));
const saved = await json('/api/data');
for (let i = 0; i < 8; i++) assert.ok(saved.news.some(row=>row.id==='migration-test-'+i));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const upload = await json('/api/upload', { image: 'data:image/png;base64,' + png.toString('base64'), filename: 'test.png' });
const imageUrl = upload.url || upload.imageUrl;
assert.match(imageUrl, /^\/uploads\//);
for (const path of [imageUrl, '/api' + imageUrl]) {
  const response = await fetch(base + path,{headers:{cookie}});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
}
const blob = await json('/api/upload-blob', { filename: 'document.txt', fileBase64: 'data:text/plain;base64,' + Buffer.from('PALUCA migration').toString('base64') });
assert.equal(await (await fetch(base + blob.url)).text(), 'PALUCA migration');
assert.equal((await fetch(base + '/api/inconnue',{headers:{cookie}})).status, 404);
assert.equal((await fetch(base + '/uploads/inconnu.png')).status, 404);
// Verify that a file spanning several SQLite rows is reassembled exactly.
const large = Buffer.alloc(1200000, 42);
const multi = await json('/api/upload-blob', { filename: 'multi.bin', fileBase64: large.toString('base64') });
assert.deepEqual(Buffer.from(await (await fetch(base + multi.url)).arrayBuffer()), large);
const id = crypto.randomUUID();
const account = {prenom:'Test',nomfamille:'Cloudflare',naissance:'2000-01-01',cin:id,email:id+'@example.test',niveau:'Master',etablissement:'UCA',filiere:'Informatique',password:'local-test-password',consentementDonnees:true};
const registered = await json('/api/profils', account,201);
assert.equal(registered.profile.fiabilisationStatut,'en_attente');
await json('/api/auth/logout',{});
const loggedIn = await json('/api/auth/login',{email:account.email,password:account.password});
assert.equal(loggedIn.profile.id,registered.profile.id);
assert.equal((await fetch(base+'/api/candidates',{headers:{cookie}})).status,403);
console.log('PASS: recent pages, authenticated API, concurrent writes, SQLite files, candidate registration/login and role restrictions');
