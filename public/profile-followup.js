(function () {
  var profile = null, request = 0, saving = false;
  var panel = document.createElement('section');
  panel.id = 'cSuiviProfils'; panel.className = 'panel';
  panel.innerHTML = '<div class="card"><h3>Suivi des profils</h3><form id="palEmploymentSearch" class="pal-toolbar"><label>CIN du candidat<input name="cin" required autocomplete="off" placeholder="Ex : AB123456"></label><button class="pal-button" type="submit">Rechercher</button></form><p id="palEmploymentMessage" role="status" aria-live="polite"></p><div id="palEmploymentCandidate" hidden><dl class="pal-dossier-grid" id="palEmploymentIdentity"></dl><form id="palEmploymentForm"><fieldset><legend>Action de suivi</legend><div class="pal-service-options"><label><input type="radio" name="type" value="mise_en_relation" checked> Mise en relation</label><label><input type="radio" name="type" value="insertion"> Insertion professionnelle</label></div></fieldset><label><span id="palEmploymentOrganisationLabel">Nom de la société</span><input name="organisation" required maxlength="200" autocomplete="organization"></label><div class="pal-actions"><button class="pal-button primary" type="submit">Enregistrer dans l’historique</button><button class="pal-button" id="palEmploymentHistory" type="button">Consulter l’historique du profil</button></div></form><h3>Actions enregistrées</h3><div id="palEmploymentEntries"></div></div></div>';
  document.getElementById('cLauréats').after(panel);
  var mobile = document.getElementById('mNavConseiller');
  if (mobile) {
    var button = document.createElement('button');button.className = 'm-nav-item';button.textContent = 'Suivi des profils';
    button.onclick = function () { navToSection('cSuiviProfils'); toggleMobileDrawer(); };mobile.appendChild(button);
  }
  var search = document.getElementById('palEmploymentSearch'), form = document.getElementById('palEmploymentForm');
  var message = document.getElementById('palEmploymentMessage'), candidate = document.getElementById('palEmploymentCandidate');
  function safe(v) { return esc(String(v || '')); }
  function showProfile(p) {
    profile = p;
    document.getElementById('palEmploymentIdentity').innerHTML = [['Nom', p.nomfamille || p.nom || 'Non renseigné'], ['Prénom', p.prenom || 'Non renseigné'], ['CIN', p.cin]].map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + safe(x[1]) + '</dd></div>'; }).join('');
    document.getElementById('palEmploymentEntries').innerHTML = (p.employmentFollowups || []).slice().reverse().map(function (e) {
      return '<p><strong>' + (e.type === 'insertion' ? 'Insertion professionnelle — Employeur : ' : 'Mise en relation — Société : ') + safe(e.organisation) + '</strong><br><small>' + safe(new Date(e.date).toLocaleString('fr-MA')) + ' — ' + safe(e.actor) + '</small></p>';
    }).join('') || '<p>Aucune action enregistrée pour ce candidat.</p>';
    candidate.hidden = false;
  }
  search.oninput = function () { request++;profile = null;candidate.hidden = true;message.textContent = ''; };
  search.onsubmit = async function (event) {
    event.preventDefault();if (saving) return;
    var current = ++request;profile = null;candidate.hidden = true;message.textContent = 'Recherche en cours…';
    try {
      var result = await palApi('profile-followup?cin=' + encodeURIComponent(search.elements.cin.value));
      if (current !== request) return;
      form.reset();document.getElementById('palEmploymentOrganisationLabel').textContent = 'Nom de la société';
      showProfile(result.profile);message.textContent = '';
    } catch (error) { if (current === request) message.textContent = error.message; }
  };
  form.onchange = function () { document.getElementById('palEmploymentOrganisationLabel').textContent = form.elements.type.value === 'insertion' ? 'Nom de l’employeur' : 'Nom de la société'; };
  form.onsubmit = async function (event) {
    event.preventDefault();if (!profile || saving) return;
    saving = true;form.querySelector('[type="submit"]').disabled = true;search.elements.cin.disabled = true;message.textContent = 'Enregistrement en cours…';
    try {
      var result = await palApi('candidates/' + encodeURIComponent(profile.id) + '/employment-followup', {type: form.elements.type.value, organisation: form.elements.organisation.value, _version: profile._version || 0});
      showProfile(result.profile);
      var index = DB.profils.findIndex(function (p) { return String(p.id) === String(result.profile.id); });
      if (index >= 0) DB.profils[index] = result.profile;
      form.elements.organisation.value = '';message.textContent = 'Action enregistrée dans l’historique du candidat.';
    } catch (error) { message.textContent = error.message; }
    finally { saving = false;form.querySelector('[type="submit"]').disabled = false;search.elements.cin.disabled = false; }
  };
  document.getElementById('palEmploymentHistory').onclick = function () { if (profile) navToHistoForCandidate(profile.id); };
  var nav = window.navToSection;
  window.navToSection = function (id, filter) {
    var result = nav(id, filter);
    if (id === 'cSuiviProfils') { document.querySelectorAll('.nav-link-btn').forEach(function (b) { b.classList.remove('active'); });document.getElementById('navBtnChercheurs').classList.add('active'); }
    return result;
  };
})();
