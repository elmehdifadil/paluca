(function () {
  var form = document.getElementById('palWorkshopRegistration');
  var select = document.getElementById('palWorkshopChoice');
  var message = document.getElementById('palWorkshopMessage');
  var cinInput = document.getElementById('palWorkshopCin');
  var submitting = false, syncing = false;
  function updateControls() {
    var chosen = select.selectedOptions[0];
    var ready = !!select.value && chosen && !chosen.disabled;
    cinInput.disabled = !ready || syncing || submitting;
    cinInput.placeholder = ready ? 'Ex : AB123456' : 'Choisissez d’abord un atelier';
    form.querySelector('button[type="submit"]').disabled = !ready || syncing || submitting;
    select.disabled = syncing || submitting;
  }
  window.palRenderWorkshopChoices = function () {
    var selected = select.value;
    var ateliers = DB.ateliers || [];
    select.innerHTML = '<option value="">' + (ateliers.length ? 'Choisir un atelier' : 'Aucun atelier créé') + '</option>' + ateliers.map(function (a) {
      var count = (DB.inscriptions || []).filter(function (i) {
        return !['annule', 'annulee', 'annulé', 'annulée'].includes(i.statut || i.status) && (String(i.atelierId || i.prestationId) === String(a.id) || (!i.atelierId && !i.prestationId && i.atelier === a.titre));
      }).length;
      var full = Number(a.places) > 0 && count >= Number(a.places);
      var label = (a.titre || a.nom) + (a.date ? ' — ' + new Date(a.date).toLocaleString('fr-MA') : '') + (Number(a.places) > 0 ? ' — ' + Math.max(0, Number(a.places) - count) + ' place(s) disponible(s)' : '');
      return '<option value="' + esc(String(a.id)) + '"' + (full ? ' disabled' : '') + '>' + esc(label) + '</option>';
    }).join('');
    if (Array.from(select.options).some(function (o) { return o.value === selected && !o.disabled; })) select.value = selected;
    updateControls();
  };
  async function refreshWorkshops() {
    if (syncing || submitting) return;
    syncing = true; updateControls();
    try {
      var catalog = (await palApi('diagnostic/config')).workshops || [];
      var titleSelect = document.getElementById('atTitre');
      if (titleSelect) {
        var title = titleSelect.value;
        titleSelect.innerHTML = '<option value="">Choisir un atelier de la grille</option>' + catalog.map(function (w) {
          return '<option value="' + esc(w.nom) + '">' + esc(w.nom) + '</option>';
        }).join('');
        titleSelect.value = title;
      }
      await dbSync(function () { renderInscriptions(); renderAteliers(); });
    } catch (error) {
      message.textContent = 'Actualisation des ateliers impossible : ' + error.message;
    } finally {
      syncing = false; updateControls();
    }
  }
  var originalNav = window.navToSection;
  window.navToSection = function (sectionId, filter) {
    if (sectionId === 'cPrestations') sectionId = 'cAteliers';
    var result = originalNav.call(this, sectionId, filter);
    if (sectionId === 'cInsc' || sectionId === 'cAteliers') refreshWorkshops();
    return result;
  };
  document.getElementById('palWorkshopRefresh').onclick = refreshWorkshops;
  select.onchange = function () { message.textContent = ''; updateControls(); if (!cinInput.disabled) cinInput.focus(); };
  form.onsubmit = async function (event) {
    event.preventDefault();
    if (submitting || syncing || !select.value) return;
    submitting = true; updateControls();
    message.textContent = 'Inscription en cours…';
    try {
      var result = await palApi('ateliers/inscriptions', {
        cin: document.getElementById('palWorkshopCin').value,
        atelierId: select.value
      });
      message.textContent = result.inscription.nom + ' (CIN : ' + result.inscription.cin + ') a été inscrit à « ' + result.inscription.atelier + ' ».';
      document.getElementById('palWorkshopCin').value = '';
      await dbSync(function () { renderInscriptions(); renderAteliers(); });
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submitting = false;
      window.palRenderWorkshopChoices();
    }
  };
  window.palRenderWorkshopChoices();
})();
