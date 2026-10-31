// Integraciones de salida: revisión editable y apertura tras confirmación explícita.
(() => {
  function create({ dialog, query, escape, openWindow }) {
    function preview(title, url, options = {}) {
      const target = new URL(url);
      dialog.innerHTML = '<h2>' + escape(title) + '</h2><p>Revisa la información que se abrirá en un servicio externo. Solo se compartirá si eliges continuar.</p>' +
        (options.kind === 'whatsapp'
          ? '<label for="externalText">Mensaje</label><textarea id="externalText" rows="8"></textarea>'
          : '<label for="externalTitle">Título del evento</label><input id="externalTitle" type="text"><label for="externalDetails">Detalles del evento</label><textarea id="externalDetails" rows="6"></textarea>') +
        '<div class="stack"><button type="button" class="btn" id="externalContinue">Continuar al servicio</button><button type="button" class="btn ghost" id="externalCancel">Cancelar</button></div>';
      if (options.kind === 'whatsapp') query('#externalText').value = options.text || '';
      else {
        query('#externalTitle').value = target.searchParams.get('text') || '';
        query('#externalDetails').value = target.searchParams.get('details') || '';
      }
      query('#externalCancel').onclick = () => dialog.close();
      query('#externalContinue').onclick = () => {
        if (options.kind === 'whatsapp') target.searchParams.set('text', query('#externalText').value);
        else {
          target.searchParams.set('text', query('#externalTitle').value);
          target.searchParams.set('details', query('#externalDetails').value);
        }
        dialog.close();
        openWindow(target.toString());
      };
      if (!dialog.open) dialog.showModal();
    }

    document.addEventListener('click', event => {
      const link = event.target.closest('a.btn.cal');
      if (!link) return;
      event.preventDefault();
      preview('Revisar evento de Google Calendar', link.href);
    });
    return preview;
  }

  window.AcompanaSharing = Object.freeze({ create });
})();
