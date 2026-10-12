import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import express from 'express';
import { createApiRouter } from '../src/apiRouter.ts';
import seed from './public-seed.json';

interface Env {
  ASSETS: Fetcher;
  PALUCA_STORE: DurableObjectNamespace<PalucaStore>;
}

// One named object owns the platform store. SQLite replaces data/store.json.
export class PalucaStore extends DurableObject<Env> {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly httpPort: number;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS platform_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS platform_files (key TEXT PRIMARY KEY, content_type TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS platform_file_chunks (key TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (key, part))');
    sql.exec('CREATE TABLE IF NOT EXISTS platform_backups (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    app.use('/api', createApiRouter({
      read() {
        const rows = sql.exec<{ data: string }>('SELECT data FROM platform_store WHERE id = 1').toArray();
        if (!rows.length) return structuredClone(seed);
        const data = JSON.parse(rows[0].data);
        // Upgrade the old deployment's defaults without reviving deleted accounts.
        if (data.schemaVersion !== 2) return {...data, ...structuredClone(seed), profils:data.profils || [], rdvs:data.rdvs || [], inscriptions:data.inscriptions || [], sessions:[]};
        return data;
      },
      write(data) {
        sql.exec('INSERT INTO platform_store (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(data));
      },
      async backup(data) {
        const id = crypto.randomUUID();
        sql.exec('INSERT INTO platform_backups (id, data) VALUES (?, ?)', id, JSON.stringify(data));
        return 'sqlite-backup:' + id;
      },
      async upload(key, data, contentType) {
        if (data.byteLength > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux : maximum 10 Mio');
        ctx.storage.transactionSync(() => {
          sql.exec('INSERT OR REPLACE INTO platform_files (key, content_type) VALUES (?, ?)', key, contentType);
          sql.exec('DELETE FROM platform_file_chunks WHERE key = ?', key);
          // Stay below SQLite's limit of 2 MB per row, including large documents.
          const chunkSize = 512 * 1024;
          for (let offset = 0, part = 0; offset < data.byteLength; offset += chunkSize, part++) {
            const chunk = new Uint8Array(data.subarray(offset, offset + chunkSize));
            sql.exec('INSERT INTO platform_file_chunks (key, part, data) VALUES (?, ?, ?)', key, part, chunk.buffer);
          }
        });
        return '/uploads/' + encodeURIComponent(key);
      },
      async download(key) {
        const files = sql.exec<{ content_type: string }>('SELECT content_type FROM platform_files WHERE key = ?', key).toArray();
        if (!files.length) return null;
        const chunks = sql.exec<{ data: ArrayBuffer }>('SELECT data FROM platform_file_chunks WHERE key = ? ORDER BY part', key).toArray();
        const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.data.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          result.set(new Uint8Array(chunk.data), offset);
          offset += chunk.data.byteLength;
        }
        return { data: result.buffer, contentType: files[0].content_type };
      },
    }));
    app.use((_req, res) => { res.status(404).json({ error: 'Route API introuvable' }); });
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(error);
      res.status(500).json({ error: 'Erreur serveur' });
    });
    // Objects can share an isolate or be recreated while an old server remains.
    // Port 0 lets the runtime allocate an unused routing port for this instance.
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Serveur HTTP non initialisé');
    this.httpPort = address.port;
  }

  fetch(request: Request): Promise<Response> {
    // Keep read/modify/write sequences ordered, including asynchronous uploads.
    const result = this.pending.then(async () => {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/uploads/') && ['GET','HEAD'].includes(request.method)) {
        const key = decodeURIComponent(url.pathname.slice('/uploads/'.length));
        const metadata = this.ctx.storage.sql.exec<{content_type:string}>('SELECT content_type FROM platform_files WHERE key = ?',key).toArray();
        if (!metadata.length) return new Response('Fichier introuvable',{status:404});
        const chunks = this.ctx.storage.sql.exec<{data:ArrayBuffer}>('SELECT data FROM platform_file_chunks WHERE key = ? ORDER BY part',key).toArray();
        const body = new Blob(chunks.map(chunk => chunk.data));
        return new Response(request.method === 'HEAD' ? null : body,{headers:{'Content-Type':metadata[0].content_type,'X-Content-Type-Options':'nosniff'}});
      }
      const response = await handleAsNodeRequest(this.httpPort, request);
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, headers: response.headers });
    });
    this.pending = result.catch(() => undefined);
    return result;
  }
}

const adminPaths = new Set(['/admin', '/dashboard', '/chercheurs', '/prestations', '/creneaux', '/rendez-vous', '/ateliers', '/evenements', '/bannieres', '/publications', '/inscriptions']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return env.PALUCA_STORE.get(env.PALUCA_STORE.idFromName('paluca')).fetch(request);
    }
    if (url.pathname.startsWith('/uploads/')) {
      const response = await env.PALUCA_STORE.get(env.PALUCA_STORE.idFromName('paluca')).fetch(request);
      return response.status === 404 ? env.ASSETS.fetch(request) : response;
    }
    const aliases: Record<string, string> = {
      '/': '/index.html', '/espace': '/espace.html', '/connexion': '/connexion.html', '/login': '/connexion.html',
      '/inscription': '/inscription.html', '/register': '/inscription.html', '/public/manifest.json': '/manifest.json',
    };
    const path = url.pathname.replace(/\/$/, '') || '/';
    const page = aliases[path] || (adminPaths.has(path) || /^\/(chercheurs|prestations)\/[^/]+$/.test(path) ? '/admin.html' : undefined);
    if (page) url.pathname = page;
    return env.ASSETS.fetch(page ? new Request(url, request) : request);
  },
} satisfies ExportedHandler<Env>;
