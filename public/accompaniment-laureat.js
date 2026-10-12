(function(){
 var oldOpen=window.openTrefle,timer,step=0;
 function answers(){var a={};TREFLE_Q.forEach(g=>g.items.forEach(it=>{var e=document.getElementById(it.id),r=document.querySelector('input[name="'+it.id+'"]:checked');if(e)a[it.id]=e.value;else if(r)a[it.id]=r.value;if(it.extra)a[it.extra.id]=document.getElementById(it.extra.id).value;}));return a;}
 window.openTrefle=function(){oldOpen();var draft=ME.questionnaireDraft?.answers;if(draft)Object.keys(draft).forEach(k=>{var e=document.getElementById(k);if(e)e.value=draft[k];else document.querySelectorAll('input[name="'+k+'"]').forEach(e=>e.checked=e.value===draft[k]);});
 var form=document.getElementById('trefleForm');
 function conditionalFields(){var no=document.querySelector('input[name="s1"]:checked')?.value==='non';['s2','s3'].forEach(function(id){var field=document.getElementById(id);field.disabled=no;field.required=!no;field.closest('div').style.opacity=no?'0.45':'1';});var extra=document.getElementById('p1x');extra.disabled=document.querySelector('input[name="p1"]:checked')?.value==='non';extra.style.opacity=extra.disabled?'0.45':'1';}
 conditionalFields();form.onchange=conditionalFields;var sections=Array.from(form.children);var nav=document.createElement('div');nav.innerHTML='<progress max="4" value="1" style="width:100%"></progress><p id="palQuestionStep"></p><button type="button" id="palPrevQuestion">Précédent</button> <button type="button" id="palNextQuestion">Suivant</button><p id="palDraftStatus" role="status"></p>';form.appendChild(nav);
 function show(){sections.forEach((e,i)=>e.hidden=i!==step);nav.querySelector('progress').value=step+1;document.getElementById('palQuestionStep').textContent='Dimension '+(step+1)+' / 4';document.getElementById('palPrevQuestion').disabled=step===0;document.getElementById('palNextQuestion').disabled=step===3;}
 document.getElementById('palPrevQuestion').onclick=()=>{step--;show();};document.getElementById('palNextQuestion').onclick=()=>{step++;show();};step=0;show();form.oninput=function(){clearTimeout(timer);timer=setTimeout(async()=>{try{await palApi('me/questionnaire/draft',{answers:answers()});document.getElementById('palDraftStatus').textContent='Réponses sauvegardées.';}catch(e){document.getElementById('palDraftStatus').textContent=e.message;}},450);};
 };
 var prompted=false;var original=window.renderEspace;
 window.renderEspace=function(){original();if(!ME)return;if(!ME.positionnement?.scores&&!prompted){prompted=true;setTimeout(()=>openTrefle(),0);}document.getElementById('palDiagnosticResult')?.remove();};
})();
