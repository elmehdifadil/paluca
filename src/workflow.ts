import {resetPlan,removeAllLaureats} from './laureatReset.js';
import { advisorDiagnostic } from './advisorDiagnostic.js';
import { completeAnswers, scoreAnswers, prescribe, workshops, groups } from './accompaniment.js';
import { Router } from 'express';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { currentStore, markStoreDirty, backupCurrentStore } from './persistentStore.js';
import { GoogleGenAI } from '@google/genai';

export const workflow = Router();
const editable = new Set('prenom nomfamille nom naissance age sexe cin ville province adresse email tel niveau etablissement anneeDiplome filiere diplomes diplome autresDiplomes experience experienceDetail experiences expPoste expEntreprise expDebut expFin stages formations certifications competences langues langFr langEn langAr objectif domaine domaineRecherche typeEmploi typeEmploiRecherche situation statutInsertion milieu zone notes cvUrl cvName cvFilename cvUploadedAt cvOcrText cvAnalysis cvData positionnement consentementDonnees consentementUcaAnapec consentementDate'.split(' '));
const adminOnly = new Set('actif prestations prescriptions rdvRealise statut statutParcours'.split(' '));
export function publicProfile(p: any, audience?: string) {
  if(!p)return null;
  const { password, motDePasse, passhash, passwordHash, ...safe } = p;
  if(audience==='laureat'){
    if(safe.diagnosticIA)safe.diagnosticIA={status:safe.diagnosticIA.status,generatedAt:safe.diagnosticIA.generatedAt,errorCode:safe.diagnosticIA.errorCode,errorMessage:safe.diagnosticIA.errorMessage};
    delete safe.diagnosticHistory;delete safe.diagnosticValidations;
    const privateFields=new Set(['diagnosticIA','diagnosticHistory','diagnosticValidations','positionnement','cvAnalysis']);
    if(Array.isArray(safe.historique))safe.historique=safe.historique.filter((h:any)=>!privateFields.has(h.champ)).map((h:any)=>({...h,changes:Array.isArray(h.changes)?h.changes.filter((change:any)=>!privateFields.has(change.champ)):h.changes}));
    if(safe.positionnement){safe.positionnement={...safe.positionnement};delete safe.positionnement.diagnostic;delete safe.positionnement.diagnosticConseiller;}
    if(safe.cvAnalysis){safe.cvAnalysis={...safe.cvAnalysis};delete safe.cvAnalysis.diagnostic;}
  }
  return safe;
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
function oldHash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return 'h' + h.toString(36); }
function checkPassword(p: any, password: string) {
  if (p.passwordHash) { const [salt, stored] = p.passwordHash.split(':'); const b = Buffer.from(stored,'hex'); return b.length === 64 && timingSafeEqual(b, scryptSync(password,salt,64)); }
  return [password, oldHash(password)].includes(p.passhash) || p.password === password || p.motDePasse === password;
}
function record(p: any, action: string, actor: string, details = '', changes?: any) {
  p.historique ||= [];
  p.historique.push({ id: randomBytes(12).toString('hex'), timestamp: new Date().toISOString(), date: new Date().toISOString().slice(0,10), action, details, changes, modifiePar: actor });
}
export function resolveActor(req: any) {
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map((value:string)=>value.trim().split(/=(.*)/s).slice(0,2)));
  const portal=req.headers['x-paluca-portal'];
  const store=currentStore();
  const names=portal==='staff'?['paluca_staff_session','paluca_session']:portal==='candidate'?['paluca_session']:['paluca_session','paluca_staff_session'];
  let session:any=null;
  for(const name of names){const token=cookies[name];if(!token)continue;const found=store.sessions.find((s:any)=>s.tokenHash===hash(token)&&s.expires>Date.now());if(found&&(portal!=='staff'||found.role!=='laureat')&&(portal!=='candidate'||found.role==='laureat')){session={...found,cookieName:name};break;}}
  if(!session)return null;
  if (session.role === 'laureat' && !store.profils.some((p: any) => String(p.id) === session.profileId && p.actif !== false && !p.deleted)) return null;
  return session;
}
function session(req: any, res: any, role: string, actor: string, profileId?: string) {
  const store = currentStore(); const token = randomBytes(32).toString('hex');
  store.sessions = store.sessions.filter((s: any) => s.expires > Date.now());
  store.sessions.push({ tokenHash: hash(token), role, actor, profileId, expires: Date.now() + 8 * 60 * 60 * 1000 });
  markStoreDirty();
  res.setHeader('Set-Cookie', `${role==='laureat'?'paluca_session':'paluca_staff_session'}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${(process.env.VERCEL || process.env.CLOUDFLARE_WORKER) ? '; Secure' : ''}`);
}
export function requireAdvisor(req: any, res: any, next: any) { if (req.actor?.role !== 'conseiller') return res.status(403).json({success:false,error:'Action réservée au conseiller.'}); next(); }
function ownProfile(req: any) { return currentStore().profils.find((p: any) => String(p.id) === req.actor?.profileId); }
export function authorize(req: any, res: any, next: any) {
  req.actor = resolveActor(req);
  if(req.method!=='GET' && req.headers.origin){try{if(new URL(req.headers.origin).host!==req.get('host'))return res.status(403).json({error:'Origine non autorisée'});}catch{return res.status(403).json({error:'Origine non autorisée'});}}
  if(req.actor?.role==='universite'&&req.method!=='GET'&&!['/auth/logout','/auth/login','/auth/admin'].includes(req.path))return res.status(403).json({success:false,error:'Espace université en lecture seule : modification interdite.'});
  const publicRoutes = ['/auth/login','/auth/admin','/profils','/cv','/cv/parse','/parse-cv','/chat','/ocr/status','/health','/banners','/bannieres','/affiches','/conseillers'];
  if (publicRoutes.includes(req.path) && (req.method === 'GET' || ['/auth/login','/auth/admin','/profils','/cv','/cv/parse','/parse-cv','/chat'].includes(req.path))) return next();
  if (req.path === '/data' && req.method === 'GET') return next();
  if (!req.actor) return res.status(401).json({success:false,error:'Connexion requise.'});
  if(req.path.startsWith('/me') && req.actor.role!=='laureat')return res.status(403).json({error:'Action réservée au titulaire du profil.'});
  const candidateRoutes = ['/data','/auth/logout','/auth/me','/me','/me/update','/me/diagnostic','/me/corrections','/me/questionnaire','/me/questionnaire/draft','/me/prestations','/rdvs','/rdvs/book','/slots','/notify'];
  if (req.actor.role === 'laureat' && !candidateRoutes.includes(req.path)) return res.status(403).json({success:false,error:'Accès non autorisé.'});
  if (req.actor.role === 'universite' && req.method !== 'GET' && req.path !== '/auth/logout') return res.status(403).json({success:false,error:'Accès en consultation uniquement.'});
  next();
}
workflow.post('/auth/admin', (req, res) => {
  const accounts: any = { conseiller: { pass: process.env.CONSEILLER_PASSWORD || 'anapec2026', role:'conseiller' }, admin: { pass:process.env.ADMIN_PASSWORD || 'admin2026',role:'conseiller'}, universite:{pass:process.env.UNIVERSITE_PASSWORD || 'univ2026',role:'universite'} };
  const username = String(req.body.username || '').toLowerCase(); const account = accounts[username];
  if (!account || account.pass !== req.body.password) return res.status(401).json({success:false,error:'Identifiants incorrects.'});
  session(req,res,account.role,username); res.json({success:true,role:account.role});
});
workflow.post('/auth/login', (req,res) => {
  const p = currentStore().profils.find((p: any) => p.email?.toLowerCase() === String(req.body.email || '').toLowerCase() && !p.deleted);
  if (!p || !checkPassword(p,String(req.body.password || ''))) return res.status(401).json({success:false,error:'Identifiants incorrects.'});
  if (p.actif === false) return res.status(403).json({success:false,error:'Compte désactivé.'});
  if (!p.passwordHash) { p.passwordHash = passwordHash(req.body.password); delete p.password; delete p.motDePasse; delete p.passhash; }
  session(req,res,'laureat',p.email,String(p.id)); res.json({success:true,profile:publicProfile(p,'laureat')});
});
workflow.post('/auth/logout',(req,res) => { const store = currentStore(); store.sessions = store.sessions.filter((s:any) => s.tokenHash !== req.actor?.tokenHash); markStoreDirty(); res.setHeader('Set-Cookie',`${req.actor?.cookieName||'paluca_session'}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${(process.env.VERCEL || process.env.CLOUDFLARE_WORKER)?'; Secure':''}`); res.json({success:true}); });
workflow.get('/auth/me',(req,res) => res.json({success:true,role:req.actor.role,profile:req.actor.role==='laureat' ? publicProfile(ownProfile(req),'laureat') : null}));
workflow.post('/migration/local',requireAdvisor,(req,res) => {
  const store=currentStore();let imported=0;
  for(const key of ['profils','rdvs','inscriptions','creneaux','ateliers','news','banners','prestations','evenements','publications']) {
    if(store.laureatResetAt&&['profils','rdvs','inscriptions'].includes(key))continue;
    const incoming=req.body.collections?.[key];if(!Array.isArray(incoming))continue;store[key] ||= [];
    for(const original of incoming) {
      if(!original||typeof original!=='object')continue;
      if(['banners','bannieres','affiches'].includes(key)&&(store.deletedBannerIds||[]).includes(String(original.id)))continue;
      const existing=store[key].find((item:any)=>original.id&&String(item.id)===String(original.id)||key==='profils'&&original.email&&item.email===original.email);
      if(existing)continue;
      const item={...original,id:original.id||randomBytes(12).toString('hex')};
      if(key==='profils'){
        if(!item.email)continue;
        if(item.password||item.motDePasse){item.passwordHash=passwordHash(item.password||item.motDePasse);delete item.password;delete item.motDePasse;}
        delete item.fiabilisationStatut;delete item.fiabilise;
        item.fiabilisationStatut='en_attente';item.fiabilise=false;item._version=1;
        record(item,'Migration du dossier local',req.actor.actor,'Données et historique antérieurs conservés. Dossier transmis pour fiabilisation.');
      }
      store[key].push(item);imported++;
    }
  }
  if(imported)markStoreDirty();res.json({success:true,imported});
});
workflow.get('/profils',(req,res) => res.json(req.actor ? currentStore().profils.filter((p:any) => !p.deleted && (req.actor.role !== 'laureat' || String(p.id)===req.actor.profileId)).map((p:any)=>publicProfile(p,req.actor?.role)) : []));
workflow.post('/profils',(req,res) => {
  const store = currentStore(); const body = req.body || {}; const email = String(body.email || '').trim().toLowerCase();
  if (!email || !body.cin || !body.prenom || !body.nomfamille || !body.naissance || !body.etablissement || !body.niveau || !body.filiere || typeof body.password !== 'string' || body.password.length < 4 || !body.consentementDonnees) return res.status(400).json({success:false,error:'Informations obligatoires ou consentement manquants.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{4}-\d{2}-\d{2}$/.test(body.naissance)||!Number.isFinite(Date.parse(body.naissance))||Date.parse(body.naissance)>Date.now())return res.status(400).json({error:'Email ou date de naissance invalide.'});
  if (store.profils.some((p:any) => p.email?.toLowerCase()===email || p.cin?.toUpperCase()===String(body.cin).toUpperCase())) return res.status(409).json({success:false,error:'Un compte existe déjà avec cet email ou cette CIN.'});
  const p:any = Object.fromEntries(Object.entries(body).filter(([k]) => editable.has(k) && k!=='positionnement'));
  Object.assign(p,{id:randomBytes(12).toString('hex'),email,passwordHash:passwordHash(body.password),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),fiabilisationStatut:'en_attente',fiabilise:false,_version:1,historique:[],notifications:[]});
  record(p,'Création du profil',email); store.profils.push(p); session(req,res,'laureat',email,p.id); res.status(201).json({success:true,profile:publicProfile(p,'laureat')});
});
export function updateProfile(p:any, changes:any, actor:any) {
  const allowed = actor.role === 'conseiller' ? new Set([...editable,...adminOnly]) : editable;
  const diff:any[]=[];
  for (const [k,input] of Object.entries(changes)) {
    const v=k==='cvAnalysis'&&actor.role==='laureat'&&p.cvAnalysis&&input&&typeof input==='object'&&p.cvAnalysis.analysedAt===(input as any).analysedAt?{...p.cvAnalysis,...(input as any),diagnostic:p.cvAnalysis.diagnostic}:input;
    if(k==='rdvRealise'||k==='statut'&&v==='rendez_vous_realise')continue;
    if (!allowed.has(k) || k==='email' && actor.role==='laureat') continue;
    if(k==='positionnement' && actor.role==='laureat')continue;
    if (JSON.stringify(p[k])!==JSON.stringify(v)) { diff.push({champ:k,ancien:p[k] ?? '',nouveau:v}); p[k]=v; }
  }
  if (actor.role === 'conseiller' && changes.password) { p.passwordHash=passwordHash(changes.password); delete p.passhash; delete p.password; delete p.motDePasse; diff.push({champ:'Mot de passe',ancien:'Masqué',nouveau:'Mis à jour'}); }
  if (diff.length) {
    if(p.diagnosticIA?.status==='ready' && diff.some((d:any)=>!['actif','notes','statut','rdvRealise','prescriptions','prestations'].includes(d.champ))){p.diagnosticHistory ||= [];p.diagnosticHistory.push(p.diagnosticIA);p.diagnosticIA={status:'pending'};}
    p.updatedAt=new Date().toISOString(); p._version=(p._version||0)+1;
    record(p,'Modification du profil',actor.actor,'',diff);
    for(const d of diff) p.historique.push({id:randomBytes(12).toString('hex'),timestamp:p.updatedAt,champ:d.champ,ancien:typeof d.ancien==='string'?d.ancien:JSON.stringify(d.ancien),nouveau:typeof d.nouveau==='string'?d.nouveau:JSON.stringify(d.nouveau),modifiePar:actor.actor});
    markStoreDirty();
  }
  return p;
}
workflow.get('/me',(req,res) => res.json({success:true,profile:publicProfile(ownProfile(req),'laureat')}));
workflow.post('/me/update',(req,res) => { const p=ownProfile(req); updateProfile(p,req.body,req.actor); res.json({success:true,profile:publicProfile(p,req.actor?.role)}); });
workflow.post('/me/questionnaire',(req,res) => {
  const p=ownProfile(req),answers=req.body.answers||{};
  if(!completeAnswers(answers))return res.status(400).json({error:'Questionnaire incomplet.'});
  const scores=scoreAnswers(answers);
  const old=p.positionnement||{};p.positionnement={...old,answers,scores,completedAt:new Date().toISOString(),date:new Date().toISOString(),bonus:old.bonus||{}};
  if(p.diagnosticIA){p.diagnosticHistory ||= [];p.diagnosticHistory.push(p.diagnosticIA);}p.diagnosticIA={status:'pending'};
  p._version=(p._version||0)+1;record(p,'Questionnaire complété',req.actor.actor);markStoreDirty();res.json({success:true,profile:publicProfile(p,req.actor?.role)});
});
workflow.post('/me/prestations',(req,res) => {
  const store=currentStore(),p=ownProfile(req);
  const completed=p.rdvRealise===true||p.statut==='rendez_vous_realise'||store.rdvs.some((r:any)=>(r.email||r.candidat_email)===p.email&&['realise','Réalisé'].includes(r.status||r.statut));
  if(p.fiabilisationStatut!=='fiabilise'||!completed)return res.status(403).json({error:'Fiabilisation et entretien réalisé requis.'});
  const item=[...(store.ateliers||[]),...(store.prestations||[])].find((x:any)=>String(x.id)===String(req.body.id));
  if(!item)return res.status(404).json({error:'Prestation introuvable.'});
  store.inscriptions ||= [];const existing=store.inscriptions.find((i:any)=>i.email===p.email&&String(i.prestationId||i.atelierId)===String(item.id)&&i.statut!=='annule');
  if(req.body.cancel===true){if(existing)existing.statut='annule';record(p,'Inscription à une prestation annulée',req.actor.actor,item.titre||item.nom);}
  else {if(existing)return res.status(409).json({error:'Inscription déjà enregistrée.'});const participants=store.inscriptions.filter((i:any)=>String(i.prestationId||i.atelierId)===String(item.id)&&i.statut!=='annule').length;if(Number(item.places)>0&&participants>=Number(item.places))return res.status(409).json({error:'Session complète.'});store.inscriptions.push({id:randomBytes(12).toString('hex'),prestationId:item.id,atelierId:item.id,atelier:item.titre||item.nom,nom:p.nom,email:p.email,date:new Date().toISOString(),statut:'inscrit'});record(p,'Inscription à une prestation',req.actor.actor,item.titre||item.nom);}
  markStoreDirty();res.json({success:true});
});
workflow.post('/ateliers/inscriptions',requireAdvisor,(req,res) => {
  const store=currentStore();
  const cin=String(req.body.cin||'').replace(/\s+/g,'').toUpperCase();
  if(!cin||!req.body.atelierId)return res.status(400).json({error:'Veuillez renseigner la CIN et choisir un atelier.'});
  const candidates=store.profils.filter((p:any)=>!p.deleted&&String(p.cin||'').replace(/\s+/g,'').toUpperCase()===cin);
  if(!candidates.length)return res.status(404).json({error:'Aucun candidat trouvé avec cette CIN.'});
  if(candidates.length!==1)return res.status(409).json({error:'Plusieurs dossiers portent cette CIN. Corrigez les dossiers avant de procéder.'});
  const p=candidates[0];
  if(p.actif===false)return res.status(409).json({error:'Le compte de ce candidat est désactivé.'});
  const atelier=(store.ateliers||[]).find((a:any)=>String(a.id)===String(req.body.atelierId));
  if(!atelier)return res.status(404).json({error:'Atelier introuvable. Choisissez un atelier déjà créé.'});
  store.inscriptions ||= [];
  const active=store.inscriptions.filter((i:any)=>!['annule','annulee','annulé','annulée'].includes(i.statut||i.status)&& (String(i.atelierId||i.prestationId)===String(atelier.id)||(!i.atelierId&&!i.prestationId&&i.atelier===atelier.titre)));
  if(active.some((i:any)=>i.email===p.email||String(i.candidate_id)===String(p.id)||String(i.cin||i.candidat_cin||'').replace(/\s+/g,'').toUpperCase()===cin))return res.status(409).json({error:'Ce candidat est déjà inscrit à cet atelier.'});
  if(Number(atelier.places)>0&&active.length>=Number(atelier.places))return res.status(409).json({error:'Cet atelier est complet.'});
  const inscription={id:randomBytes(12).toString('hex'),atelierId:atelier.id,prestationId:atelier.id,atelier:atelier.titre||atelier.nom,candidate_id:p.id,nom:p.nom||[p.prenom,p.nomfamille].filter(Boolean).join(' '),email:p.email,cin,date:new Date().toISOString(),statut:'inscrit',actor:req.actor.actor};
  store.inscriptions.push(inscription);record(p,'Inscription à un atelier',req.actor.actor,inscription.atelier);markStoreDirty();
  res.status(201).json({success:true,inscription});
});
workflow.post('/me/corrections',(req,res) => { const p=ownProfile(req); if(p.fiabilisationStatut!=='correction_demandee') return res.status(409).json({error:'Aucune correction demandée.'}); p.fiabilisationStatut='en_attente'; p.fiabilise=false; record(p,'Corrections soumises',req.actor.actor); markStoreDirty(); res.json({success:true,profile:publicProfile(p,req.actor?.role)}); });
export function canBook(p:any) { return p?.fiabilisationStatut==='fiabilise' && (completeAnswers(p?.positionnement?.answers) && !!p?.positionnement?.scores || p?.fiabilise===true && !p?.positionnement?.answers) && p.actif!==false && !p.deleted; }
workflow.get('/candidates', (req,res) => {
  const query=req.query as any; let list=currentStore().profils.filter((p:any) => !p.deleted);
  const norm=(v:any) => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for (const k of ['nom','prenom','cin','tel']) if(query[k]) list=list.filter((p:any) => norm(k==='nom' ? `${p.nom} ${p.nomfamille}` : p[k]).includes(norm(query[k])));
  if(query.q) {const words=norm(query.q).split(/\s+/);list=list.filter((p:any) => words.every((w:string) => norm(`${p.nom} ${p.prenom} ${p.nomfamille} ${p.cin} ${p.tel} ${p.email}`).includes(w)));}
  if(query.queue==='fiabilisation')list=list.filter((p:any)=>p.fiabilisationStatut!=='fiabilise'&&p.fiabilise!==true);
  if(query.status) list=list.filter((p:any) => p.fiabilisationStatut===query.status);
  const page=Math.max(1,Number(query.page)||1), size=Math.min(100,Math.max(1,Number(query.pageSize)||20));
  res.json({success:true,count:list.length,page,pageSize:size,candidates:list.slice((page-1)*size,page*size).map((p:any)=>publicProfile(p,req.actor?.role))});
});
function target(req:any) { return currentStore().profils.find((p:any) => String(p.id)===req.params.id || p.email===req.params.id); }
workflow.get('/profile-followup',requireAdvisor,(req,res)=>{
  const cin=String(req.query.cin||'').replace(/\s+/g,'').toUpperCase();
  if(!cin)return res.status(400).json({error:'Veuillez renseigner la CIN.'});
  const matches=currentStore().profils.filter((p:any)=>!p.deleted&&String(p.cin||'').replace(/\s+/g,'').toUpperCase()===cin);
  if(!matches.length)return res.status(404).json({error:'Aucun candidat trouvé avec cette CIN.'});
  if(matches.length!==1)return res.status(409).json({error:'Plusieurs dossiers portent cette CIN. Corrigez les dossiers avant de procéder.'});
  res.json({success:true,profile:publicProfile(matches[0],req.actor.role)});
});
workflow.post('/candidates/:id/employment-followup',requireAdvisor,(req,res)=>{
  const p=target(req);
  if(!p||p.deleted)return res.status(404).json({error:'Dossier introuvable.'});
  if(!['mise_en_relation','insertion'].includes(req.body.type))return res.status(400).json({error:'Choisissez une mise en relation ou une insertion.'});
  const organisation=typeof req.body.organisation==='string'?req.body.organisation.trim():'';
  if(!organisation||organisation.length>200)return res.status(400).json({error:'Renseignez un nom de société ou d’employeur (200 caractères maximum).'});
  if(req.body._version!==(p._version||0))return res.status(409).json({error:'Le dossier a changé. Recherchez à nouveau le candidat avant d’enregistrer.'});
  const entry={id:randomBytes(12).toString('hex'),type:req.body.type,organisation,date:new Date().toISOString(),actor:req.actor.actor};
  p.employmentFollowups ||= [];p.employmentFollowups.push(entry);
  const action=entry.type==='insertion'?'Insertion professionnelle':'Mise en relation';
  if(entry.type==='insertion')p.statutInsertion='insere';
  p.updatedAt=entry.date;p._version=(p._version||0)+1;
  record(p,action,req.actor.actor,(entry.type==='insertion'?'Employeur : ':'Société : ')+organisation);
  markStoreDirty();res.status(201).json({success:true,profile:publicProfile(p,req.actor.role)});
});
workflow.get('/candidates/:id',(req,res) => {const p=target(req); if(!p) return res.status(404).json({error:'Dossier introuvable.'}); res.json({success:true,profile:publicProfile(p,req.actor?.role),diagnosticView:advisorDiagnostic(p,currentStore().diagnosticConfig)});});
workflow.get('/candidates/:id/history',(req,res) => {const p=target(req); if(!p) return res.status(404).json({error:'Dossier introuvable.'}); res.json({success:true,history:p.historique||[]});});
workflow.post('/candidates/:id/update',requireAdvisor,(req,res) => {
  const p=target(req); if(!p) return res.status(404).json({error:'Dossier introuvable.'});
  if(req.body._version!==undefined && req.body._version!==(p._version||0)) return res.status(409).json({error:'Le dossier a changé. Rechargez-le.'});
  updateProfile(p,req.body,req.actor);res.json({success:true,profile:publicProfile(p,req.actor?.role)});
});
workflow.post('/candidates/:id/fiabilisation',requireAdvisor,(req,res) => {
  const p=target(req); if(!p) return res.status(404).json({error:'Dossier introuvable.'});
  const status=req.body.status; if(!['fiabilise','correction_demandee'].includes(status)) return res.status(400).json({error:'Statut invalide.'});
  if(req.body._version!==(p._version||0)) return res.status(409).json({error:'Le dossier a changé. Rechargez-le.'});
  const comment=String(req.body.comment||'').trim();
  if(status==='correction_demandee' && !comment) return res.status(400).json({error:'Précisez les corrections à apporter.'});
  if(status==='fiabilise' && !completeAnswers(p.positionnement?.answers)) return res.status(409).json({error:'Complétez et validez le questionnaire d’employabilité avant fiabilisation.'});
  if(Array.isArray(req.body.workshops)&&req.body.workshops.some((w:any)=>!workshops.some(x=>x.id===w.id)))return res.status(400).json({error:'Atelier hors référentiel.'});
  if(status==='fiabilise'){p.diagnosticValidations ||= [];p.diagnosticValidations.push({initial:structuredClone(p.diagnosticIA?.status==='ready'?p.diagnosticIA:advisorDiagnostic(p,currentStore().diagnosticConfig)),final:{observations:String(req.body.observations||comment),synthese:String(req.body.synthese||''),workshops:Array.isArray(req.body.workshops)?req.body.workshops:[]},actor:req.actor.actor,date:new Date().toISOString()});}
  const previous=p.fiabilisationStatut;
  Object.assign(p,{fiabilisationStatut:status,fiabilise:status==='fiabilise',correctionComment:comment,fiabilisationAuteur:req.actor.actor,fiabilisationDate:new Date().toISOString(),_version:(p._version||0)+1});
  record(p,status==='fiabilise'?'Fiabilisation':'Correction demandée',req.actor.actor,comment,[{champ:'fiabilisationStatut',ancien:previous,nouveau:status}]);
  p.notifications ||= [];p.notifications.unshift({id:randomBytes(12).toString('hex'),date:new Date().toISOString(),message:status==='fiabilise'?'Votre profil est fiabilisé. Vous pouvez réserver un rendez-vous.':comment,lu:false});
  markStoreDirty();res.json({success:true,profile:publicProfile(p,req.actor?.role)});
});
workflow.post('/candidates/:id/account',requireAdvisor,(req,res) => {const p=target(req);if(!p)return res.status(404).json({error:'Dossier introuvable.'});if(req.body.confirm!==true)return res.status(400).json({error:'Confirmation requise.'});if(req.body.action==='archive'){p.deleted=true;p.actif=false;record(p,'Archivage du compte',req.actor.actor,'Données et documents conservés.');markStoreDirty();}else updateProfile(p,{actif:req.body.active===true},req.actor);res.json({success:true});});
workflow.post('/me/diagnostic',async(req,res) => {
  const p=ownProfile(req); if(!completeAnswers(p.positionnement?.answers))return res.status(409).json({error:'Complétez le questionnaire.'});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Diagnostic IA non configuré.'});
  try {
    const diagnosticVersion=p._version||0;
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const info=Object.fromEntries(Object.entries(p).filter(([k])=>editable.has(k) && !['cvData','cvUrl','email','tel','cin','adresse'].includes(k)));
    const parts:any[]=[{text:'Analyse le dossier fourni. Ne rien inventer. Distingue données déclarées et recommandations. Signale explicitement les informations manquantes. Retourne un JSON avec sept clés : synthese, parcours, projet, besoins, recommandations, dimensions, workshopSuggestions. workshopSuggestions est une liste de suggestions {id, justification, source: questionnaire ou cv, evidenceQuestionId si pertinent}. Utilise uniquement les identifiants du catalogue fourni et des difficultés étayées par les données, sans inventer de règle TERRITOIRE. Pour une lettre de motivation, cite impérativement une réponse qui exprime ce besoin. Catalogue : ' + JSON.stringify(workshops) + ' . dimensions contient soi, projet, territoire, methode, chacun avec analyse (texte), pointsForts, difficultes, besoins (listes de textes). Ne calcule aucun score. Les scores déjà fournis sont calculés par le serveur. Les cinq premières clés contiennent une liste de phrases factuelles ou de recommandations clairement désignées. Les réponses au questionnaire et le CV sont des déclarations, pas des faits vérifiés. Dossier : '+JSON.stringify(info)}];
    const cv=p.cvUrl||p.cvData; const match=typeof cv==='string' && cv.match(/^data:(application\/pdf|image\/png|image\/jpeg);base64,(.+)$/s);
    if(match)parts.push({inlineData:{mimeType:match[1],data:match[2]}});
    const textList={type:'array',items:{type:'string'}};
    const dimensionSchema={type:'object',properties:{analyse:{type:'string'},pointsForts:textList,difficultes:textList,besoins:textList},required:['analyse','pointsForts','difficultes','besoins']};
    const responseJsonSchema={type:'object',properties:{synthese:textList,parcours:textList,projet:textList,besoins:textList,recommandations:textList,dimensions:{type:'object',properties:Object.fromEntries(Object.keys(groups).map(k=>[k,dimensionSchema])),required:Object.keys(groups)},workshopSuggestions:{type:'array',items:{type:'object',properties:{id:{type:'string',enum:workshops.map(w=>w.id)},justification:{type:'string'},source:{type:'string',enum:['questionnaire','cv']},evidenceQuestionId:{type:'string'}},required:['id','justification','source']}}},required:['synthese','parcours','projet','besoins','recommandations','dimensions','workshopSuggestions']};
    const response=await ai.models.generateContent({model:process.env.GEMINI_DIAGNOSTIC_MODEL||'gemini-flash-latest',contents:parts,config:{responseMimeType:'application/json',responseJsonSchema,httpOptions:{timeout:45000}}});
    const parsed=JSON.parse((response.text||'{}').replace(/^```(?:json)?\s*|\s*```$/g,''));
    for(const key of ['synthese','parcours','projet','besoins','recommandations'])if(!Array.isArray(parsed[key]) || !parsed[key].every((s:any)=>typeof s==='string'))throw new Error('Invalid diagnostic');
    if(!parsed.dimensions||!Object.keys(groups).every(k=>typeof parsed.dimensions[k]?.analyse==='string'&&['pointsForts','difficultes','besoins'].every(f=>Array.isArray(parsed.dimensions[k][f])&&parsed.dimensions[k][f].every((x:any)=>typeof x==='string'))))throw new Error('Invalid dimension analysis');
    if(parsed.workshopSuggestions!==undefined&&(!Array.isArray(parsed.workshopSuggestions)||parsed.workshopSuggestions.some((w:any)=>!workshops.some(x=>x.id===w.id)||typeof w.justification!=='string'||!['cv','questionnaire'].includes(w.source))))throw new Error('Invalid workshop suggestions');
    if((p._version||0)!==diagnosticVersion)return res.status(409).json({error:'Le profil a changé pendant l’analyse. Relancez le diagnostic.'});
    p.diagnosticIA={status:'ready',workshopSuggestions:parsed.workshopSuggestions||[],dimensions:parsed.dimensions,scores:p.positionnement.scores,prescription:prescribe(p.positionnement.answers,p.positionnement.scores,currentStore().diagnosticConfig),validationStatus:'provisoire',sections:parsed,generatedAt:new Date().toISOString(),source:'gemini',sources:{questionnaire:true,cv:!!(match||p.cvAnalysis||p.cvOcrText),profil:true}};
    record(p,'Diagnostic IA généré','Agent IA','Synthèse du profil, du questionnaire et du CV disponible.');markStoreDirty();res.json({success:true,diagnostic:{status:p.diagnosticIA.status,generatedAt:p.diagnosticIA.generatedAt},profile:publicProfile(p,'laureat')});
  }catch (failure:any) {
    const status=Number(failure?.status||failure?.code||0), detail=String(failure?.message||'');
    const errorCode=status===429||/quota|resource.exhausted/i.test(detail)?'quota':status===401||status===403||/api.key.*invalid/i.test(detail)?'credentials':status===404?'model':/timeout|timed.out|abort/i.test(detail)?'timeout':failure instanceof SyntaxError||/Invalid diagnostic|Invalid dimension|Invalid workshop/i.test(detail)?'format':'service';
    const messages:any={quota:'Le quota du service IA est atteint. Réessayez plus tard.',credentials:'La clé du service IA est refusée. Contactez le responsable de la plateforme.',model:'Le modèle IA configuré est indisponible. Contactez le responsable de la plateforme.',timeout:'L’analyse IA a dépassé le délai. Relancez l’analyse.',format:'Le service IA a retourné une analyse incomplète. Relancez l’analyse.',service:'Le service IA est temporairement indisponible. Relancez l’analyse.'};
    console.error('PALUCA diagnostic failure',JSON.stringify({errorCode,httpStatus:status||undefined}));
    p.diagnosticIA={status:'error',errorCode,errorMessage:messages[errorCode],failedAt:new Date().toISOString()};markStoreDirty();
    res.status(503).json({success:false,error:messages[errorCode]+' Vos réponses sont conservées.',errorCode});
  }
});
workflow.post('/me/questionnaire/draft',(req,res)=>{
 const p=ownProfile(req), a=req.body.answers;
 if(!a||typeof a!=='object'||Array.isArray(a))return res.status(400).json({error:'Réponses invalides.'});
 p.questionnaireDraft={answers:Object.fromEntries(Object.entries(a).filter(([k,v])=>[...Object.values(groups).flat(),'p1x'].includes(k)&&typeof v==='string')),savedAt:new Date().toISOString()};markStoreDirty();res.json({success:true});
});
workflow.get('/diagnostic/config',(_req,res)=>res.json({success:true,config:currentStore().diagnosticConfig||null,workshops}));
workflow.post('/diagnostic/config',requireAdvisor,(req,res)=>{
 const t=req.body.thresholds;if(!t||!['soi','projet','methode','territoire'].every(k=>typeof t[k]==='number'&&t[k]>=0&&t[k]<=100))return res.status(400).json({error:'Seuils requis entre 0 et 100.'});
 const store=currentStore();store.diagnosticConfigHistory ||= [];if(store.diagnosticConfig)store.diagnosticConfigHistory.push(store.diagnosticConfig);
 store.diagnosticConfig={thresholds:t,territoireWorkshops:(req.body.territoireWorkshops||[]).filter((id:string)=>workshops.some(w=>w.id===id)),methodNeeds:{letter:req.body.methodNeeds?.letter===true},version:(store.diagnosticConfig?.version||0)+1,actor:req.actor.actor,date:new Date().toISOString()};markStoreDirty();res.json({success:true,config:store.diagnosticConfig});
});
workflow.post('/rdvs/:id/interview',requireAdvisor,(req,res)=>{
 const store=currentStore(),r=store.rdvs.find((r:any)=>String(r.id)===req.params.id);
 if(!r)return res.status(404).json({error:'Rendez-vous introuvable.'});
 const p=store.profils.find((p:any)=>p.email===(r.email||r.candidat_email));if(!p)return res.status(404).json({error:'Dossier introuvable.'});
 const b=req.body;if(!['realise','absent','reporte'].includes(b.status))return res.status(400).json({error:'Statut invalide.'});
 if(r.interviewId)return res.status(409).json({error:'Cet entretien est déjà clôturé.'});
 if(b.status==='realise'&&(!b.effectiveDate||!Number.isFinite(Date.parse(b.effectiveDate))||!String(b.synthese||'').trim()))return res.status(400).json({error:'Date et compte rendu obligatoires.'});
 const prescriptions=b.prescriptions||[];const catalog=[...workshops,...(store.prestations||[]),...(store.ateliers||[])];
 if(!Array.isArray(prescriptions)||prescriptions.some((x:any)=>!catalog.some(c=>String(c.id)===String(x.id))||!['prescrite','programmee','realisee','annulee'].includes(x.status)))return res.status(400).json({error:'Prescription ou statut invalide.'});
 if(b.followup?.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(b.followup.date)||!Number.isFinite(Date.parse(b.followup.date))||!['presentiel','distance','telephone'].includes(b.followup.modalite)||!String(b.followup.objectif||'').trim()))return res.status(400).json({error:'Date, modalité et objectif du suivi obligatoires.'});
 const interview={id:randomBytes(12).toString('hex'),rdvId:r.id,status:b.status,effectiveDate:b.effectiveDate,synthese:String(b.synthese||''),difficultes:String(b.difficultes||''),besoins:String(b.besoins||''),observations:String(b.observations||''),actor:req.actor.actor,createdAt:new Date().toISOString(),prescriptions:b.status==='realise'?prescriptions:[]};
 p.entretiens ||= [];p.entretiens.push(interview);r.interviewId=interview.id;r.status=b.status;r.statut={realise:'Réalisé',absent:'Absent',reporte:'Reporté'}[b.status as string];
 if(b.status==='realise'){
 p.rdvRealise=true;p.statut='rendez_vous_realise';p.prescriptionHistory ||= [];p.prescriptionHistory.push(...prescriptions.map((x:any)=>({...x,interviewId:interview.id,actor:req.actor.actor,date:interview.createdAt})));
 if(b.followup?.date){p.suivis ||= [];p.suivis.push({...b.followup,id:randomBytes(12).toString('hex'),status:'prevu',interviewId:interview.id,actor:req.actor.actor,createdAt:interview.createdAt});}
 if(b.followupId){const f=p.suivis?.find((f:any)=>f.id===b.followupId);if(f){f.status='realise';f.completedAt=interview.createdAt;f.completedInterviewId=interview.id;}}
 }
 p._version=(p._version||0)+1;record(p,'Entretien '+r.statut,req.actor.actor,interview.synthese,interview);markStoreDirty();res.json({success:true,profile:publicProfile(p,req.actor?.role),interview});
});
workflow.get('/followups',(req,res)=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca'}).format(new Date());const q=String(req.query.q||'').toLowerCase();const filter=req.query.status;
 const rows=currentStore().profils.filter((p:any)=>!p.deleted&&`${p.nom} ${p.prenom} ${p.nomfamille} ${p.cin} ${p.tel}`.toLowerCase().includes(q)).flatMap((p:any)=>(p.suivis||[]).map((f:any)=>({...f,profileId:p.id,nom:p.nom,cin:p.cin,tel:p.tel,category:f.status==='realise'?'realise':f.date<today?'retard':f.date===today?'jour':'prevu'})));
 res.json({success:true,followups:filter?rows.filter((f:any)=>f.category===filter):rows});
});
workflow.get('/workflow/stats',(req,res)=>{
 const s=currentStore(),start=String(req.query.start||''),end=String(req.query.end||'9999'),actor=req.query.actor;
 const period=(date:any,a?:any)=>!!date&&String(date).slice(0,10)>=start&&String(date).slice(0,10)<=end&&(!actor||a===actor);
 const p=s.profils.filter((p:any)=>!p.deleted),r=s.rdvs||[],i=p.flatMap((p:any)=>p.entretiens||[]),f=p.flatMap((p:any)=>p.suivis||[]),pres=p.flatMap((p:any)=>p.prescriptionHistory||[]);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca'}).format(new Date());
 res.json({success:true,stats:{laureats:p.filter((x:any)=>period(x.createdAt)).length,questionnaires:p.filter((x:any)=>completeAnswers(x.positionnement?.answers)&&period(x.positionnement.completedAt||x.positionnement.date)).length,diagnostics:p.filter((x:any)=>x.diagnosticIA?.status==='ready'&&period(x.diagnosticIA.generatedAt)).length,fiabilises:p.filter((x:any)=>x.fiabilise&&period(x.fiabilisationDate,x.fiabilisationAuteur)).length,demandes:r.filter((x:any)=>x.status==='pending'&&period(x.createdAt,x.conseiller_nom)).length,confirmes:r.filter((x:any)=>x.status==='accepted'&&period(x.createdAt,x.conseiller_nom)).length,entretiens:i.filter((x:any)=>x.status==='realise'&&period(x.createdAt,x.actor)).length,accompagnes:p.filter((x:any)=>(x.entretiens||[]).some((i:any)=>i.status==='realise'&&period(i.createdAt,i.actor))).length,prescriptions:pres.filter((x:any)=>period(x.date,x.actor)).length,ateliersRealises:pres.filter((x:any)=>x.status==='realisee'&&period(x.date,x.actor)).length,suivis:f.filter((x:any)=>x.status==='prevu'&&period(x.date,x.actor)).length,suivisRetard:f.filter((x:any)=>x.status==='prevu'&&x.date<today&&period(x.date,x.actor)).length}});
});

