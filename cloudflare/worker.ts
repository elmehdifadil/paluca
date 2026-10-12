import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import express from 'express';
import { createApiRouter } from '../src/apiRouter.ts';

interface Env {
  ASSETS: Fetcher;
  PALUCA_STORE: DurableObjectNamespace<PalucaStore>;
  UPLOADS: R2Bucket;
}

// One named object owns the platform store. SQLite replaces data/store.json.
export class PalucaStore extends DurableObject<Env> {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS platform_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    app.use('/api', createApiRouter({
      read() {
        const rows = sql.exec<{ data: string }>('SELECT data FROM platform_store WHERE id = 1').toArray();
        return rows.length ? JSON.parse(rows[0].data) : null;
      },
      write(data) {
        sql.exec('INSERT INTO platform_store (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(data));
      },
      async upload(key, data, contentType) {
        await env.UPLOADS.put(key, data, { httpMetadata: { contentType } });
        return '/uploads/' + encodeURIComponent(key);
      },
      async download(key) {
        const object = await env.UPLOADS.get(key);
        return object ? { data: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType || 'application/octet-stream' } : null;
      },
    }));
    app.use((_req, res) => { res.status(404).json({ error: 'Route API introuvable' }); });
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(error);
      res.status(500).json({ error: 'Erreur serveur' });
    });
    app.listen(3000);
  }

  fetch(request: Request): Promise<Response> {
    // Keep read/modify/write sequences ordered, including asynchronous uploads.
    const result = this.pending.then(async () => {
      const response = await handleAsNodeRequest(3000, request);
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
      const key = decodeURIComponent(url.pathname.slice('/uploads/'.length));
      const object = await env.UPLOADS.get(key);
      if (!object) return new Response('Fichier introuvable', { status: 404 });
      const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', ETag: object.httpEtag });
      object.writeHttpMetadata(headers);
      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
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
