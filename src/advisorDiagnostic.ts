import { completeAnswers, groups, prescribe, scoreAnswers, workshops } from './accompaniment.js';

export function advisorDiagnostic(p:any,config:any) {
 const a=p.positionnement?.answers;
 const complete=completeAnswers(a);
 const scores=complete?scoreAnswers(a):null;
 const d=p.diagnosticIA;
 const dimensions=['soi','projet','territoire','methode'].map(key=>({key,score:scores?.[key]??null,analyse:d?.status==='ready'?d.dimensions?.[key]?.analyse||'Analyse qualitative non enregistrée.':'Diagnostic IA non disponible.',pointsForts:d?.dimensions?.[key]?.pointsForts||[],difficultes:d?.dimensions?.[key]?.difficultes||[],besoins:d?.dimensions?.[key]?.besoins||[]}));
 const rule=complete?prescribe(a,scores,config):{status:'questionnaire_incomplet',workshops:[]};
 const suggestions:any[]=[];
 const add=(id:string,reason:string,source:string)=>{const w=workshops.find(w=>w.id===id);if(!w)return;let existing=suggestions.find(x=>x.id===id);if(!existing){existing={...w,status:'provisoire',reasons:[],sources:[]};suggestions.push(existing);}if(!existing.reasons.includes(reason))existing.reasons.push(reason);if(!existing.sources.includes(source))existing.sources.push(source);};
 for(const w of rule.workshops)add(w.id!,w.justification!,'Référentiel et questionnaire');
 if(complete){
  if(a.m1!=='oui')add('methode-cv',`Questionnaire m1 : CV déclaré ${a.m1==='non'?'non prêt':'partiellement prêt'}.`,'Questionnaire');
  if(a.m3!=='oui')add('methode-entretien',`Questionnaire m3 : préparation à l’entretien déclarée ${a.m3==='non'?'non maîtrisée':'partiellement maîtrisée'}.`,'Questionnaire');
  const allowed=new Set(suggestions.map(w=>w.id));
  for(const w of d?.workshopSuggestions||[]){if(!w||typeof w.id!=='string'||typeof w.justification!=='string'||!['questionnaire','cv'].includes(w.source))continue;
   const cvPresent=!!(p.cvAnalysis||p.cvOcrText||p.cvUrl||p.cvData);
   if(w.source==='cv'&&!cvPresent)continue;
   // CV evidence can refine method needs, never invent an autonomous TERRITOIRE rule.
   if(allowed.has(w.id)||w.source==='cv'&&w.id==='methode-cv'||w.id==='methode-lettre'&&w.source==='questionnaire'&&w.evidenceQuestionId&&typeof a[w.evidenceQuestionId]==='string'&&/lettre|motivation/i.test(a[w.evidenceQuestionId]))add(w.id,w.justification,w.source==='cv'?'Diagnostic CV et IA':'Diagnostic IA et questionnaire');
  }
 }
 return {questionnaireComplete:complete,scores,dimensions,ruleStatus:rule.status,ruleCase:(rule as any).case||null,suggestions,cv:{available:!!(p.cvAnalysis||p.cvOcrText||p.cvUrl||p.cvData),analysis:p.cvAnalysis||null,parcours:d?.sections?.parcours||[],text:p.cvOcrText||'',analysedByDiagnostic:d?.status==='ready'&&d.sources?.cv===true},validationStatus:p.fiabilise?'fiabilise':'provisoire'};
}