workflow.delete('/rdvs/:id',requireAdvisor,(req,res)=>{
 const store=currentStore(),r=store.rdvs.find((r:any)=>String(r.id)===req.params.id);if(!r)return res.status(404).json({error:'Rendez-vous introuvable.'});
 if(r.interviewId)return res.status(409).json({error:'Un entretien clôturé reste conservé dans l’historique.'});r.status='cancelled';r.statut='Annulé';r.archivedAt=new Date().toISOString();
 const slot=store.creneaux?.find((c:any)=>String(c.id)===String(r.creneauId));if(slot){slot.reserve=false;slot.status='disponible';}
 const p=store.profils.find((p:any)=>p.email===(r.email||r.candidat_email));if(p)record(p,'Rendez-vous annulé et archivé',req.actor.actor,'Données conservées.');markStoreDirty();res.json({success:true});
});
workflow.post('/rdvs/status',requireAdvisor,(req,res,next)=>{
 if(req.body.action!=='reprogrammer')return next();
 const store=currentStore(),r=store.rdvs.find((r:any)=>String(r.id)===String(req.body.id)),slot=store.creneaux?.find((c:any)=>String(c.id)===String(req.body.newCreneauId));
 if(!r)return res.status(404).json({error:'Rendez-vous introuvable.'});if(r.interviewId)return res.status(409).json({error:'Entretien déjà clôturé ; réservez un nouveau rendez-vous.'});
 if(!slot||slot.reserve||slot.date!==req.body.newDate||(slot.heure||slot.time||slot.debut)!==req.body.newHeure||store.rdvs.some((x:any)=>String(x.id)!==String(r.id)&&String(x.creneauId)===String(slot.id)&&!['cancelled','refused'].includes(x.status)))return res.status(409).json({error:'Choisissez un créneau disponible effectivement enregistré.'});
 const old={date:r.date,heure:r.heure,creneauId:r.creneauId};const previous=store.creneaux.find((c:any)=>String(c.id)===String(r.creneauId));if(previous){previous.reserve=false;previous.status='disponible';}
 slot.reserve=true;slot.status='reserve';Object.assign(r,{date:slot.date,heure:slot.heure||slot.time||slot.debut,creneauId:slot.id,status:'accepted',statut:'Confirmé',date_modification:new Date().toISOString()});r.reprogrammations ||= [];r.reprogrammations.push({previous:old,date:r.date,heure:r.heure,actor:req.actor.actor,timestamp:r.date_modification});const p=store.profils.find((p:any)=>p.email===(r.email||r.candidat_email));if(p)record(p,'Rendez-vous reprogrammé',req.actor.actor,`${old.date} ${old.heure} → ${r.date} ${r.heure}`);markStoreDirty();res.json({success:true,rdv:r});
});

