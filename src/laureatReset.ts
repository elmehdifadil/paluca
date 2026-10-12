import {createHash} from 'node:crypto';
export function resetPlan(store:any){
 const counts={laureats:(store.profils||[]).length,rendezVous:(store.rdvs||[]).length,inscriptions:(store.inscriptions||[]).length,sessionsLaureats:(store.sessions||[]).filter((s:any)=>s.role==='laureat').length};
 const fingerprint=createHash('sha256').update(JSON.stringify({profils:store.profils||[],rdvs:store.rdvs||[],inscriptions:store.inscriptions||[],creneaux:store.creneaux||[],resetAt:store.laureatResetAt||null})).digest('hex');
 return {counts,fingerprint};
}
export function removeAllLaureats(store:any,actor:string,backup:string){
 const before=resetPlan(store).counts;
 store.profils=[];store.rdvs=[];store.inscriptions=[];
 store.sessions=(store.sessions||[]).filter((s:any)=>s.role!=='laureat');
 for(const slot of store.creneaux||[]){if(slot.reserve||['reserve','Réservé','réservé'].includes(slot.status)||['reserve','Réservé','réservé'].includes(slot.statut)){slot.reserve=false;slot.status='disponible';slot.statut='Disponible';}for(const key of ['candidat_email','candidat_nom','candidat_cin','candidate_id','rdv_id','rdvId'])delete slot[key];}
 store.laureatResetAt=new Date().toISOString();store.resetHistory ||= [];store.resetHistory.push({action:'Suppression de tous les lauréats',actor,date:store.laureatResetAt,counts:before,backup});
 return before;
}
