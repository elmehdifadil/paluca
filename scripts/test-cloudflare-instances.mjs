import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import assert from 'node:assert/strict';
import path from 'node:path';

// Build first: wrangler deploy --dry-run --outdir .wrangler/instance-test
const runtime = new Miniflare(convertV4MiniflareOptions({
  workers: [{
  name: 'paluca-test',
  modules: true,
  scriptPath: path.resolve('.wrangler/instance-test/worker.js'),
  compatibilityDate: '2026-10-12',
  compatibilityFlags: ['nodejs_compat', 'enable_nodejs_http_server_modules'],
  bindings: { CLOUDFLARE_WORKER: 'true' },
  durableObjects: { PALUCA_STORE: { className: 'PalucaStore', useSQLite: true } },
  }],
}));
try {
  const namespace = await runtime.getDurableObjectNamespace('PALUCA_STORE');
  const objects = ['first', 'second', 'third'].map(name=>namespace.get(namespace.idFromName(name)));
  for (const object of objects) {
    const response = await object.fetch('https://local.test/api/health');
    assert.equal(response.status,200);
    assert.equal((await response.json()).status,'ok');
  }
  const [first,second] = objects;
  const login = await first.fetch('https://local.test/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'conseiller',password:'anapec2026'})});
  assert.equal(login.status,200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const privateRequest = object=>object.fetch('https://local.test/api/candidates',{headers:{cookie}});
  assert.equal((await privateRequest(first)).status,200);
  assert.equal((await privateRequest(second)).status,401);
  await Promise.all(objects.map(async object=>{
    const response=await object.fetch('https://local.test/api/health');
    assert.equal(response.status,200);
  }));
  console.log('PASS: three objects in one runtime, repeated/concurrent requests, isolated sessions; no EADDRINUSE');
} finally { await runtime.dispose(); }
