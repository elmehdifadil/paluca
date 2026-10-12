import type { PlatformStorage } from './platformStorage.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, head, put, BlobNotFoundError, BlobServiceNotAvailable, BlobServiceRateLimited, BlobRequestAbortedError } from '@vercel/blob';

type Context = { data: any; dirty: boolean; etag?: string; revision: number; platform?: PlatformStorage };
const contexts = new AsyncLocalStorage<Context>();
const blobPath = process.env.VERCEL_ENV === 'preview' ? 'paluca/preview-state-v2.encrypted' : 'paluca/state-v2.encrypted';
const filePath = () => process.env.PALUCA_STORE_FILE || path.join(process.cwd(), 'data', 'store.json');
let localRevision = 0;
const privateToken=()=>process.env.PALUCA_PRIVATE_READ_WRITE_TOKEN;
const stateOptions=()=>({token:privateToken()||process.env.BLOB_READ_WRITE_TOKEN,access:privateToken()?'private' as const:'public' as const});
export function currentPlatformStorage() { return contexts.getStore()?.platform; }
export function currentStore() { const c = contexts.getStore(); if (!c) throw new Error('Transaction requise'); return c.data; }
export function markStoreDirty() { contexts.getStore()!.dirty = true; }
function encryptionKey() {
  const secret = process.env.STORE_ENCRYPTION_KEY || process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret) throw new Error('Stockage persistant non configuré');
  return createHash('sha256').update(secret).digest();
}
export function encryptStore(data: any) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: bytes.toString('base64') });
}
export function decryptStore(value: string) {
  const item = JSON.parse(value); const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(item.iv, 'base64'));
  cipher.setAuthTag(Buffer.from(item.tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(item.data, 'base64')), cipher.final()]).toString('utf8'));
}
export function migrateStore(data: any) {
  data.profils ||= []; data.rdvs ||= []; data.sessions ||= [];
  for (const p of data.profils) {
    p.id ||= randomBytes(12).toString('hex');
    if (!p.fiabilisationStatut) {
      const ongoing = p.fiabilise === true || p.rdvRealise || p.statut === 'rendez_vous_realise' || p.statut === 'rendez_vous_reserve' || p.prestations?.length || p.prescriptions?.length ||
        data.inscriptions?.some((i:any)=>i.email===p.email && i.statut!=='annule') ||
        data.rdvs.some((r: any) => (r.email || r.candidat_email || '').toLowerCase() === (p.email || '').toLowerCase() && !['cancelled','refused'].includes(r.status));
      p.fiabilisationStatut = ongoing ? 'fiabilise' : 'en_attente';
      p.fiabilise = ongoing;
      p.historique ||= [];
      p.historique.push({ id: randomBytes(12).toString('hex'), timestamp: new Date().toISOString(), action: 'Migration du parcours', details: ongoing ? 'Continuité de l’accompagnement existant conservée ; aucune nouvelle vérification affirmée.' : 'Dossier transmis pour fiabilisation.', modifiePar: 'Migration système' });
    }
  }
  data.schemaVersion = 2;
  return data;
}
function transientReadError(error:any){return error instanceof BlobServiceNotAvailable||error instanceof BlobServiceRateLimited||error instanceof BlobRequestAbortedError||error instanceof BlobNotFoundError||['AbortError','TimeoutError','BlobNotFoundError','STORE_REVISION_UNAVAILABLE'].includes(error?.name)||[408,429,500,502,503,504].includes(error?.statusCode||error?.status)||error?.name==='TypeError'&&error?.message==='fetch failed'||/Failed to fetch blob: (408|429|500|502|503|504)\b/.test(error?.message||'');}
export async function readPersistentCloudState(storage:any={}){
 const token=storage.token||process.env.BLOB_READ_WRITE_TOKEN,access=storage.access||'public';
 const readHead=storage.head||head;
 const readBlob=storage.get|| (access==='private'?get:async (value:string,options:any)=>{
  const url=new URL(value);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.public.blob.vercel-storage.com'))throw new Error('Unexpected storage origin');
  // The payload is already encrypted. Public CDN reads must not carry the
  // read-write credential: its Authorization header causes intermittent 403s.
  const response=await (storage.fetch||fetch)(url.href,{signal:options.abortSignal,credentials:'omit',redirect:'error'});
  if(!response.ok){const error:any=new Error('Blob download unavailable');error.status=response.status;throw error;}
  return {statusCode:response.status,stream:response.body};
 });
 const delay=storage.delay||((ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)));
 for(let attempt=0;attempt<3;attempt++){
  try{
   let metadata;try{metadata=await readHead(blobPath,{token,abortSignal:AbortSignal.timeout(8000)});}catch(error:any){if(error instanceof BlobNotFoundError||error?.name==='BlobNotFoundError')return null;throw error;}
   const revision=metadata.contentType.match(/revision=([a-f0-9]{32})/)?.[1];
   const downloadUrl=new URL(metadata.url);if(revision)downloadUrl.pathname+=`.revisions/${revision}`;
   const blob=await readBlob(downloadUrl.href,{token,access,useCache:false,abortSignal:AbortSignal.timeout(8000)});
   if(!blob||blob.statusCode!==200){const error:any=new Error('Current revision unavailable');error.name='STORE_REVISION_UNAVAILABLE';throw error;}
   return {data:migrateStore(decryptStore(await new Response(blob.stream).text())),etag:metadata.etag};
  }catch(error){if(attempt===2||!transientReadError(error))throw error;await delay(100*(attempt+1));}
 }
 throw new Error('Storage read failed');
}
async function load(): Promise<Context> {
  if(process.env.VERCEL){
   if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Persistent storage configuration missing');
   const loaded=await readPersistentCloudState(stateOptions());
   if(!loaded&&privateToken())throw new Error('Persistent private state missing');
   if(loaded)return {...loaded,dirty:false,revision:0};
   // Never silently replace an existing production database with bundled seed data.
   if(process.env.VERCEL_ENV!=='preview'&&process.env.PALUCA_ALLOW_INITIAL_STORE!=='true')throw new Error('Persistent production state missing');
  }
  const data = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  const migrated = data.schemaVersion !== 2;
  return { data: migrateStore(data), dirty: !!process.env.VERCEL || migrated, revision: localRevision };
}
async function commit(c: Context) {
  if (!c.dirty) return;
  if(c.platform){ c.platform.write(c.data); return; }
  if (process.env.VERCEL) {
    const revision=randomBytes(16).toString('hex');const encrypted=encryptStore(c.data);
    await put(`${blobPath}.revisions/${revision}`,encrypted,{...stateOptions(),addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});
    await put(blobPath, encrypted, { ...stateOptions(),addRandomSuffix: false, contentType: `application/octet-stream; revision=${revision}`, ...(c.etag ? { ifMatch: c.etag } : { allowOverwrite: false }) });
  } else {
    if (c.revision !== localRevision) throw new Error('STORE_CONFLICT');
    const target = filePath(); const temp = target + '.pending';
    fs.writeFileSync(temp, JSON.stringify(c.data, null, 2)); fs.renameSync(temp, target); localRevision++;
  }
}
export function platformMiddleware(platform: PlatformStorage) {
  return (req: any, res: any, next: any) => handleStore(req,res,next,platform);
}
export function storeMiddleware(req: any, res: any, next: any) {
  return handleStore(req,res,next);
}
async function handleStore(req: any, res: any, next: any, platform?: PlatformStorage) {
  try {
    const c: Context = platform ? {data:migrateStore(platform.read() || {}),dirty:true,revision:0,platform} : await load();
    const json = res.json.bind(res);
    res.json = (payload: any) => {
      commit(c).then(() => json(payload)).catch((error) => { console.error('STORE_COMMIT_FAILED', error?.name, error?.message); res.status(409); json({ success: false, error: 'Enregistrement impossible ou modification concurrente. Rechargez le dossier et réessayez.' }); });
      return res;
    };
    contexts.run(c, next);
  } catch(error:any) { let detail=String(error?.message||'');for(const secret of [privateToken(),process.env.BLOB_READ_WRITE_TOKEN,process.env.STORE_ENCRYPTION_KEY,process.env.VERCEL_OIDC_TOKEN])if(secret)detail=detail.split(secret).join('[redacted]');detail=detail.replace(/https?:\/\/\S+|Bearer\s+\S+|vercel_blob_rw_\S+/gi,'[redacted]').slice(0,220);console.error('STORE_READ_FAILED',{name:error?.constructor?.name||error?.name,code:error?.code||error?.cause?.code||null,status:error?.status||error?.statusCode||null,detail});res.status(503).json({ success: false, error: 'Stockage persistant indisponible. Aucune modification n’a été enregistrée.' }); }
}
// A reset backup is encrypted before storage and contains the original state.
// Failure to save this copy aborts the reset; the active state is untouched.
export async function backupCurrentStore() {
 const id=randomBytes(16).toString('hex');const data=currentStore();
 const platform=currentPlatformStorage();if(platform){if(!platform.backup)throw new Error('Sauvegarde non configurée');return platform.backup(data);}
 if(process.env.VERCEL){const pathname=`${blobPath}.backups/before-laureat-reset-${id}`;await put(pathname,encryptStore(data),{...stateOptions(),addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});return pathname;}
 const directory=path.join(process.cwd(),'.private','reset-backups');fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,`before-laureat-reset-${id}.encrypted`);fs.writeFileSync(target,encryptStore(data),{flag:'wx'});return target;
}