function requireAdmin(req:any,res:any,next:any){if(req.actor?.role!=='conseiller'||req.actor.actor!=='admin')return res.status(403).json({error:'Action réservée à l’administrateur.'});next();}
workflow.get('/admin/laureats/reset-plan',requireAdmin,(_req,res)=>res.json({success:true,...resetPlan(currentStore())}));
workflow.post('/admin/laureats/reset',requireAdmin,async(req,res)=>{
 const store=currentStore(),plan=resetPlan(store);
 if(req.body.confirm!=='DELETE_ALL_LAUREATS'||req.body.fingerprint!==plan.fingerprint)return res.status(409).json({error:'Le périmètre a changé ou la confirmation explicite manque. Vérifiez le plan avant suppression.'});
 try{const backup=await backupCurrentStore();const deleted=removeAllLaureats(store,req.actor.actor,backup);markStoreDirty();res.json({success:true,deleted,remaining:store.profils.length,backupSaved:true});}catch{res.status(503).json({error:'Sauvegarde indisponible ; aucune suppression effectuée.'});}
});
workflow.post('/admin/storage-check',requireAdmin,(req,res)=>{
 const imageUrl=String(req.body.imageUrl||'');if(!/^https:\/\//.test(imageUrl)&&!/^\/uploads\//.test(imageUrl))return res.status(400).json({error:'Adresse d’image requise.'});
 const store=currentStore(),id=randomBytes(16).toString('hex');
 const sample={profile:{id:'test-profile-'+id,nom:'Profil fictif de contrôle',cvText:'Contenu fictif pour vérifier le stockage'},banner:{id:'test-banner-'+id,titre:'Bannière fictive de contrôle',imageUrl}};
 const probe={id,createdAt:new Date().toISOString(),sample,checksum:hash(JSON.stringify(sample))};store.storageChecks ||= [];store.storageChecks.push(probe);markStoreDirty();res.json({success:true,id,checksum:probe.checksum,storage:process.env.VERCEL?'vercel_blob':'local_json'});
});
workflow.get('/admin/storage-check/:id',requireAdmin,(req,res)=>{
 const probe=(currentStore().storageChecks||[]).find((p:any)=>p.id===req.params.id);if(!probe)return res.status(404).json({error:'Contrôle introuvable.'});res.json({success:true,probe,storage:process.env.VERCEL?'vercel_blob':'local_json'});
});
workflow.post('/admin/storage-check/:id/cleanup',requireAdmin,(req,res)=>{
 const store=currentStore();store.storageChecks=(store.storageChecks||[]).filter((p:any)=>p.id!==req.params.id);markStoreDirty();res.json({success:true});
});
