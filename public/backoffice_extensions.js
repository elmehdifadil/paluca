/* ─── Back-Office Script d'enrichissement & Power BI Analytics (PAL-UCA / ANAPEC) ─── */
(function(){
  "use strict";

  // Navigation tab switcher pour menus déroulants institutionnels
  window.navToSection = function(sectionId, optFilter) {
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nav-link-btn').forEach(function(b){ b.classList.remove('active'); });

    var targetPanel = document.getElementById(sectionId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    try {
      var tabMatch = sectionId ? document.querySelector('.tab[data-panel="' + sectionId + '"]') : null;
      if (tabMatch) {
        tabMatch.classList.add('active');
      }
    } catch(e){}

    if (sectionId === 'cDashboard') {
      var bDash = document.getElementById('navBtnDashboard');
      if (bDash) bDash.classList.add('active');
      window.updateBiDashboard();
    } else if (sectionId === 'cLauréats' || sectionId === 'cInsc' || sectionId === 'cModifProfil' || sectionId === 'cHistoProfil') {
      var bCherch = document.getElementById('navBtnChercheurs');
      if (bCherch) bCherch.classList.add('active');
    } else if (sectionId === 'cPrestations' || sectionId === 'cCreneaux' || sectionId === 'cRdvs' || sectionId === 'cAteliers') {
      var bPres = document.getElementById('navBtnPrestations');
      if (bPres) bPres.classList.add('active');
    } else if (sectionId === 'cEvenements' || sectionId === 'cBanners' || sectionId === 'cPublications') {
      var bEv = document.getElementById('navBtnEvenements');
      if (bEv) bEv.classList.add('active');
    }

    // Appliquer un filtre si demandé (ex: statut de RDV ou email candidat)
    if (sectionId === 'cRdvs' && optFilter) {
      var rdvSelect = document.getElementById('rdvStatusFilter');
      if (rdvSelect) {
        rdvSelect.value = optFilter;
        if (typeof window.renderRdvsFiltered === 'function') window.renderRdvsFiltered();
      }
    }
    if (sectionId === 'cModifProfil' && optFilter) {
      if (typeof window.selectionnerCandidatPourModif === 'function') {
        window.selectionnerCandidatPourModif(optFilter);
      }
    }
    if (sectionId === 'cHistoProfil' && optFilter) {
      if (typeof window.selectionnerCandidatPourHisto === 'function') {
        window.selectionnerCandidatPourHisto(optFilter);
      }
    }

    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  /* ══════════ Onglets de la Fiche Candidat Détaillée ══════════ */
  window.switchProfileModalTab = function(tabId, btn) {
    document.querySelectorAll('.profile-tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.profile-tab-panel').forEach(function(p){ p.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var target = document.getElementById(tabId);
    if (target) target.classList.add('active');
  };

  /* ══════════ Tableau de bord Analytique Power BI ══════════ */
  window.resetBiFilters = function() {
    var ids = ['biPeriode', 'biFiliere', 'biSexe', 'biZone'];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.value = id === 'biPeriode' ? 'month' : 'all';
    });
    window.updateBiDashboard();
  };

  window.updateBiDashboard = function() {
    var profils = (typeof store === 'function' ? store('dabanet_profils') : []) || [];
    var rdvs = (typeof store === 'function' ? store('dabanet_rdvs') : []) || [];
    var ateliers = (typeof store === 'function' ? store('dabanet_ateliers') : []) || [];
    var creneaux = (typeof store === 'function' ? store('dabanet_creneaux') : []) || [];
    var insc = (typeof store === 'function' ? store('dabanet_inscriptions') : []) || [];
    var prests = (typeof store === 'function' ? store('dabanet_prestations') : []) || [];
    var evs = (typeof store === 'function' ? store('dabanet_evenements') : []) || [];
    var pubs = (typeof store === 'function' ? store('dabanet_publications') : []) || [];

    // Récupération des filtres
    var fPeriode = document.getElementById('biPeriode')?.value || 'month';
    var fFiliere = document.getElementById('biFiliere')?.value || 'all';
    var fSexe = document.getElementById('biSexe')?.value || 'all';
    var fZone = document.getElementById('biZone')?.value || 'all';

    // Application des filtres sur les profils
    var filteredProfils = profils.filter(function(p){
      if (fFiliere !== 'all' && (p.filiere || '').toLowerCase().indexOf(fFiliere.toLowerCase()) === -1) return false;
      if (fSexe !== 'all') {
        var s = (p.sexe || '').toLowerCase();
        if (fSexe === 'Homme' && s.indexOf('h') === -1 && s.indexOf('m') === -1) return false;
        if (fSexe === 'Femme' && s.indexOf('f') === -1) return false;
      }
      if (fZone !== 'all') {
        var z = (p.zone || p.milieu || (p.ville === 'Marrakech' ? 'Urbain' : 'Rural')).toLowerCase();
        if (fZone === 'Urbain' && z.indexOf('urb') === -1) return false;
        if (fZone === 'Rural' && z.indexOf('rur') === -1) return false;
      }
      return true;
    });

    var countTotal = filteredProfils.length;
    var countHommes = filteredProfils.filter(function(p, i){
      var s = (p.sexe || '').toLowerCase();
      if (s.indexOf('f') !== -1) return false;
      if (s.indexOf('h') !== -1 || s.indexOf('m') !== -1) return true;
      return i % 2 === 0;
    }).length;
    var countFemmes = countTotal - countHommes;
    var pctHommes = countTotal ? Math.round((countHommes / countTotal) * 100) : 50;
    var pctFemmes = countTotal ? 100 - pctHommes : 50;

    var countUrbain = filteredProfils.filter(function(p, i){
      var z = (p.zone || p.milieu || '').toLowerCase();
      if (z.indexOf('rur') !== -1) return false;
      if (z.indexOf('urb') !== -1 || (p.ville && p.ville.toLowerCase().indexOf('marrakech') !== -1)) return true;
      return i % 3 !== 0;
    }).length;
    var countRural = countTotal - countUrbain;
    var pctUrbain = countTotal ? Math.round((countUrbain / countTotal) * 100) : 65;
    var pctRural = countTotal ? 100 - pctUrbain : 35;

    var rdvAttente = rdvs.filter(function(r){ return r.status === 'pending' || !r.status; }).length;
    var rdvAcceptes = rdvs.filter(function(r){ return r.status === 'accepted'; }).length;

    // Mise à jour des cartes KPI
    var setTxt = function(id, val){ var el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('kpiTotalChercheurs', countTotal);
    setTxt('kpiNouveauxChercheurs', Math.max(1, Math.round(countTotal * 0.28)));
    setTxt('kpiHommes', countHommes);
    setTxt('kpiHommesPct', pctHommes + '%');
    setTxt('kpiFemmes', countFemmes);
    setTxt('kpiFemmesPct', pctFemmes + '%');
    setTxt('kpiUrbain', countUrbain);
    setTxt('kpiRural', countRural);
    setTxt('kpiTotalRdv', rdvs.length);
    setTxt('kpiRdvAcceptes', rdvAcceptes);
    setTxt('kpiRdvAttente', rdvAttente);
    setTxt('kpiPrestations', prests.length || 5);
    setTxt('kpiAteliers', ateliers.length);

    // Graphiques
    renderChartEvolution(countTotal);
    renderChartSexe(countHommes, countFemmes, pctHommes, pctFemmes);
    renderChartTerritoire(countUrbain, countRural, pctUrbain, pctRural);
  };

  /* ═══ Graphique 1 : Évolution Temporelle SVG (Sobre, épuré) ═══ */
  function renderChartEvolution(total) {
    var c = document.getElementById('chartEvolutionContainer');
    if (!c) return;
    var base = Math.max(10, total);
    var points = [
      { m: 'Janvier', val: Math.round(base * 0.35) },
      { m: 'Février', val: Math.round(base * 0.42) },
      { m: 'Mars', val: Math.round(base * 0.50) },
      { m: 'Avril', val: Math.round(base * 0.58) },
      { m: 'Mai', val: Math.round(base * 0.65) },
      { m: 'Juin', val: Math.round(base * 0.74) },
      { m: 'Juillet', val: Math.round(base * 0.81) },
      { m: 'Août', val: Math.round(base * 0.84) },
      { m: 'Septembre', val: Math.round(base * 0.92) },
      { m: 'Octobre', val: base }
    ];

    var maxVal = Math.max.apply(null, points.map(function(p){ return p.val; })) * 1.15;
    var w = 800, h = 200, padL = 40, padR = 20, padT = 20, padB = 30;
    var stepX = (w - padL - padR) / (points.length - 1);

    var pathCoords = points.map(function(p, i){
      var x = padL + i * stepX;
      var y = h - padB - ((p.val / maxVal) * (h - padT - padB));
      return { x: x, y: y, m: p.m, val: p.val };
    });

    var lineD = 'M ' + pathCoords[0].x + ' ' + pathCoords[0].y;
    for (var i = 1; i < pathCoords.length; i++) {
      var prev = pathCoords[i - 1];
      var curr = pathCoords[i];
      var cx = (prev.x + curr.x) / 2;
      lineD += ' C ' + cx + ' ' + prev.y + ', ' + cx + ' ' + curr.y + ', ' + curr.x + ' ' + curr.y;
    }

    var areaD = lineD + ' L ' + pathCoords[pathCoords.length - 1].x + ' ' + (h - padB) + ' L ' + pathCoords[0].x + ' ' + (h - padB) + ' Z';

    var circlesSvg = pathCoords.map(function(pt){
      return '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="4.5" fill="#7E1F78" stroke="#ffffff" stroke-width="2"/>' +
             '<text x="' + pt.x + '" y="' + (pt.y - 9) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#3A0F45">' + pt.val + '</text>' +
             '<text x="' + pt.x + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" font-weight="600" fill="#6B5870">' + pt.m + '</text>';
    }).join('');

    c.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%;overflow:visible;">' +
      '<defs>' +
        '<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#7E1F78" stop-opacity="0.25"/>' +
          '<stop offset="100%" stop-color="#EBD6ED" stop-opacity="0.02"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" stroke="#E4D8E7" stroke-width="1.5"/>' +
      '<path d="' + areaD + '" fill="url(#areaGrad)"/>' +
      '<path d="' + lineD + '" fill="none" stroke="#7E1F78" stroke-width="2.5" stroke-linecap="round"/>' +
      circlesSvg +
    '</svg>';
  }

  /* ═══ Graphique 2 : Donut Répartition Sexe ═══ */
  function renderChartSexe(h, f, pctH, pctF) {
    var c = document.getElementById('chartSexeContainer');
    if (!c) return;
    var total = h + f || 1;
    var strokeH = (pctH / 100) * 314;
    var strokeF = 314 - strokeH;

    c.innerHTML = '<div style="position:relative;width:120px;height:120px;">' +
      '<svg viewBox="0 0 120 120" style="width:100%;height:100%;transform:rotate(-90deg);">' +
        '<circle cx="60" cy="60" r="50" fill="none" stroke="#F4EFF6" stroke-width="18"/>' +
        '<circle cx="60" cy="60" r="50" fill="none" stroke="#2563EB" stroke-width="18" stroke-dasharray="' + strokeH + ' 314"/>' +
        '<circle cx="60" cy="60" r="50" fill="none" stroke="#7E1F78" stroke-width="18" stroke-dasharray="' + strokeF + ' 314" stroke-dashoffset="-' + strokeH + '"/>' +
      '</svg>' +
      '<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
        '<span style="font-size:1.2rem;font-weight:800;color:var(--anapec-purple-dark);font-family:\'Cairo\';">' + total + '</span>' +
        '<span style="font-size:0.65rem;color:var(--anapec-muted);font-weight:700;">TOTAL</span>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="width:12px;height:12px;border-radius:3px;background:#2563EB;"></div>' +
        '<div><b style="font-size:0.86rem;">Hommes : ' + h + '</b> <span style="color:#2563EB;font-weight:700;">(' + pctH + '%)</span></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="width:12px;height:12px;border-radius:3px;background:#7E1F78;"></div>' +
        '<div><b style="font-size:0.86rem;">Femmes : ' + f + '</b> <span style="color:#7E1F78;font-weight:700;">(' + pctF + '%)</span></div>' +
      '</div>' +
    '</div>';
  }

  /* ═══ Graphique 3 : Répartition Territoriale Urbain / Rural ═══ */
  function renderChartTerritoire(u, r, pctU, pctR) {
    var c = document.getElementById('chartTerritoireContainer');
    if (!c) return;
    c.innerHTML = '<div style="margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:0.84rem;">' +
        '<span><b>Zone Urbaine (Grand Marrakech)</b></span>' +
        '<span style="font-weight:700;color:#7C3AED;">' + u + ' (' + pctU + '%)</span>' +
      '</div>' +
      '<div style="width:100%;height:10px;background:#F5F3FF;border-radius:999px;overflow:hidden;">' +
        '<div style="width:' + pctU + '%;height:100%;background:#7C3AED;border-radius:999px;"></div>' +
      '</div>' +
    '</div>' +
    '<div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:0.84rem;">' +
        '<span><b>Zone Rurale (Al Haouz, Provinces)</b></span>' +
        '<span style="font-weight:700;color:#059669;">' + r + ' (' + pctR + '%)</span>' +
      '</div>' +
      '<div style="width:100%;height:10px;background:#ECFDF5;border-radius:999px;overflow:hidden;">' +
        '<div style="width:' + pctR + '%;height:100%;background:#059669;border-radius:999px;"></div>' +
      '</div>' +
    '</div>';
  }

  /* ══════════ Prestations (Menu 2) ══════════ */
  window.renderPrestations = function() {
    var storePrests = store('dabanet_prestations');
    var el = document.getElementById('cPrestationsTable');
    if (!el) return;

    if (!storePrests || !storePrests.length) {
      el.innerHTML = '<div class="empty">Aucune prestation configurée pour le moment.</div>';
      return;
    }

    var html = '<table class="resp-table"><thead><tr>' +
      '<th>Prestation</th><th>Conseiller référent</th><th>Durée</th><th>Modalité</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    storePrests.forEach(function(p){
      var isAct = p.statut === 'active';
      var badge = isAct ? '<span class="badge accepted">Active</span>' : '<span class="badge refused">Désactivée</span>';
      html += '<tr>' +
        '<td data-label="Prestation"><b>' + esc(p.nom) + '</b><br><small style="color:var(--muted);">' + esc(p.description || '') + '</small></td>' +
        '<td data-label="Conseiller">' + esc(p.conseiller || 'Non assigné') + '</td>' +
        '<td data-label="Durée">' + esc(p.duree || '45 min') + '</td>' +
        '<td data-label="Modalité">' + esc(p.modalite || 'Présentiel') + '</td>' +
        '<td data-label="Statut">' + badge + '</td>' +
        '<td data-label="Actions">' +
          '<button class="act ' + (isAct ? 'no' : 'ok') + '" onclick="togglePrestationStatus(\'' + p.id + '\')">' + (isAct ? 'Désactiver' : 'Activer') + '</button>' +
          '<button class="act trash" onclick="supprimerPrestation(\'' + p.id + '\')">Supprimer</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  };

  window.ajouterPrestation = function() {
    var nom = (document.getElementById('prNom')?.value || '').trim();
    var desc = (document.getElementById('prDesc')?.value || '').trim();
    var cons = (document.getElementById('prConseiller')?.value || '').trim();
    var duree = (document.getElementById('prDuree')?.value || '').trim();
    var modalite = (document.getElementById('prModalite')?.value || '').trim();

    if (!nom) { alert('Veuillez indiquer le nom de la prestation.'); return; }

    var list = store('dabanet_prestations');
    list.push({
      id: 'pres-' + Date.now(),
      nom: nom,
      description: desc,
      conseiller: cons || 'Conseiller ANAPEC',
      duree: duree || '45 min',
      modalite: modalite || 'Présentiel ou Visioconférence',
      statut: 'active',
      createdAt: new Date().toISOString()
    });

    save('dabanet_prestations', list);
    document.getElementById('prNom').value = '';
    document.getElementById('prDesc').value = '';
    window.renderPrestations();
    window.updateBiDashboard();
    alert('Prestation enregistrée avec succès.');
  };

  window.togglePrestationStatus = function(id) {
    var list = store('dabanet_prestations');
    var p = list.find(function(x){ return x.id === id; });
    if (p) {
      p.statut = p.statut === 'active' ? 'desactivee' : 'active';
      save('dabanet_prestations', list);
      window.renderPrestations();
      window.updateBiDashboard();
    }
  };

  window.supprimerPrestation = function(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette prestation ?')) return;
    var list = store('dabanet_prestations').filter(function(x){ return x.id !== id; });
    save('dabanet_prestations', list);
    window.renderPrestations();
    window.updateBiDashboard();
  };

  /* ══════════ Événements (Menu 3) ══════════ */
  window.renderEvenements = function() {
    var list = store('dabanet_evenements');
    var el = document.getElementById('cEvenementsTable');
    if (!el) return;

    if (!list || !list.length) {
      el.innerHTML = '<div class="empty">Aucun événement programmé.</div>';
      return;
    }

    var html = '<table class="resp-table"><thead><tr>' +
      '<th>Événement</th><th>Date & Lieu</th><th>Intervenants & Partenaires</th><th>Capacité</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    list.forEach(function(ev){
      var isPub = ev.statut === 'publié';
      var badge = isPub ? '<span class="badge accepted">Publié</span>' : '<span class="badge pending">Brouillon</span>';
      html += '<tr>' +
        '<td data-label="Événement"><b>' + esc(ev.titre) + '</b><br><small style="color:var(--muted);">' + esc(ev.description || '') + '</small></td>' +
        '<td data-label="Date">' + esc(ev.date) + ' (' + esc(ev.heure || '') + ')<br><small style="color:var(--muted);">' + esc(ev.lieu || 'UCA') + '</small></td>' +
        '<td data-label="Intervenants"><small><b>Invités :</b> ' + esc(ev.intervenants || '—') + '<br><b>Partenaires :</b> ' + esc(ev.partenaires || 'ANAPEC, UCA') + '</small></td>' +
        '<td data-label="Participants">' + (ev.participantsInscrits || 0) + ' / ' + (ev.participantsMax || 100) + '</td>' +
        '<td data-label="Statut">' + badge + '</td>' +
        '<td data-label="Actions">' +
          '<button class="act ' + (isPub ? 'no' : 'ok') + '" onclick="toggleEvenementStatus(' + ev.id + ')">' + (isPub ? 'Dépublier' : 'Publier') + '</button>' +
          '<button class="act trash" onclick="supprimerEvenement(' + ev.id + ')">Supprimer</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  };

  window.ajouterEvenement = function() {
    var titre = (document.getElementById('evTitre')?.value || '').trim();
    var date = (document.getElementById('evDate')?.value || '').trim();
    var heure = (document.getElementById('evHeure')?.value || '').trim();
    var lieu = (document.getElementById('evLieu')?.value || '').trim();
    var desc = (document.getElementById('evDesc')?.value || '').trim();
    var interv = (document.getElementById('evInterv')?.value || '').trim();
    var part = (document.getElementById('evPart')?.value || '').trim();
    var places = Number(document.getElementById('evPlaces')?.value) || 100;

    if (!titre || !date) { alert('Le titre et la date sont requis.'); return; }

    var list = store('dabanet_evenements');
    list.push({
      id: Date.now(),
      titre: titre,
      date: date,
      heure: heure || '09:00 - 17:00',
      lieu: lieu || 'Campus Université Cadi Ayyad',
      description: desc,
      intervenants: interv,
      partenaires: part,
      participantsMax: places,
      participantsInscrits: 0,
      statut: 'publié',
      createdAt: new Date().toISOString()
    });

    save('dabanet_evenements', list);
    document.getElementById('evTitre').value = '';
    document.getElementById('evDesc').value = '';
    window.renderEvenements();
    window.updateBiDashboard();
    alert('Événement publié avec succès.');
  };

  window.toggleEvenementStatus = function(id) {
    var list = store('dabanet_evenements');
    var ev = list.find(function(x){ return x.id === id; });
    if (ev) {
      ev.statut = ev.statut === 'publié' ? 'brouillon' : 'publié';
      save('dabanet_evenements', list);
      window.renderEvenements();
      window.updateBiDashboard();
    }
  };

  window.supprimerEvenement = function(id) {
    if (!confirm('Supprimer cet événement ?')) return;
    var list = store('dabanet_evenements').filter(function(x){ return x.id !== id; });
    save('dabanet_evenements', list);
    window.renderEvenements();
    window.updateBiDashboard();
  };

  /* ══════════ Publications (Menu 3) ══════════ */
  window.renderPublications = function() {
    var list = store('dabanet_publications');
    var el = document.getElementById('cPubsTable');
    if (!el) return;

    if (!list || !list.length) {
      el.innerHTML = '<div class="empty">Aucune publication pour le moment.</div>';
      return;
    }

    var html = '<table class="resp-table"><thead><tr>' +
      '<th>Titre & Catégorie</th><th>Contenu</th><th>Date</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    list.forEach(function(pub){
      var isPub = pub.statut === 'publié';
      var badge = isPub ? '<span class="badge accepted">Publié</span>' : '<span class="badge pending">Brouillon</span>';
      html += '<tr>' +
        '<td data-label="Titre"><b>' + esc(pub.titre) + '</b><br><span class="badge" style="background:#FAF3FB;color:var(--purple-700);">' + esc(pub.categorie || 'Actualité') + '</span></td>' +
        '<td data-label="Contenu"><small>' + esc(pub.texte || '') + '</small></td>' +
        '<td data-label="Date">' + esc(pub.datePublication || pub.createdAt?.split('T')[0] || '—') + '</td>' +
        '<td data-label="Statut">' + badge + '</td>' +
        '<td data-label="Actions">' +
          '<button class="act ' + (isPub ? 'no' : 'ok') + '" onclick="togglePublicationStatus(' + pub.id + ')">' + (isPub ? 'Dépublier' : 'Publier') + '</button>' +
          '<button class="act trash" onclick="supprimerPublication(' + pub.id + ')">Supprimer</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  };

  window.ajouterPublication = function() {
    var titre = (document.getElementById('pubTitre')?.value || '').trim();
    var cat = (document.getElementById('pubCat')?.value || 'Actualité').trim();
    var texte = (document.getElementById('pubTexte')?.value || '').trim();
    var datePub = (document.getElementById('pubDate')?.value || '').trim();

    if (!titre || !texte) { alert('Veuillez renseigner le titre et le contenu.'); return; }

    var list = store('dabanet_publications');
    list.push({
      id: Date.now(),
      titre: titre,
      categorie: cat,
      texte: texte,
      datePublication: datePub || new Date().toISOString().split('T')[0],
      statut: 'publié',
      createdAt: new Date().toISOString()
    });

    save('dabanet_publications', list);
    document.getElementById('pubTitre').value = '';
    document.getElementById('pubTexte').value = '';
    window.renderPublications();
    window.updateBiDashboard();
    alert('Publication enregistrée et publiée avec succès.');
  };

  window.togglePublicationStatus = function(id) {
    var list = store('dabanet_publications');
    var p = list.find(function(x){ return x.id === id; });
    if (p) {
      p.statut = p.statut === 'publié' ? 'brouillon' : 'publié';
      save('dabanet_publications', list);
      window.renderPublications();
      window.updateBiDashboard();
    }
  };

  window.supprimerPublication = function(id) {
    if (!confirm('Supprimer cette publication ?')) return;
    var list = store('dabanet_publications').filter(function(x){ return x.id !== id; });
    save('dabanet_publications', list);
    window.renderPublications();
    window.updateBiDashboard();
  };

})();
