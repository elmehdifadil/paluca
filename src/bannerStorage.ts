import { currentPlatformStorage } from './persistentStore.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {put} from '@vercel/blob';

export async function persistBannerImage(value:string,prefix='banner',options:{vercel?:boolean;upload?:typeof put}={}) {
 if(typeof value!=='string'||!value)throw new Error('Image manquante.');
 const platform=currentPlatformStorage();
 const vercel=options.vercel??!!process.env.VERCEL;
 let buffer:Buffer,mime:string,ext:string;
 const match=value.match(/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\r\n]+)$/);
 if(match){mime=match[1];ext=mime==='image/jpeg'?'jpg':mime==='image/svg+xml'?'svg':mime.slice(6);buffer=Buffer.from(match[2],'base64');}
 else if(/^\/(?:uploads|assets)\//.test(value)){
  if(!vercel)return value;
  const root=path.resolve('public');const filename=path.resolve(root,'.'+value);
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename))throw new Error('Image locale introuvable pour le stockage permanent.');
  buffer=fs.readFileSync(filename);ext=path.extname(filename).slice(1).toLowerCase();mime=({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'} as any)[ext];if(!mime)throw new Error('Format d’image non reconnu.');
 }
 else if(/^https:\/\//.test(value))return value;
 else throw new Error('Image ou adresse non valide.');
 if(platform)return platform.upload(prefix+'_'+randomUUID()+'.'+ext,buffer,mime);
 if(!buffer.length||buffer.length>15*1024*1024)throw new Error('L’image doit contenir un fichier valide de 15 Mo maximum.');
 if(vercel){
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Stockage permanent des images non configuré.');
  const result=await (options.upload||put)(`paluca/media/banners/${randomUUID()}.${ext}`,buffer,{token:process.env.BLOB_READ_WRITE_TOKEN,access:'public',contentType:mime,addRandomSuffix:false,allowOverwrite:false});return result.url;
 }
 const filename=`${prefix.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,30)}_${randomUUID()}.${ext}`;
 const directory=path.resolve('public/uploads');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,filename),buffer,{flag:'wx'});
 const dist=path.resolve('dist/uploads');if(fs.existsSync(path.resolve('dist'))){fs.mkdirSync(dist,{recursive:true});fs.writeFileSync(path.join(dist,filename),buffer,{flag:'wx'});}
 return '/uploads/'+filename;
}
