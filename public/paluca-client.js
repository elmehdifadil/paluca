(function () {
  var originalFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    if(typeof url==='string'&&url.indexOf('/api/')===0){
      options=Object.assign({},options);var headers=new Headers(options.headers||{});
      var staff=/^\/(admin|dashboard|chercheurs|prestations|creneaux|rendez-vous|ateliers|evenements|bannieres|publications|inscriptions)(?:[/.]|$)/.test(location.pathname);
      headers.set('X-Paluca-Portal',staff?'staff':'candidate');options.headers=headers;
    }
    return originalFetch(url, options);
  };
  window.palApi = async function (path, body, method) {
    var options = body === undefined ? {} : {
      method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    };
    var response;
    for(var attempt=0;attempt<3;attempt++) {
      response=await fetch('/api/' + path, options);
      if(body!==undefined||![502,503,504].includes(response.status)||attempt===2)break;
      await response.text();
      await new Promise(function(resolve){setTimeout(resolve,300*(attempt+1));});
    }
    var data;
    try { data = await response.json(); } catch (_) { throw new Error('Service indisponible (HTTP ' + response.status + ').'); }
    if (!response.ok || data.success === false) throw new Error(data.error || 'Enregistrement impossible.');
    return data;
  };
  window.palLabels = { en_attente: 'En attente de fiabilisation', correction_demandee: 'Correction demandée', fiabilise: 'Fiabilisé' };
  window.palStatus = function (p) { return palLabels[p.fiabilisationStatut] || 'En attente de fiabilisation'; };
})();
