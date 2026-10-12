(function () {
  var requestedRole=new URLSearchParams(location.search).get('role');
  if(['conseiller','universite'].includes(requestedRole)){document.getElementById('loginUser').value=requestedRole;document.querySelector('#loginView h1').textContent=requestedRole==='universite'?'PAL-UCA — Espace Université':'PAL-UCA — Espace Conseiller';document.querySelector('#loginView .sub').textContent=requestedRole==='universite'?'Tableau de bord et suivi des candidats — lecture seule':'Accompagnement des lauréats et gestion des rendez-vous';}
  var selected = null, dossierMode = false, pages = {}, searchTimers = {}, requestIds = {};
  function escape(value) { return esc(value === undefined || value === null ? '' : String(value)); }
  function mergeProfile(p) { var list=window.DB.profils||[];var i=list.findIndex(function(x){return String(x.id)===String(p.id)||x.email===p.email;});if(i<0)list.push(p);else list[i]=p;window.DB.profils=list; }
  function field(label,value) { return '<div><dt>'+escape(label)+'</dt><dd>'+escape(value || 'Non renseigné')+'</dd></div>'; }
  function readable(v) { if(Array.isArray(v))return v.map(readable).join('\n');if(v && typeof v==='object')return Object.entries(v).map(function(e){return e[0]+': '+readable(e[1]);}).join('\n');return String(v||''); }
  function feedback(text) { var el=document.getElementById('palDossierFeedback');if(el)el.textContent=text;else alert(text); }
  var originalNav = window.navToSection;
  var listPanel=document.getElementById('cLauréats');
  var panel=document.createElement('div');panel.className='panel';panel.id='cFiabilisation';
  panel.innerHTML='<div class="card"><h2>Fiabilisation des lauréats</h2><div id="palReliabilitySearch"></div><div id="palReliabilityTable"></div></div>';
  listPanel.parentNode.insertBefore(panel,listPanel.nextSibling);
  var mobile=document.getElementById('mNavConseiller');
  if(mobile){mobile.innerHTML=[['Tableau de bord','cDashboard'],['Lauréats','cLauréats'],['Prestations & RDV','cRdvs'],['Événements','cEvenements']].map(function(item){return '<button class="m-nav-item" data-section="'+item[1]+'"><span class="m-label">'+item[0]+'</span></button>';}).join('');mobile.querySelectorAll('[data-section]').forEach(function(button){button.onclick=function(){navToSection(button.dataset.section);if(button.dataset.section!=='cDashboard')toggleMobileDrawer();};});}
  function toolbar(id,status) {
    return '<form class="pal-toolbar" id="'+id+'">'+['nom','prenom','cin','tel'].map(function(k){return '<label>'+({nom:'Nom',prenom:'Prénom',cin:'CIN',tel:'Téléphone'})[k]+'<input name="'+k+'" autocomplete="off"></label>';}).join('')+
      (status?'<label>Statut<select name="status"><option value="">Tous les statuts</option><option value="en_attente">En attente de fiabilisation</option><option value="correction_demandee">Correction demandée</option>'+(id==='palReliabilityFilters'?'':'<option value="fiabilise">Fiabilisé</option>')+'</select></label>':'')+'<button type="submit">Rechercher</button></form>';
  }
  var mainTable=document.getElementById('cLauréatsTable');
  var bar=document.createElement('div');bar.innerHTML=toolbar('palListFilters',true);mainTable.parentNode.insertBefore(bar,mainTable);
  var oldSearch=document.getElementById('cSearch');if(oldSearch)oldSearch.closest('.search-bar')?.remove();
  if(oldSearch && oldSearch.isConnected)oldSearch.parentElement.style.display='none';
  document.getElementById('palReliabilitySearch').innerHTML=toolbar('palReliabilityFilters',true);
  ['mod','histo'].forEach(function(prefix){
    var results=document.getElementById(prefix+'SearchResults');var area=document.createElement('div');area.innerHTML=toolbar('pal'+prefix+'Filters',false);results.parentNode.insertBefore(area,results);
    var old=document.getElementById(prefix+'SearchInput');if(old)old.parentElement.style.display='none';
  });
  ['palListFilters','palReliabilityFilters','palmodFilters','palhistoFilters'].forEach(function(id){
    var form=document.getElementById(id);form.onsubmit=function(e){e.preventDefault();clearTimeout(searchTimers[id]);pages[id]=1;loadList(id);};
    form.oninput=function(){clearTimeout(searchTimers[id]);searchTimers[id]=setTimeout(function(){pages[id]=1;loadList(id);},300);};
  });
  function listConfig(id){return id==='palListFilters'?{el:'cLauréatsTable',mode:'list'}:id==='palReliabilityFilters'?{el:'palReliabilityTable',mode:'reliability'}:id==='palmodFilters'?{el:'modSearchResults',mode:'modify'}:{el:'histoSearchResults',mode:'history'};}
  async function loadList(id) {
    var config=listConfig(id), el=document.getElementById(config.el), form=document.getElementById(id);if(!el||!form)return;
    var request=(requestIds[id]||0)+1;requestIds[id]=request;
    var params=new URLSearchParams(new FormData(form));params.set('page',pages[id]||1);params.set('pageSize',20);if(config.mode==='reliability')params.set('queue','fiabilisation');
    try {
      var result=await palApi('candidates?'+params);if(request!==requestIds[id])return;
      result.candidates.forEach(mergeProfile);
      var headers=config.mode==='list'?['Nom et prénom','CIN','Téléphone','Établissement et filière','Statut du profil','Statut du rendez-vous','Actions']:config.mode==='reliability'?['Nom et prénom','CIN','Téléphone','Établissement et filière','Date d’inscription','Statut de fiabilisation','Action']:['Nom et prénom','CIN','Téléphone','Filière','Action'];
      el.innerHTML='<div class="pal-table-wrap"><table class="pal-table"><thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead><tbody>'+result.candidates.map(function(p){
        var values=[p.nom||[p.prenom,p.nomfamille].filter(Boolean).join(' '),p.cin,p.tel];
        if(config.mode==='list'||config.mode==='reliability')values.push([p.etablissement,p.filiere].filter(Boolean).join(' — '));else values.push(p.filiere);
        if(config.mode==='list') {values.push(p.actif===false?'Compte désactivé':palStatus(p));var rdv=(window.DB.rdvs||[]).filter(function(r){return (r.email||r.candidat_email||'').toLowerCase()===(p.email||'').toLowerCase();}).slice(-1)[0];values.push(rdv?(rdv.statut||rdv.status):'Aucun rendez-vous');}
        if(config.mode==='reliability')values.push(p.createdAt?new Date(p.createdAt).toLocaleDateString('fr-FR'):'Non renseignée',palStatus(p));
        var label=config.mode==='reliability'?'Consulter le dossier':config.mode==='modify'?'Modifier':config.mode==='history'?'Consulter l’historique':'Consulter';
        return '<tr>'+values.map(function(v){return '<td>'+escape(v||'Non renseigné')+'</td>';}).join('')+'<td><button class="pal-button" data-profile="'+escape(p.id)+'">'+label+'</button></td></tr>';
      }).join('')+(result.count?'':'<tr><td colspan="'+headers.length+'">Aucun dossier trouvé.</td></tr>')+'</tbody></table></div><div class="pal-pagination"><button class="pal-button" data-page="-1" '+(result.page===1?'disabled':'')+'>Précédent</button><span>'+result.count+' dossiers — page '+result.page+' / '+Math.max(1,Math.ceil(result.count/20))+'</span><button class="pal-button" data-page="1" '+(result.page*20>=result.count?'disabled':'')+'>Suivant</button></div>';
      el.querySelectorAll('[data-profile]').forEach(function(btn){btn.onclick=function(){if(config.mode==='modify')selectModify(btn.dataset.profile);else if(config.mode==='history')selectHistory(btn.dataset.profile);else openDossier(btn.dataset.profile,config.mode==='reliability');};});
      el.querySelectorAll('[data-page]').forEach(function(btn){btn.onclick=function(){pages[id]=(pages[id]||1)+Number(btn.dataset.page);loadList(id);};});
    } catch(e){if(request!==requestIds[id])return;el.textContent=e.message;}
  }
  window.renderLauréats=function(){loadList('palListFilters');};
  window.navToSection=function(id,filter){ originalNav(id,filter); document.querySelectorAll('#dashConseiller .panel').forEach(function(p){p.style.display=p.id===id?'block':'none';}); if(id==='cFiabilisation') {document.querySelectorAll('#dashConseiller .panel').forEach(function(p){p.classList.remove('active');p.style.display='none';});panel.style.display='block';panel.classList.add('active');loadList('palReliabilityFilters');}if(id==='cModifProfil')loadList('palmodFilters');if(id==='cHistoProfil')loadList('palhistoFilters'); };
  window.chercherCandidatPourModif=function(){loadList('palmodFilters');};window.chercherCandidatPourHisto=function(){loadList('palhistoFilters');};
  var oldSelect=window.selectionnerCandidatPourModif;
  async function selectModify(id){try {selected=(await palApi('candidates/'+encodeURIComponent(id))).profile;mergeProfile(selected);oldSelect(selected.email);['sexe','ville','niveau','etablissement','typeEmploi','situation','milieu'].forEach(function(k){var el=document.getElementById('f_'+k);if(el)el.value=selected[k]||'';});}catch(e){alert(e.message);}}
  window.selectionnerCandidatPourModif=selectModify;
  window.navToModifForCandidate=function(id){navToSection('cModifProfil');selectModify(id);};
  window.sauvegarderProfilDepuisPanel=async function(){
    if(!selected)return;var body={_version:selected._version||0};
    document.querySelectorAll('#modProfileCard [id^="f_"]').forEach(function(el){var key=el.id.slice(2);if(el.type==='checkbox')body[key]=el.checked;else body[key]=key==='actif'?el.value==='true':el.value;});
    body.nom=[body.prenom,body.nomfamille].filter(Boolean).join(' ');
    if(body.actif===false && selected.actif!==false && !confirm('Confirmer la désactivation de ce compte ?'))return;
    try{var result=await palApi('candidates/'+encodeURIComponent(selected.id)+'/update',body);selected=result.profile;mergeProfile(selected);alert('Modifications enregistrées et tracées.');renderLauréats();}catch(e){alert(e.message);}
  };
  async function selectHistory(id){try{
    var p=(await palApi('candidates/'+encodeURIComponent(id))).profile;var result=await palApi('candidates/'+encodeURIComponent(p.id)+'/history');
    document.getElementById('histoContentArea').style.display='block';document.getElementById('histoNoSelectionState').style.display='none';document.getElementById('histoSelectedName').textContent=p.nom||'';document.getElementById('histoSelectedMeta').textContent='CIN : '+(p.cin||'Non renseigné');document.getElementById('histoSelectedEmail').value=p.id;
    document.getElementById('histoTableBody').innerHTML=result.history.slice().sort(function(a,b){return (b.timestamp||b.date||'').localeCompare(a.timestamp||a.date||'');}).map(function(h){return '<tr><td>'+escape(h.timestamp?new Date(h.timestamp).toLocaleString('fr-FR'):h.date)+'</td><td>'+escape(h.champ||h.action)+'</td><td>'+escape(h.ancien===undefined?'Non enregistré':h.ancien)+'</td><td>'+escape(h.nouveau===undefined?h.details||'':h.nouveau)+'</td><td>'+escape(h.modifiePar||'Auteur non enregistré')+'</td></tr>';}).join('')||'<tr><td colspan="5">Aucun historique enregistré.</td></tr>';
  }catch(e){alert(e.message);}}
  window.selectionnerCandidatPourHisto=selectHistory;window.navToHistoForCandidate=function(id){navToSection('cHistoProfil');selectHistory(id);};
  function diagnosticOverview(view) {
    var labels={soi:'SOI',projet:'PROJET',territoire:'TERRITOIRE',methode:'MÉTHODE'};
    var html='<section class="pal-diagnostic-overview" aria-label="Diagnostic du lauréat"><h3>Diagnostic du lauréat</h3><p>'+(view.validationStatus==='fiabilise'?'Diagnostic fiabilisé par le conseiller.':'Diagnostic provisoire — En attente de fiabilisation par le conseiller.')+'</p><p><strong>Score global : '+(view.scores?view.scores.global+'/100':'Non disponible')+'</strong></p><div class="pal-diagnostic-dimensions">';
    html+=view.dimensions.map(function(d){return '<section data-score-dimension="'+d.key+'"><h4>'+labels[d.key]+'</h4><p>'+(d.score===null?'Questionnaire à compléter':d.score+'/100')+'</p>'+(d.score===null?'':'<progress max="100" value="'+d.score+'" aria-label="Score '+labels[d.key]+'"></progress>')+'</section>';}).join('')+'</div><h3>Prestations suggérées</h3><p>Suggestions à vérifier par le conseiller ; elles ne constituent pas des prescriptions validées.</p><div id="palSuggestedServices">';
    html+=view.suggestions.length?view.suggestions.map(function(w){return '<section data-suggestion="'+escape(w.id)+'"><h4>'+escape(w.nom)+'</h4><ul>'+w.reasons.map(function(r){return '<li>'+escape(r)+'</li>';}).join('')+'</ul><p>Sources : '+escape(w.sources.join(' ; '))+'</p></section>';}).join(''):'<p>'+(!view.questionnaireComplete?'Le questionnaire doit être finalisé avant de suggérer les prestations.':'Aucun besoin spécifique étayé n’a déclenché de suggestion.')+'</p>';
    if(view.ruleStatus==='configuration_requise')html+='<p>Les seuils du référentiel restent à configurer. Les suggestions affichées reposent sur les besoins explicitement déclarés.</p>';
    return html+'</div></section>';
  }
  function diagnosticMarkup(p,view) {
    var d=p.diagnosticIA;var titles={synthese:'A. Synthèse du profil',parcours:'B. Analyse du parcours',projet:'C. Projet professionnel',besoins:'D. Besoins d’accompagnement',recommandations:'E. Recommandations IA'};
    var html='<p>Les scores sont calculés à partir des réponses sauvegardées ; l’IA produit les analyses qualitatives.</p>';
    html+=view.dimensions.map(function(v){return '<section data-analysis-dimension="'+v.key+'"><h3>'+({soi:'SOI',projet:'PROJET',territoire:'TERRITOIRE',methode:'MÉTHODE'})[v.key]+'</h3><p>'+escape(v.analyse)+'</p>'+[['Points forts',v.pointsForts],['Difficultés identifiées',v.difficultes],['Besoins d’accompagnement',v.besoins]].map(function(x){return '<h4>'+x[0]+'</h4><p>'+escape(x[1].join(' ; ')||'Non renseignés')+'</p>';}).join('')+'</section>';}).join('');
    html+='<section id="palCvDiagnostic"><h3>Diagnostic du CV</h3>';
    if(view.cv.analysis)html+='<p>Extraction du contenu : '+escape(view.cv.analysis.engine||'Moteur non renseigné')+'</p><p style="white-space:pre-wrap">'+escape(readable(view.cv.analysis.diagnostic)||'Analyse qualitative du CV non enregistrée.')+'</p>';
    else html+='<p>'+(view.cv.available?'CV disponible ; diagnostic d’extraction non enregistré.':'Aucun CV enregistré. Le questionnaire permet de poursuivre le diagnostic.')+'</p>';
    if(view.cv.analysedByDiagnostic)html+='<p>Le contenu du CV disponible a été pris en compte dans le diagnostic IA.</p><ul>'+view.cv.parcours.map(function(t){return '<li>'+escape(t)+'</li>';}).join('')+'</ul>';
    html+='</section>';
    if(d?.status==='ready')html+=Object.keys(titles).map(function(k){return '<section><h3>'+titles[k]+'</h3><ul>'+(d.sections?.[k]||[]).map(function(t){return '<li>'+escape(t)+'</li>';}).join('')+'</ul></section>';}).join('');
    else html+='<p>Diagnostic IA non disponible. Les données présentes et les suggestions fondées sur le questionnaire restent consultables.</p>';
    var questions={p1:'Idée claire de l’emploi recherché',p1x:'Emploi recherché',p2:'Correspondance avec formation et expérience',p3:'Mobilité vers une autre ville',s1:'Connaissance des compétences exigées',s2:'Principales compétences',s3:'Qualités personnelles',t1:'Entreprises et secteurs recruteurs',t2:'Métiers demandés',t3:'Types de contrats',m1:'CV prêt et à jour',m2:'Utilisation des sites d’emploi',m3:'Préparation à l’entretien d’embauche',m4:'Plan de recherche d’emploi'};
    html+='<details><summary>Réponses au questionnaire et scores originaux</summary><dl class="pal-dossier-grid">'+Object.entries(p.positionnement?.answers||{}).map(function(x){return field(questions[x[0]]||x[0],({oui:'Oui',non:'Non',partiel:'Partiellement'})[x[1]]||x[1]);}).join('')+'</dl></details><details><summary>Accompagnement et diagnostic validé</summary><pre style="white-space:pre-wrap">'+escape(readable({validations:p.diagnosticValidations,entretiens:p.entretiens,prescriptions:p.prescriptionHistory,suivis:p.suivis}))+'</pre></details>';
    var legacy=p.positionnement?.diagnosticConseiller||p.positionnement?.diagnostic;if(legacy)html+='<details><summary>Diagnostic antérieur conservé</summary><p style="white-space:pre-wrap">'+escape(legacy)+'</p></details>';
    return html;
  }
  function reliabilityMarkup(p,view) {
    var labels={soi:'SOI',projet:'PROJET',territoire:'TERRITOIRE',methode:'MÉTHODE'};
    var a=p.positionnement?.answers||{};
    function short(value){return String(value||'').slice(0,350);}
    var fallback={
      soi:(a.s1==='oui'?'Les compétences exigées pour l’emploi sont connues. ':a.s1==='partiel'?'Les compétences exigées pour l’emploi sont partiellement connues. ':a.s1==='non'?'Les compétences exigées pour l’emploi restent à identifier. ':'')+(a.s1!=='non'&&a.s2?.trim()?'Le candidat identifie ses compétences. ':'')+(a.s1!=='non'&&a.s3?.trim()?'Le candidat identifie ses qualités personnelles.':''),
      projet:(a.p1x?'Emploi recherché : '+short(a.p1x)+'. ':a.p1==='non'?'Le projet professionnel reste à définir. ':'')+(a.p2==='non'?'Le candidat ne déclare pas de correspondance avec sa formation et son expérience. ':a.p2==='oui'?'Le candidat déclare un projet cohérent avec sa formation et son expérience. ':'')+(a.p3==='oui'?'Mobilité vers une autre ville acceptée.':''),
      territoire:[['t1','entreprises et secteurs recruteurs'],['t2','métiers demandés'],['t3','types de contrats']].map(function(x){return a[x[0]]==='non'?'Connaissance des '+x[1]+' à développer.':a[x[0]]==='partiel'?'Connaissance partielle des '+x[1]+'.':a[x[0]]==='oui'?'Connaissance des '+x[1]+' déclarée.':'';}).filter(Boolean).join(' '),
      methode:[['m1','CV'],['m2','sites d’emploi'],['m3','préparation à l’entretien'],['m4','plan de recherche']].filter(function(x){return a[x[0]]&&a[x[0]]!=='oui';}).map(function(x){return x[1]+' : '+(a[x[0]]==='non'?'à travailler':'à renforcer')+'.';}).join(' ')
    };
    var html='<section class="pal-diagnostic-overview"><h3>Diagnostic d’employabilité</h3><p>'+ (view.cv.available?'Sources : CV disponible et questionnaire.':'Source : questionnaire. Aucun CV disponible.')+'</p>';
    if(p.diagnosticIA?.status==='ready')html+='<p>'+escape(short((p.diagnosticIA.sections?.synthese||[]).slice(0,2).join(' ')))+'</p>';
    else html+='<p>Synthèse des réponses et des données extraites du CV disponibles ; analyse IA non disponible.</p>';
    html+='<p><strong>Score global : '+(view.scores?view.scores.global+'/100':'Questionnaire à compléter')+'</strong></p><div class="pal-diagnostic-dimensions">';
    html+=view.dimensions.map(function(d){return '<section data-score-dimension="'+d.key+'" data-analysis-dimension="'+d.key+'"><h4>'+labels[d.key]+' — '+(d.score===null?'À compléter':d.score+'/100')+'</h4>'+(d.score===null?'':'<progress max="100" value="'+d.score+'"></progress>')+'<p>'+escape(short(d.key==='soi'?fallback.soi:p.diagnosticIA?.status==='ready'?d.analyse:fallback[d.key])||'Réponses insuffisantes pour cette dimension.')+'</p></section>';}).join('')+'</div><h3>Prestations suggérées</h3><div id="palSuggestedServices">';
    html+=view.suggestions.length?view.suggestions.map(function(w){return '<section data-suggestion="'+escape(w.id)+'"><h4>'+escape(w.nom)+'</h4><p>'+escape(short(w.reasons.slice(0,2).join(' ')))+'</p></section>';}).join(''):'<p>Aucune suggestion disponible.</p>';
    var questions={p1:'Emploi recherché défini',p1x:'Emploi recherché',p2:'Correspondance formation et expérience',p3:'Mobilité',s1:'Compétences exigées connues',s2:'Compétences',s3:'Qualités',t1:'Entreprises et secteurs recruteurs',t2:'Métiers demandés',t3:'Types de contrats',m1:'CV prêt',m2:'Sites d’emploi',m3:'Préparation à l’entretien',m4:'Plan de recherche'};
    html+='</div><details><summary>Réponses au questionnaire d’employabilité</summary><dl class="pal-dossier-grid">'+Object.entries(a).map(function(x){return field(questions[x[0]]||x[0],!x[1]&&a.s1==='non'&&['s2','s3'].includes(x[0])?'Sans objet (réponse Non)':({oui:'Oui',non:'Non',partiel:'Partiellement'})[x[1]]||x[1]);}).join('')+'</dl></details></section><div id="palDossierFeedback" class="pal-feedback" role="status"></div><div class="pal-actions"><button class="pal-button primary" id="palValidate" '+(view.questionnaireComplete?'':'disabled')+'>Fiabiliser le profil</button><button class="pal-button" id="palBack">Retour à la liste</button></div>';
    var preview=[['Nom et prénom',p.nom||[p.prenom,p.nomfamille].filter(Boolean).join(' ')],['CIN',p.cin],['Téléphone',p.tel],['E-mail',p.email],['Ville',p.ville],['Établissement',p.etablissement],['Filière',p.filiere],['Niveau d’études',p.niveau],['Année du diplôme',p.anneeDiplome]].map(function(x){return field(x[0],x[1]);}).join('');
    return '<div class="pal-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="diagnostic">Diagnostic</button><button role="tab" aria-selected="false" data-tab="profile">Aperçu du profil</button></div><section data-tab-panel="diagnostic">'+html+'</section><section data-tab-panel="profile" hidden><h3>Coordonnées et parcours académique</h3><dl class="pal-dossier-grid">'+preview+'</dl></section>';
  }
  async function openDossier(id,reliability) {try{
    var result=await palApi('candidates/'+encodeURIComponent(id));selected=result.profile;var view=result.diagnosticView;dossierMode=reliability;var p=selected;mergeProfile(p);
    document.getElementById('mNom').textContent=p.nom||[p.prenom,p.nomfamille].filter(Boolean).join(' ');document.getElementById('mSub').textContent=palStatus(p);
    if(window.palVerifiedAdminRole==='universite'){
      var rdvs=(DB.rdvs||[]).filter(r=>(r.email||r.candidat_email)===p.email);
      var summary=[['Nom',p.nom],['Établissement',p.etablissement],['Filière',p.filiere],['Niveau',p.niveau],['Statut du dossier',palStatus(p)],['Entretiens réalisés',(p.entretiens||[]).filter(i=>i.status==='realise').length]];
      document.getElementById('mBody').innerHTML='<p>Espace université — consultation uniquement.</p><dl class="pal-dossier-grid">'+summary.map(x=>field(x[0],String(x[1]??'Non renseigné'))).join('')+'</dl><h3>Rendez-vous</h3>'+rdvs.map(r=>'<p>'+escape(r.date+' '+(r.heure||'')+' — '+(r.statut||r.status))+'</p>').join('')+'<h3>Prochains suivis</h3>'+(p.suivis||[]).map(f=>'<p>'+escape(f.date+' — '+f.objectif+' — '+f.status)+'</p>').join('');
      document.getElementById('modalApercu').style.display='flex';return;
    }
    var info=[['Nom et prénom',p.nom],['CIN',p.cin],['Date de naissance',p.naissance],['Téléphone',p.tel],['Adresse e-mail',p.email],['Adresse',p.adresse],['Ville',p.ville],['Province',p.province],['Sexe',p.sexe]].map(function(v){return field(v[0],v[1]);}).join('');
    var academic=[['Établissement',p.etablissement],['Filière',p.filiere],['Niveau d’études',p.niveau],['Diplômes',readable(p.diplomes||p.diplome||p.autresDiplomes)],['Année d’obtention',p.anneeDiplome],['Expériences professionnelles',readable(p.experiences||p.experienceDetail||[p.expPoste,p.expEntreprise,p.expDebut,p.expFin,p.experience].filter(Boolean).join(' — '))],['Stages',readable(p.stages)],['Formations complémentaires',readable(p.formations)],['Compétences',readable(p.competences)],['Langues',readable(p.langues)]].map(function(v){return field(v[0],v[1]);}).join('');
    document.getElementById('mBody').innerHTML=diagnosticOverview(view)+'<div class="pal-tabs" role="tablist">'+['Informations personnelles','Parcours académique et professionnel','Diagnostic IA'].map(function(t,i){return '<button role="tab" aria-selected="'+(i===0)+'" data-tab="'+i+'">'+t+'</button>';}).join('')+'</div><section data-tab-panel="0"><dl class="pal-dossier-grid">'+info+'</dl></section><section data-tab-panel="1" hidden><dl class="pal-dossier-grid">'+academic+'</dl><div id="palOriginalCv"></div></section><section data-tab-panel="2" hidden>'+diagnosticMarkup(p,view)+'</section><div id="palDossierFeedback" class="pal-feedback" role="status"></div>'+
    (reliability?'<label>Synthèse professionnelle<textarea id="palFinalSynthesis" class="pal-comment"></textarea></label><label>Observations qualitatives<textarea id="palFinalObservations" class="pal-comment"></textarea></label><label>Ateliers validés<select id="palFinalWorkshops" multiple class="pal-comment"></select></label><label>Commentaire destiné au candidat<textarea id="palCorrectionComment" class="pal-comment"></textarea></label><div class="pal-actions"><button class="pal-button primary" id="palValidate">Fiabiliser le profil</button><button class="pal-button" id="palBack">Retour à la liste</button></div>':'<div class="pal-actions"><label>Opérations autorisées<select id="palOperation"><option value="modify">Modification du profil</option><option value="history">Historique du profil</option><option value="prescribe">Prescription de prestations</option><option value="rdv">Valider le rendez-vous réalisé</option><option value="account">'+(p.actif===false?'Activer':'Désactiver')+' le compte</option><option value="archive">Archiver le compte (données conservées)</option></select></label><button class="pal-button" id="palRunOperation">Ouvrir</button></div>');
    if(reliability)document.getElementById('mBody').innerHTML=reliabilityMarkup(p,view);
    document.querySelectorAll('[data-tab]').forEach(function(btn){btn.onclick=function(){document.querySelectorAll('[data-tab]').forEach(function(b){b.setAttribute('aria-selected',b===btn?'true':'false');});document.querySelectorAll('[data-tab-panel]').forEach(function(s){s.hidden=s.dataset.tabPanel!==btn.dataset.tab;});};});
    var cv=p.cvUrl||p.cvData||p.cvFile;if(!reliability){if(cv && (/^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpeg));base64,/i.test(cv)||/^https:\/\//.test(cv)||/^\/uploads\//.test(cv))) {
      var a=document.createElement('a');a.textContent='Consulter le CV original';a.href=cv;a.target='_blank';a.rel='noopener';if(cv.startsWith('data:')){var pieces=cv.split(',');var bytes=Uint8Array.from(atob(pieces[1]),function(c){return c.charCodeAt(0);});a.href=URL.createObjectURL(new Blob([bytes],{type:pieces[0].slice(5).split(';')[0]}));a.download=p.cvName||p.cvFilename||'cv';}document.getElementById('palOriginalCv').appendChild(a);
    } else document.getElementById('palOriginalCv').textContent='Aucun CV original enregistré.';}
    if(reliability){document.getElementById('palValidate').onclick=function(){changeReliability('fiabilise');};document.getElementById('palBack').onclick=function(){fermerModal('modalApercu');navToSection('cFiabilisation');};}
    else document.getElementById('palRunOperation').onclick=runOperation;
    document.getElementById('modalApercu').style.display='flex';
  }catch(e){alert(e.message);}}
  window.voirApercu=function(id){openDossier(id,false);};
  async function changeReliability(status){var buttons=document.querySelectorAll('#mBody .pal-actions button');buttons.forEach(function(b){b.disabled=true;});try{
    var comment=status==='correction_demandee'?prompt('Précisez les corrections à apporter.')||'':'';if(status==='correction_demandee'&&!comment.trim()){feedback('Précisez les corrections à apporter.');return;}
    var result=await palApi('candidates/'+encodeURIComponent(selected.id)+'/fiabilisation',{status:status,comment:comment,_version:selected._version||0});
    mergeProfile(result.profile);
    if(status==='fiabilise'){fermerModal('modalApercu');await loadList('palReliabilityFilters');renderLauréats();}
    else{await openDossier(selected.id,true);loadList('palReliabilityFilters');renderLauréats();}
  }catch(e){feedback(e.message);}finally{buttons.forEach(function(b){b.disabled=false;});}}
  async function runOperation(){var op=document.getElementById('palOperation').value,id=selected.id,email=selected.email;try{
    if(op==='modify'){fermerModal('modalApercu');navToModifForCandidate(id);}else if(op==='history'){fermerModal('modalApercu');navToHistoForCandidate(id);}else if(op==='prescribe'){fermerModal('modalApercu');ouvrirPrescription(email);}else if(op==='rdv'){if(confirm('Confirmer que l’entretien a été réalisé ?'))validerRdvCandidatParEmail(email);}else if(confirm(op==='archive'?'Archiver ce compte ? Les données restent conservées.':'Confirmer le changement d’état du compte ?')){await palApi('candidates/'+encodeURIComponent(id)+'/account',{confirm:true,action:op,active:selected.actif===false});fermerModal('modalApercu');dbSync(renderLauréats);}
  }catch(e){feedback(e.message);}}
  window.doLogin=async function(){var error=document.getElementById('loginErr');try{var result=await palApi('auth/admin',{username:document.getElementById('loginUser').value,password:document.getElementById('loginPass').value});window.palVerifiedAdminRole=result.role;sessionStorage.setItem('dabanet_admin_role',result.role);if(result.role==='conseiller'){var collections={};['profils','rdvs','inscriptions','creneaux','ateliers','news','banners','prestations','evenements','publications'].forEach(function(key){try{collections[key]=JSON.parse(localStorage.getItem('dabanet_'+key)||'[]');}catch(_){}});await palApi('migration/local',{collections:collections});}dbSync(showDash);}catch(e){error.textContent=e.message;}};
  window.logout=async function(){await palApi('auth/logout',{});sessionStorage.removeItem('dabanet_admin_role');location.reload();};
  window.save=async function(key,value){try{var result=await palApi('data',{key:key.replace('dabanet_',''),value:value});if(result.data)window.DB=Object.assign(window.DB,result.data);}catch(e){alert(e.message);dbSync(renderConseiller);}};
  palApi('auth/me').then(function(d){if((d.role==='conseiller'||d.role==='universite')&&(!requestedRole||requestedRole===d.role)){window.palVerifiedAdminRole=d.role;sessionStorage.setItem('dabanet_admin_role',d.role);dbSync(showDash);}else {sessionStorage.removeItem('dabanet_admin_role');showDash();}}).catch(function(){sessionStorage.removeItem('dabanet_admin_role');showDash();});
})();
