import assert from 'node:assert/strict';

const base = process.env.PALUCA_TEST_URL || 'http://127.0.0.1:8787';
async function json(path, body) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, path + ': ' + await response.clone().text());
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
await Promise.all(Array.from({length: 8}, (_, i) => json('/api/data', { key: '_migration_test_' + i, value: i })));
const saved = await json('/api/data');
for (let i = 0; i < 8; i++) assert.equal(saved['_migration_test_' + i], i);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const upload = await json('/api/upload', { image: 'data:image/png;base64,' + png.toString('base64'), filename: 'test.png' });
const imageUrl = upload.url || upload.imageUrl;
assert.match(imageUrl, /^\/uploads\//);
for (const path of [imageUrl, '/api' + imageUrl]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
}
const blob = await json('/api/upload-blob', { filename: 'document.txt', fileBase64: 'data:text/plain;base64,' + Buffer.from('PALUCA migration').toString('base64') });
assert.equal(await (await fetch(base + blob.url)).text(), 'PALUCA migration');
assert.equal((await fetch(base + '/api/inconnue')).status, 404);
assert.equal((await fetch(base + '/uploads/inconnu.png')).status, 404);
console.log('PASS: pages, API, concurrent writes, R2 image/document upload and missing routes');
