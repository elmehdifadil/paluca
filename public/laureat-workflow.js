(function(){
  var saveQueue=Promise.resolve(), diagnosticRequest=null, attemptedDiagnostic=null;
  function setProfile(p){ME=p;window.DB.profils=[p];localStorage.setItem('dabanet_profils',JSON.stringify([p]));scheduleDiagnostic();}
  var oldRender=window.renderEspace;
  window.renderEspace=function(){oldRender();renderReliability();};
  var oldState=window.getParcoursState;
  window.getParcoursState=function(){var state=oldState();state.prestationsDebloquees=state.prestationsDebloquees&&ME?.fiabilisationStatut==='fiabilise';return state;};
  var card=document.createElement('section');card.className='pal-notice';card.id='palReliabilityStatus';
  document.getElementById('cardRdv').parentNode.insertBefore(card,document.getElementById('cardRdv'));
  function renderReliability(){
    if(!ME)return;
    var ready=ME.fiabilisationStatut==='fiabilise';
    var pending=(dbGet('rdvs')||[]).some(function(r){return String(r.email||r.candidat_email||r.candidate_id||'').toLowerCase()===ME.email.toLowerCase()&&['pending','en attente'].includes(String(r.status||r.statut||'pending').toLowerCase());});
    var canRequest=ready&&!pending;
    card.innerHTML='<h3>'+esc(palStatus(ME))+'</h3><p>'+esc(ME.fiabilisationStatut==='correction_demandee'?(ME.correctionComment||'Veuillez compléter votre profil.'):ready?'Vous pouvez réserver un rendez-vous parmi les créneaux disponibles.':'La demande de rendez-vous sera disponible après fiabilisation de votre dossier par le conseiller.')+'</p>'+
      (ME.fiabilisationStatut==='correction_demandee'?'<button class="pal-button" id="palSubmitCorrections">Soumettre les corrections</button>':'')+
      '<p id="palWorkflowMessage" role="status"></p>';
    var booking=document.getElementById('rdvBookingSection');if(booking){booking.style.display='block';booking.inert=!canRequest;booking.style.opacity=canRequest?'1':'0.45';booking.setAttribute('aria-disabled',String(!canRequest));}var rdvCard=document.getElementById('cardRdv');if(rdvCard){rdvCard.classList.toggle('pal-rdv-locked',!ready);}var badge=document.getElementById('badgeRdvStatus');if(badge&&!ready){badge.textContent='En attente de fiabilisation';} 
    var banner=document.getElementById('nextStepBanner');if(banner)banner.style.display=canRequest&&!getParcoursState().hasReserve?'block':'none';
    var submit=document.getElementById('btnSubmitRdv');if(submit)submit.disabled=!canRequest;
    if(pending)message('Votre demande de rendez-vous est en attente. Attendez la décision du conseiller avant de réserver un autre créneau.');
    var corrections=document.getElementById('palSubmitCorrections');if(corrections)corrections.onclick=async function(){try{await saveQueue;setProfile((await palApi('me/corrections',{})).profile);renderEspace();}catch(e){message(e.message);}};
    var grid=document.getElementById('prestationsGrid');if(grid&&!getParcoursState().prestationsDebloquees)grid.innerHTML='<p>Les prestations seront accessibles après fiabilisation et réalisation de l’entretien.</p>';
    var stepper=document.getElementById('parcoursStepper');if(stepper){var steps=[['Inscription',true],['Informations',getParcoursState().hasInfos],["Questionnaire d’employabilité",getParcoursState().hasQuestionnaire],['Fiabilisation',ready],['Rendez-vous',getParcoursState().hasReserve],['Prestations',getParcoursState().prestationsDebloquees]];stepper.innerHTML=steps.map(function(s,i){return '<div class="step-card '+(s[1]?'completed':'pending')+'"><div class="step-num">'+(i+1)+'</div><div class="step-title">'+s[0]+'</div><div class="step-desc">'+(s[1]?'Terminé':i===0?'CV facultatif':'À compléter')+'</div></div>';}).join('');}
  }
  function message(text){var el=document.getElementById('palWorkflowMessage');if(el)el.textContent=text;else alert(text);}
  window.dbSet=function(key,value){
    if(key!=='profils')return;
    var p=value.find(function(p){return p.id===ME?.id||p.email===ME?.email;});if(!p)return;
    window.DB.profils=[p];var data=JSON.parse(JSON.stringify(p));
    saveQueue=saveQueue.catch(function(){}).then(async function(){var result=await palApi('me/update',data);setProfile(result.profile);});
    saveQueue.catch(function(e){message(e.message);});return saveQueue;
  };
  window.sauvegarderInfosCandidat=async function(){try{
    var map={infoNom:'nom',infoCin:'cin',infoTel:'tel',infoEtab:'etablissement',infoFiliere:'filiere',infoNiveau:'niveau',infoVille:'ville'};
    var data={};Object.keys(map).forEach(function(id){var el=document.getElementById(id);if(el)data[map[id]]=el.value;});
    setProfile((await palApi('me/update',data)).profile);document.getElementById('infoMsg').textContent='Informations enregistrées.';renderReliability();
  }catch(e){document.getElementById('infoMsg').textContent=e.message;}};
  function scheduleDiagnostic(){
    if(!ME?.positionnement?.scores||ME.diagnosticIA?.status==='ready'||ME.diagnosticIA?.status==='error')return;
    var key=ME.id+':'+(ME._version||0);if(key===attemptedDiagnostic)return;
    setTimeout(function(){if(ME.id+':'+(ME._version||0)!==attemptedDiagnostic&&!diagnosticRequest&&ME?.positionnement?.scores&&ME.diagnosticIA?.status!=='ready'&&ME.diagnosticIA?.status!=='error')generateDiagnostic();},0);
  }
  async function generateDiagnostic(){
    if(diagnosticRequest)return diagnosticRequest;
    diagnosticRequest=(async function(){try{
      await saveQueue;attemptedDiagnostic=ME.id+':'+(ME._version||0);

      var retry=document.getElementById('palRetryDiagnostic');if(retry)retry.disabled=true;
      var result=await palApi('me/diagnostic',{});setProfile(result.profile);renderEspace();
    }catch(e){/* Diagnostic handled in the background, without candidate controls. */}finally{diagnosticRequest=null;var retry=document.getElementById('palRetryDiagnostic');if(retry)retry.disabled=false;scheduleDiagnostic();}})();
    return diagnosticRequest;
  }
  window.submitTrefle=async function(){var answers={},missing=0;TREFLE_Q.forEach(function(g){g.items.forEach(function(it){if(it.type==='ouinon'||it.type==='scale'){var checked=document.querySelector('input[name="'+it.id+'"]:checked');if(!checked)missing++;else answers[it.id]=checked.value;if(it.extra)answers[it.extra.id]=checked?.value==='non'?'':document.getElementById(it.extra.id).value;}else {answers[it.id]=document.getElementById(it.id).value;if(answers.s1==='non'&&['s2','s3'].includes(it.id))answers[it.id]='';else if(!answers[it.id].trim())missing++;}});});if(missing){document.getElementById('trefleErr').textContent='Répondez aux '+missing+' questions restantes.';return;}try{await saveQueue;setProfile((await palApi('me/questionnaire',{answers:answers})).profile);document.getElementById('trefleModal').style.display='none';renderTrefleResults(effScores(ME),'',true);renderEspace();await generateDiagnostic();goToRdv();}catch(e){document.getElementById('trefleErr').textContent=e.message;}};
  window.submitRdvEspace=async function(){var msg=document.getElementById('rdv-msg');try{
    if(ME.fiabilisationStatut!=='fiabilise')throw new Error('La fiabilisation par le conseiller est requise.');
    var slot=(dbGet('creneaux')||[]).find(function(c){return String(c.id)===String(selectedSlot);});if(!slot)throw new Error('Sélectionnez un créneau disponible.');
    await palApi('rdvs',{creneauId:slot.id,date:slot.date,heure:slot.heure||slot.time||slot.debut,type:currentRdvMode,conseiller_id:slot.conseiller_id,motif:document.getElementById('rdv-sujet')?.value||''});
    dbSync(function(){var p=dbGet('profils')[0];if(p)setProfile(p);renderSlots();renderMesRdvs();renderEspace();});renderReliability();msg.textContent='Demande de rendez-vous enregistrée, en attente de confirmation du conseiller.';
  }catch(e){msg.textContent=e.message;msg.style.color='#9b1c1c';}};
  window.goToRdv=function(){document.getElementById(ME?.fiabilisationStatut==='fiabilise'?'cardRdv':'palReliabilityStatus')?.scrollIntoView({behavior:'smooth'});};
  window.inscrirePrestation=async function(id){try{await palApi('me/prestations',{id:id});dbSync(function(){renderPrestationsSection();renderReliability();});}catch(e){message(e.message);}};
  window.desinscrirePrestation=async function(id){if(!confirm('Annuler cette inscription ?'))return;try{await palApi('me/prestations',{id:id,cancel:true});dbSync(function(){renderPrestationsSection();renderReliability();});}catch(e){message(e.message);}};
  window.logoutEspace=async function(){await palApi('auth/logout',{});localStorage.removeItem('dabanet_session');location.href='/connexion';};
  palApi('auth/me').then(function(d){if(d.role!=='laureat'){location.href='/connexion';return;}setProfile(d.profile);localStorage.setItem('dabanet_session',ME.email);dbSync(function(){setProfile(dbGet('profils')[0]||ME);PRESTATIONS_CATALOGUE=[...(window.DB.prestations||[]),...(window.DB.ateliers||[])].map(function(x){return Object.assign({},x,{titre:x.titre||x.nom,cat:'atelier',catLabel:'Accompagnement',desc:x.description||'',modalite:x.modalite||'',places:x.places||'Non renseignées',lieu:x.lieu||'Non renseigné',date:x.date||'À planifier'});});renderEspace();});}).catch(function(){location.href='/connexion';});
  setInterval(function(){if(document.hidden||!ME)return;palApi('me').then(function(d){setProfile(d.profile);renderReliability();}).catch(function(){});},30000);
})();
