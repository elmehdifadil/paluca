export const groups: Record<string,string[]> = {projet:['p1','p2','p3'],soi:['s1','s2','s3'],territoire:['t1','t2','t3'],methode:['m1','m2','m3','m4']};
export function completeAnswers(a:any) {return !!a && Object.values(groups).flat().every(k=>['s2','s3'].includes(k)?a.s1==='non'||typeof a[k]==='string'&&a[k].trim().length>0:['oui','non','partiel'].includes(a[k]));}
export function scoreAnswers(a:any) {const s:any={};for(const [dim,ids] of Object.entries(groups))s[dim]=Math.round(100*ids.reduce((n,k)=>n+(['s2','s3'].includes(k)?a.s1!=='non'&&typeof a[k]==='string'&&a[k].trim().length>=5?1:0:a[k]==='oui'?1:a[k]==='partiel'?0.5:0),0)/ids.length);s.global=Math.round(Object.keys(groups).reduce((n,k)=>n+s[k],0)/4);return s;}
export const workshops = [
 {id:'soi-marche',nom:'Moi et le marché du travail'},
 {id:'soi-competences',nom:'Mettre en valeur ses compétences et ses qualités'},
 {id:'projet-recherche',nom:"Organiser sa recherche d'emploi et connaître le marché du travail"},
 {id:'methode-cv',nom:'Rédiger son CV'},
 {id:'methode-lettre',nom:'Rédiger ses lettres de motivation'},
 {id:'methode-entretien',nom:"Préparer son entretien d'embauche"}
];
// No invented threshold: administrators must configure it before prescriptions run.
export function prescribe(a:any,s:any,config:any) {
 if(!config?.thresholds)return {status:'configuration_requise',case:null,workshops:[]};
 const low=(d:string)=>Number.isFinite(config.thresholds[d])&&s[d]<config.thresholds[d];
 const soi=low('soi'),projet=low('projet'),methode=low('methode');
 const key=[soi,projet,methode].map(Number).join('');
 const cases:any={'100':1,'010':2,'001':3,'110':4,'101':5,'011':6,'111':7};
 let ids:string[]=[];const choice=a.s1==='non'?'soi-marche':'soi-competences';
 if(key==='100')ids=[choice];if(key==='010')ids=['projet-recherche'];
 if(key==='110')ids=[s.soi<s.projet?'soi-competences':'projet-recherche'];
 if(key==='101')ids=['soi-competences'];if(key==='011')ids=['soi-marche'];
 if(methode){if(a.m1!=='oui')ids.push('methode-cv');if(a.m3!=='oui')ids.push('methode-entretien');if(config.methodNeeds?.letter===true)ids.push('methode-lettre');}
 if(key==='111')ids=workshops.map(w=>w.id);
 for(const id of config.territoireWorkshops||[])if(low('territoire')&&workshops.some(w=>w.id===id))ids.push(id);
 return {status:'provisoire',case:cases[key]||null,configVersion:config.version,workshops:[...new Set(ids)].map(id=>({...workshops.find(w=>w.id===id),justification:`Règle ${cases[key]||'territoire'} ; scores calculés et réponses déclarées.`,status:'recommandee'}))};
}
