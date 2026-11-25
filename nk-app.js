// Nebenkostenabrechnung – Stammdaten (Objekte, Einheiten, Status, Mietverhältnisse, Zähler, Soll-Liste)
// Wird von nebenkosten.html nach erfolgreicher Anmeldung gestartet: NK.start(sb, profil)

window.NK = (function(){
  let sb, profil, root;
  const isAdmin = () => profil && profil.rolle === 'admin';

  // ---------- Hilfsfunktionen ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Komma = Dezimaltrenner (Punkte davor sind Tausenderpunkte). Ohne Komma gilt ein Punkt als Dezimaltrenner („72.5“).
  const num = (v) => { if(v === '' || v == null) return null; let t = String(v).replace(/\s/g,''); t = t.includes(',') ? t.replace(/\./g,'').replace(',','.') : t; const n = Number(t); return t !== '' && isFinite(n) ? n : NaN; };
  const fmtNum = (n, d=2) => n == null ? '' : Number(n).toLocaleString('de-DE', {minimumFractionDigits:d, maximumFractionDigits:d});
  const fmtArea = (n) => n == null ? '–' : fmtNum(n) + ' m²';
  const fmtDate = (d) => d ? d.split('-').reverse().join('.') : '';
  const today = () => new Date().toISOString().slice(0,10);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };

  const ART = { wohnung:'Wohnung', gewerbe:'Gewerbe' };
  const STATUS = { selbst_genutzt:'Selbst genutzt', vermietet:'Vermietet', leer:'Leer' };
  const ZAEHLER = { strom:'Strom', kaltwasser:'Kaltwasser', warmwasser:'Warmwasser', heizung:'Heizung / Wärme', gas:'Gas', sonstiges:'Sonstiges' };
  const SCHLUESSEL = { flaeche:'nach Fläche', verbrauch:'nach Verbrauch', einheiten:'nach Einheiten', direkt:'direkt zugeordnet' };
  const DIFF = { flaeche:'nach Fläche', verbrauch:'nach Verbrauch', einheiten:'nach Einheiten' };

  async function q(promise){
    const { data, error } = await promise;
    if(error){ throw new Error(fehlertext(error)); }
    return data;
  }
  function fehlertext(error){
    const m = (error && error.message) || String(error);
    if(/fetch|network/i.test(m)) return 'Keine Verbindung zum Server. Bitte Internet prüfen.';
    if(/row-level security|permission/i.test(m)) return 'Dafür fehlt die Berechtigung.';
    if(/duplicate key|unique/i.test(m)) return 'Für dieses Datum gibt es schon einen Eintrag.';
    return m;
  }
  function toast(text, err){
    let t = document.getElementById('nkToast');
    if(!t){ t = document.createElement('div'); t.id = 'nkToast'; document.body.appendChild(t); }
    t.textContent = text; t.className = err ? 'show err' : 'show';
    clearTimeout(t._h); t._h = setTimeout(()=> t.className = '', err ? 5000 : 2200);
  }

  // Status zum Stichtag: letzter Eintrag mit gueltig_ab <= Datum
  function statusAm(statusListe, datum){
    let s = null;
    for(const e of statusListe){ if(e.gueltig_ab <= datum && (!s || e.gueltig_ab > s.gueltig_ab)) s = e; }
    return s;
  }
  const mvAktiv = (mv, datum) => mv.beginn <= datum && (!mv.ende || mv.ende >= datum);

  // ---------- Formular-Blatt ----------
  // fields: [{name,label,type,options,hint,required,showIf:(werte)=>bool}]
  function sheet({ title, fields, values = {}, onSave, onDelete, saveLabel = 'Speichern', intro }){
    const dlg = document.createElement('div');
    dlg.className = 'sheet-bg';
    dlg.innerHTML = `<form class="sheet" novalidate>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="x" aria-label="Schließen">×</button></div>
      ${intro ? `<p class="intro">${intro}</p>` : ''}
      <div class="fields"></div>
      <div class="msg"></div>
      <button class="btn" type="submit">${esc(saveLabel)}</button>
      ${onDelete ? '<button class="btn btn-del" type="button" data-del>Löschen</button>' : ''}
    </form>`;
    const form = dlg.querySelector('form');
    const box = dlg.querySelector('.fields');
    for(const f of fields){
      const v = values[f.name];
      const id = 'f_' + f.name;
      const w = document.createElement('div');
      w.className = 'field'; w.dataset.name = f.name;
      if(f.type === 'checkbox'){
        w.innerHTML = `<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
      } else if(f.type === 'select'){
        w.innerHTML = `<label for="${id}">${esc(f.label)}</label><select id="${id}" name="${f.name}">` +
          Object.entries(f.options).map(([k,l]) => `<option value="${esc(k)}" ${String(v ?? f.default ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('') + '</select>';
      } else if(f.type === 'textarea'){
        w.innerHTML = `<label for="${id}">${esc(f.label)}</label><textarea id="${id}" name="${f.name}" rows="3">${esc(v)}</textarea>`;
      } else if(f.type === 'file'){
        w.innerHTML = `<label for="${id}">${esc(f.label)}</label><input type="file" id="${id}" name="${f.name}" accept="${esc(f.accept || '')}">`;
      } else {
        const t = f.type === 'number' ? 'text' : (f.type || 'text');
        const val = f.type === 'number' ? (v == null ? '' : fmtNum(v, f.decimals ?? 2).replace(/\./g,'')) : (v ?? '');
        w.innerHTML = `<label for="${id}">${esc(f.label)}</label><input id="${id}" name="${f.name}" type="${t}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(val)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
      }
      if(f.hint) w.insertAdjacentHTML('beforeend', `<div class="hint-s">${f.hint}</div>`);
      box.appendChild(w);
    }
    function read(){
      const out = {};
      for(const f of fields){
        const el = form.elements[f.name];
        if(f.type === 'checkbox') out[f.name] = el.checked;
        else if(f.type === 'file') out[f.name] = el.files && el.files[0] || null;
        else if(f.type === 'number') out[f.name] = num(el.value.trim());
        else if(f.type === 'date') out[f.name] = el.value || null;
        else out[f.name] = el.value.trim();
      }
      return out;
    }
    function updateVisibility(){
      const cur = read();
      for(const f of fields){ if(f.showIf) box.querySelector(`[data-name="${f.name}"]`).classList.toggle('hidden', !f.showIf(cur)); }
    }
    form.addEventListener('input', updateVisibility); form.addEventListener('change', updateVisibility);
    updateVisibility();
    const close = () => dlg.remove();
    dlg.querySelector('.x').onclick = close;
    dlg.addEventListener('click', e => { if(e.target === dlg) close(); });
    const msg = dlg.querySelector('.msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.textContent = '';
      const data = read();
      for(const f of fields){
        const hidden = f.showIf && !f.showIf(data);
        if(hidden) { if(f.type === 'number' || f.type === 'date') data[f.name] = null; continue; }
        if(f.required && (data[f.name] === '' || data[f.name] == null)){ msg.textContent = `Bitte „${f.label}“ ausfüllen.`; return; }
        if(f.type === 'number' && Number.isNaN(data[f.name])){ msg.textContent = `„${f.label}“ ist keine gültige Zahl.`; return; }
      }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try{ await onSave(data); close(); toast('Gespeichert ✓'); route(); }
      catch(err){ msg.textContent = err.message; }
      finally{ btn.disabled = false; }
    });
    if(onDelete){
      dlg.querySelector('[data-del]').onclick = async () => {
        if(!confirm('Wirklich löschen? Das kann nicht rückgängig gemacht werden.')) return;
        try{ await onDelete(); close(); toast('Gelöscht'); route(); }
        catch(err){ msg.textContent = err.message; }
      };
    }
    document.body.appendChild(dlg);
    const first = box.querySelector('input:not([type=checkbox]):not([type=file]), select, textarea');
    if(first && !('ontouchstart' in window)) first.focus();
  }

  // ---------- Ansicht: Objektliste ----------
  async function viewListe(){
    const [objekte, einheiten] = await Promise.all([
      q(sb.from('objekte').select('*').order('name')),
      q(sb.from('einheiten').select('id, objekt_id, flaeche'))
    ]);
    let html = `<div class="bar"><h2 class="h">Objekte</h2>${''}<button class="btn-s" data-act="neuObjekt">+ Objekt</button></div>`;
    if(!objekte.length) html += `<div class="card"><p>Noch keine Objekte angelegt.</p></div>`;
    for(const o of objekte){
      const eh = einheiten.filter(e => e.objekt_id === o.id);
      const fl = eh.reduce((s,e) => s + (Number(e.flaeche) || 0), 0);
      const fehlt = eh.some(e => e.flaeche == null);
      html += `<a class="card tap" href="#/objekt/${o.id}">
        <h3>${esc(o.name)}</h3>
        <p class="sub">${esc([o.strasse !== o.name ? o.strasse : '', [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—')}</p>
        <p class="meta">${eh.length} ${eh.length === 1 ? 'Einheit' : 'Einheiten'} · ${fl ? fmtArea(fl) : 'Fläche fehlt'}${fehlt && fl ? ' <span class="warn">· Flächen unvollständig</span>' : ''}</p>
      </a>`;
    }
    root.innerHTML = html;
    root.querySelector('[data-act=neuObjekt]').onclick = () => formObjekt();
  }

  function formObjekt(o){
    sheet({
      title: o ? 'Objekt bearbeiten' : 'Neues Objekt',
      values: o || { differenz_regel: 'flaeche' },
      fields: [
        { name:'name', label:'Name', required:true, placeholder:'z. B. Rheinstraße 14' },
        { name:'strasse', label:'Straße und Hausnummer' },
        { name:'plz', label:'PLZ' },
        { name:'ort', label:'Ort' },
        { name:'differenz_regel', label:'Differenz Hauptzähler zu Einzelzählern verteilen', type:'select', options: DIFF,
          hint:'Standard: nach Fläche. Nur ändern, wenn es für dieses Gebäude anders vereinbart ist.' },
        { name:'notiz', label:'Notiz', type:'textarea' }
      ],
      onSave: async (d) => {
        if(o) await q(sb.from('objekte').update(d).eq('id', o.id));
        else { const r = await q(sb.from('objekte').insert(d).select('id').single()); location.hash = '#/objekt/' + r.id; }
      },
      onDelete: o && isAdmin() ? async () => { await q(sb.from('objekte').delete().eq('id', o.id)); location.hash = '#/'; } : null
    });
  }

  // ---------- Ansicht: Objekt ----------
  async function viewObjekt(id){
    const [o, einheiten, zaehler, kostenarten, soll] = await Promise.all([
      q(sb.from('objekte').select('*').eq('id', id).single()),
      q(sb.from('einheiten').select('*').eq('objekt_id', id).order('sortierung').order('bezeichnung')),
      q(sb.from('zaehler').select('*').eq('objekt_id', id).order('art')),
      q(sb.from('kostenarten').select('*').order('sortierung')),
      q(sb.from('objekt_kostenarten').select('*').eq('objekt_id', id))
    ]);
    const ids = einheiten.map(e => e.id);
    const [status, mvs] = ids.length ? await Promise.all([
      q(sb.from('einheit_status').select('*').in('einheit_id', ids)),
      q(sb.from('mietverhaeltnisse').select('*').in('einheit_id', ids))
    ]) : [[], []];
    const heute = today();
    const flaeche = einheiten.reduce((s,e) => s + (Number(e.flaeche) || 0), 0);

    let html = `<a class="back" href="#/">‹ Alle Objekte</a>
      <div class="card">
        <div class="bar"><h2 class="h">${esc(o.name)}</h2><button class="btn-s" data-act="editObjekt">Bearbeiten</button></div>
        <p class="sub">${esc([o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</p>
        <dl class="kv">
          <dt>Gesamtfläche</dt><dd>${flaeche ? fmtArea(flaeche) : '<span class="warn">fehlt</span>'} <span class="muted">(Summe der Einheiten)</span></dd>
          <dt>Differenz Hauptzähler</dt><dd>${DIFF[o.differenz_regel]}</dd>
        </dl>
        ${o.notiz ? `<p class="note">${esc(o.notiz)}</p>` : ''}
      </div>`;

    // Einheiten
    html += `<div class="bar"><h3 class="h">Einheiten</h3><button class="btn-s" data-act="neueEinheit">+ Einheit</button></div>`;
    if(!einheiten.length) html += `<div class="card"><p>Noch keine Einheiten.</p></div>`;
    for(const e of einheiten){
      const st = statusAm(status.filter(s => s.einheit_id === e.id), heute);
      const mv = mvs.find(m => m.einheit_id === e.id && mvAktiv(m, heute));
      const anteil = flaeche && e.flaeche != null ? ' · ' + fmtNum(e.flaeche / flaeche * 100, 1) + ' %' : '';
      html += `<a class="card tap" href="#/einheit/${e.id}">
        <h3>${esc(e.bezeichnung)} <span class="tag">${ART[e.art]}</span></h3>
        <p class="meta">${e.flaeche == null ? '<span class="warn">Fläche fehlt</span>' : fmtArea(e.flaeche) + anteil}
          · ${st ? STATUS[st.status] : '<span class="warn">Status fehlt</span>'}${mv ? ' · ' + esc(mv.mieter_name) : ''}</p>
      </a>`;
    }

    // Hauptzähler
    const haupt = zaehler.filter(z => !z.einheit_id);
    html += `<div class="bar"><h3 class="h">Hauptzähler des Gebäudes</h3><button class="btn-s" data-act="neuHaupt">+ Zähler</button></div>`;
    html += haupt.length ? `<div class="card list">${haupt.map(z => zaehlerZeile(z)).join('')}</div>` : `<div class="card"><p>Keine Hauptzähler erfasst.</p></div>`;

    // Soll-Liste
    const aktiv = soll.length;
    html += `<div class="bar"><h3 class="h">Kostenarten (Soll-Liste)</h3><span class="muted">${aktiv} aktiv</span></div>
      <div class="card list"><p class="intro">Hier festlegen, welche Kosten für dieses Gebäude jedes Jahr anfallen und wie sie verteilt werden. Die App meldet später fehlende Belege anhand dieser Liste.</p>`;
    for(const k of kostenarten){
      const s = soll.find(x => x.kostenart_id === k.id);
      html += `<button class="row-btn" data-ka="${k.id}">
        <span class="chk ${s ? 'on' : ''}">${s ? '✓' : ''}</span>
        <span class="grow">${esc(k.bezeichnung)}${s ? `<small>${SCHLUESSEL[s.umlageschluessel]}${s.verbrauchsanteil != null && s.umlageschluessel !== 'direkt' && k.ist_heizung_ww ? ` (${s.verbrauchsanteil} % Verbrauch)` : ''}</small>` : ''}</span>
      </button>`;
    }
    html += `</div>`;
    root.innerHTML = html;

    root.querySelector('[data-act=editObjekt]').onclick = () => formObjekt(o);
    root.querySelector('[data-act=neueEinheit]').onclick = () => formEinheit(null, o.id, einheiten.length + 1);
    root.querySelector('[data-act=neuHaupt]').onclick = () => formZaehler(null, o.id, null);
    root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => formZaehler(haupt.find(z => z.id === b.dataset.z), o.id, null));
    root.querySelectorAll('[data-ka]').forEach(b => b.onclick = () => {
      const k = kostenarten.find(x => x.id === b.dataset.ka);
      formKostenart(o.id, k, soll.find(x => x.kostenart_id === k.id));
    });
  }

  function formKostenart(objektId, k, s){
    const fields = [
      { name:'aktiv', label:'Fällt bei diesem Gebäude an', type:'checkbox' },
      { name:'umlageschluessel', label:'Verteilung', type:'select', options: SCHLUESSEL, showIf: d => d.aktiv },
    ];
    if(k.ist_heizung_ww) fields.push({ name:'verbrauchsanteil', label:'Anteil nach Verbrauch in %', type:'number', decimals:0,
      showIf: d => d.aktiv && d.umlageschluessel !== 'direkt',
      hint:'Heizkostenverordnung: mindestens 50 %, höchstens 70 %. Der Rest wird nach Fläche verteilt.' });
    fields.push({ name:'notiz', label:'Notiz', type:'textarea', showIf: d => d.aktiv });
    sheet({
      title: k.bezeichnung,
      values: s ? { ...s, aktiv: true } : { aktiv: true, umlageschluessel: k.ist_heizung_ww ? 'verbrauch' : 'flaeche', verbrauchsanteil: k.ist_heizung_ww ? 70 : null },
      fields,
      onSave: async (d) => {
        if(!d.aktiv){ if(s) await q(sb.from('objekt_kostenarten').delete().eq('objekt_id', objektId).eq('kostenart_id', k.id)); return; }
        if(k.ist_heizung_ww && d.umlageschluessel !== 'direkt' && (d.verbrauchsanteil == null || d.verbrauchsanteil < 50 || d.verbrauchsanteil > 70))
          throw new Error('Bei Heizung/Warmwasser müssen 50 bis 70 % nach Verbrauch verteilt werden.');
        const row = { objekt_id: objektId, kostenart_id: k.id, umlageschluessel: d.umlageschluessel,
          verbrauchsanteil: k.ist_heizung_ww && d.umlageschluessel !== 'direkt' ? Math.round(d.verbrauchsanteil) : null, notiz: d.notiz || '' };
        await q(sb.from('objekt_kostenarten').upsert(row));
      }
    });
  }

  // ---------- Ansicht: Einheit ----------
  async function viewEinheit(id){
    const e = await q(sb.from('einheiten').select('*').eq('id', id).single());
    const [o, status, mvs, zaehler] = await Promise.all([
      q(sb.from('objekte').select('id, name').eq('id', e.objekt_id).single()),
      q(sb.from('einheit_status').select('*').eq('einheit_id', id).order('gueltig_ab', { ascending: false })),
      q(sb.from('mietverhaeltnisse').select('*').eq('einheit_id', id).order('beginn', { ascending: false })),
      q(sb.from('zaehler').select('*').eq('einheit_id', id).order('art'))
    ]);
    const heute = today();
    const aktStatus = statusAm(status, heute);
    const aktuell = mvs.filter(m => !m.ende || m.ende >= heute);
    const archiv = mvs.filter(m => m.ende && m.ende < heute);

    let html = `<a class="back" href="#/objekt/${o.id}">‹ ${esc(o.name)}</a>
      <div class="card">
        <div class="bar"><h2 class="h">${esc(e.bezeichnung)}</h2><button class="btn-s" data-act="editEinheit">Bearbeiten</button></div>
        <dl class="kv">
          <dt>Art</dt><dd>${ART[e.art]}</dd>
          <dt>Fläche</dt><dd>${e.flaeche == null ? '<span class="warn">fehlt</span>' : fmtArea(e.flaeche)}</dd>
          <dt>Status heute</dt><dd>${aktStatus ? STATUS[aktStatus.status] + ' seit ' + fmtDate(aktStatus.gueltig_ab) : '<span class="warn">nicht erfasst</span>'}</dd>
        </dl>
      </div>`;

    html += `<div class="bar"><h3 class="h">Mietverhältnisse</h3><button class="btn-s" data-act="neuMV">+ Mieter</button></div>`;
    html += aktuell.length ? aktuell.map(mvKarte).join('') : `<div class="card"><p>Kein aktuelles Mietverhältnis.</p></div>`;
    if(archiv.length) html += `<details class="archiv"><summary>Archiv (${archiv.length} frühere ${archiv.length === 1 ? 'Mieter' : 'Mieter'})</summary>${archiv.map(mvKarte).join('')}</details>`;

    html += `<div class="bar"><h3 class="h">Zähler</h3><button class="btn-s" data-act="neuZ">+ Zähler</button></div>`;
    html += zaehler.length ? `<div class="card list">${zaehler.map(z => zaehlerZeile(z)).join('')}</div>` : `<div class="card"><p>Keine Zähler erfasst.</p></div>`;

    html += `<div class="bar"><h3 class="h">Status-Verlauf</h3><button class="btn-s" data-act="neuStatus">+ Änderung</button></div>
      <div class="card list"><p class="intro">Wichtig für die zeitanteilige Abrechnung, z. B. „selbst genutzt bis …“, danach „vermietet ab …“. Leerstand und Eigennutzung tragen ihren Kostenanteil selbst.</p>
      ${status.length ? status.map(s => `<button class="row-btn" data-st="${s.id}"><span class="grow">ab ${fmtDate(s.gueltig_ab)}: <b>${STATUS[s.status]}</b>${s.notiz ? `<small>${esc(s.notiz)}</small>` : ''}</span><span class="muted">›</span></button>`).join('') : '<p>Noch kein Status erfasst.</p>'}</div>`;
    root.innerHTML = html;

    root.querySelector('[data-act=editEinheit]').onclick = () => formEinheit(e, e.objekt_id);
    root.querySelector('[data-act=neuMV]').onclick = () => formMV(null, e);
    root.querySelector('[data-act=neuZ]').onclick = () => formZaehler(null, e.objekt_id, e.id);
    root.querySelector('[data-act=neuStatus]').onclick = () => formStatus(null, e.id);
    root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => formZaehler(zaehler.find(z => z.id === b.dataset.z), e.objekt_id, e.id));
    root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => formStatus(status.find(s => s.id === b.dataset.st), e.id));
    root.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => formMV(mvs.find(m => m.id === b.dataset.mv), e));
    root.querySelectorAll('[data-vertrag]').forEach(b => b.onclick = async (ev) => {
      ev.stopPropagation();
      try{
        const r = await q(sb.storage.from('dokumente').createSignedUrl(b.dataset.vertrag, 300));
        window.open(r.signedUrl, '_blank');
      }catch(err){ toast(err.message, true); }
    });
  }

  function mvKarte(m){
    return `<div class="card">
      <div class="bar"><h3>${esc(m.mieter_name)}</h3><button class="btn-s" data-mv="${m.id}">Bearbeiten</button></div>
      <p class="meta">${fmtDate(m.beginn)} – ${m.ende ? fmtDate(m.ende) : 'unbefristet'}</p>
      ${m.mieter_email || m.mieter_telefon ? `<p class="meta">${esc([m.mieter_email, m.mieter_telefon].filter(Boolean).join(' · '))}</p>` : ''}
      ${m.vertrag_pfad ? `<button class="link-btn" data-vertrag="${esc(m.vertrag_pfad)}">Mietvertrag öffnen</button>` : '<p class="meta warn">Mietvertrag nicht hochgeladen</p>'}
      ${m.notiz ? `<p class="note">${esc(m.notiz)}</p>` : ''}
    </div>`;
  }

  function zaehlerZeile(z){
    const extra = z.eigene_abrechnung
      ? `<small>Eigene Abrechnung (Unterzähler) · ${z.kwh_preis != null ? fmtNum(z.kwh_preis, 4) + ' €/kWh' : 'kWh-Preis fehlt'} · Grundgebühr ${z.grundgebuehr_monat != null ? fmtNum(z.grundgebuehr_monat) + ' €/Monat' : 'fehlt'} · Abschlag ${z.abschlag_monat != null ? fmtNum(z.abschlag_monat) + ' €/Monat' : 'fehlt'}</small>`
      : '';
    return `<button class="row-btn" data-z="${z.id}">
      <span class="grow"><b>${ZAEHLER[z.art]}</b>${z.bezeichnung ? ' – ' + esc(z.bezeichnung) : ''}${!z.aktiv ? ' <span class="tag">ausgebaut</span>' : ''}
        <small>Nr. ${z.zaehlernummer ? esc(z.zaehlernummer) : '<span class="warn">fehlt</span>'}</small>${extra}</span>
      <span class="muted">›</span></button>`;
  }

  function formEinheit(e, objektId, sortierung){
    sheet({
      title: e ? 'Einheit bearbeiten' : 'Neue Einheit',
      values: e || { art: 'wohnung', sortierung },
      fields: [
        { name:'bezeichnung', label:'Bezeichnung', required:true, placeholder:'z. B. OG, Wohnung 1, Büro 2' },
        { name:'art', label:'Art', type:'select', options: ART },
        { name:'flaeche', label:'Fläche in m²', type:'number', hint:'Wohn- bzw. Nutzfläche laut Wohnflächenberechnung.' },
        { name:'sortierung', label:'Reihenfolge', type:'number', decimals:0 }
      ],
      onSave: async (d) => {
        d.sortierung = d.sortierung == null ? 0 : Math.round(d.sortierung);
        if(e) await q(sb.from('einheiten').update(d).eq('id', e.id));
        else await q(sb.from('einheiten').insert({ ...d, objekt_id: objektId }));
      },
      onDelete: e && isAdmin() ? async () => { await q(sb.from('einheiten').delete().eq('id', e.id)); location.hash = '#/objekt/' + objektId; } : null
    });
  }

  function formStatus(s, einheitId){
    sheet({
      title: s ? 'Status bearbeiten' : 'Statusänderung',
      values: s || { status: 'vermietet', gueltig_ab: today() },
      fields: [
        { name:'status', label:'Status', type:'select', options: STATUS },
        { name:'gueltig_ab', label:'Gültig ab', type:'date', required:true },
        { name:'notiz', label:'Notiz', placeholder:'z. B. Vermietung an GmbH nach Umfirmierung' }
      ],
      onSave: async (d) => {
        if(s) await q(sb.from('einheit_status').update(d).eq('id', s.id));
        else await q(sb.from('einheit_status').insert({ ...d, einheit_id: einheitId }));
      },
      onDelete: s && isAdmin() ? async () => q(sb.from('einheit_status').delete().eq('id', s.id)) : null
    });
  }

  function formMV(m, e){
    sheet({
      title: m ? 'Mietverhältnis bearbeiten' : 'Neues Mietverhältnis',
      intro: m ? '' : 'Beginn und Ende bitte genau so eintragen, wie sie im Mietvertrag stehen. Der Status der Einheit wird automatisch angepasst.',
      values: m || {},
      fields: [
        { name:'mieter_name', label:'Mieter (Name)', required:true },
        { name:'mieter_email', label:'E-Mail', type:'email' },
        { name:'mieter_telefon', label:'Telefon', type:'tel' },
        { name:'beginn', label:'Mietbeginn laut Vertrag', type:'date', required:true },
        { name:'ende', label:'Mietende (leer = unbefristet / läuft)', type:'date' },
        { name:'vertrag', label: m && m.vertrag_pfad ? 'Mietvertrag ersetzen (PDF oder Foto)' : 'Mietvertrag (PDF oder Foto)', type:'file', accept:'application/pdf,image/*' },
        { name:'notiz', label:'Notiz', type:'textarea' }
      ],
      onSave: async (d) => {
        if(d.ende && d.ende < d.beginn) throw new Error('Das Mietende liegt vor dem Beginn.');
        const datei = d.vertrag; delete d.vertrag;
        let id = m && m.id;
        if(m) await q(sb.from('mietverhaeltnisse').update(d).eq('id', id));
        else id = (await q(sb.from('mietverhaeltnisse').insert({ ...d, einheit_id: e.id }).select('id').single())).id;
        if(datei){
          const endung = (datei.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g,'');
          const pfad = `mietvertraege/${e.id}/${id}.${endung}`;
          await q(sb.storage.from('dokumente').upload(pfad, datei, { upsert: true, contentType: datei.type || undefined }));
          await q(sb.from('mietverhaeltnisse').update({ vertrag_pfad: pfad }).eq('id', id));
        }
        if(!m){
          // Status automatisch: vermietet ab Beginn, leer ab Tag nach Ende (vorhandene Einträge bleiben)
          const rows = [{ einheit_id: e.id, status: 'vermietet', gueltig_ab: d.beginn, notiz: d.mieter_name }];
          if(d.ende) rows.push({ einheit_id: e.id, status: 'leer', gueltig_ab: addDays(d.ende, 1), notiz: 'Auszug ' + d.mieter_name });
          await q(sb.from('einheit_status').upsert(rows, { onConflict: 'einheit_id,gueltig_ab', ignoreDuplicates: true }));
        }
      },
      onDelete: m && isAdmin() ? async () => {
        if(m.vertrag_pfad) await sb.storage.from('dokumente').remove([m.vertrag_pfad]);
        await q(sb.from('mietverhaeltnisse').delete().eq('id', m.id));
      } : null
    });
  }

  function formZaehler(z, objektId, einheitId){
    sheet({
      title: z ? 'Zähler bearbeiten' : (einheitId ? 'Neuer Zähler' : 'Neuer Hauptzähler'),
      values: z || { art: 'strom', aktiv: true },
      fields: [
        { name:'art', label:'Art', type:'select', options: ZAEHLER },
        { name:'zaehlernummer', label:'Zählernummer' },
        { name:'bezeichnung', label:'Bezeichnung (optional)', placeholder:'z. B. Keller, Allgemeinstrom' },
        { name:'eigene_abrechnung', label:'Eigene Abrechnung (privater Unterzähler)', type:'checkbox', showIf: d => d.art === 'strom',
          hint:'Wird nicht in der Nebenkostenabrechnung verteilt, sondern als eigenes Dokument abgerechnet.' },
        { name:'kwh_preis', label:'Preis pro kWh in €', type:'number', decimals:4, showIf: d => d.art === 'strom' && d.eigene_abrechnung },
        { name:'grundgebuehr_monat', label:'Grundgebühr pro Monat in €', type:'number', showIf: d => d.art === 'strom' && d.eigene_abrechnung },
        { name:'abschlag_monat', label:'Abschlag pro Monat in €', type:'number', showIf: d => d.art === 'strom' && d.eigene_abrechnung },
        { name:'aktiv', label:'Zähler ist eingebaut', type:'checkbox' }
      ],
      onSave: async (d) => {
        if(d.art !== 'strom') d.eigene_abrechnung = false;
        if(z) await q(sb.from('zaehler').update(d).eq('id', z.id));
        else await q(sb.from('zaehler').insert({ ...d, objekt_id: objektId, einheit_id: einheitId }));
      },
      onDelete: z && isAdmin() ? async () => q(sb.from('zaehler').delete().eq('id', z.id)) : null
    });
  }

  // ---------- Router ----------
  async function route(){
    const h = location.hash.replace(/^#/, '') || '/';
    const m = h.match(/^\/(objekt|einheit)\/([0-9a-f-]{36})$/);
    root.innerHTML = '<p class="muted center">Lädt …</p>';
    try{
      if(m && m[1] === 'objekt') await viewObjekt(m[2]);
      else if(m && m[1] === 'einheit') await viewEinheit(m[2]);
      else await viewListe();
      window.scrollTo(0, 0);
    }catch(err){
      root.innerHTML = `<div class="card"><p class="warn">${esc(err.message)}</p><button class="btn btn-line" onclick="location.reload()">Neu laden</button></div>`;
    }
  }

  let started = false;
  return {
    start(client, prof, el){
      sb = client; profil = prof; root = el;
      if(/access_token|type=/.test(location.hash)) history.replaceState(null, '', location.pathname);
      if(!started){ window.addEventListener('hashchange', route); started = true; }
      route();
    },
    _intern: { statusAm, num, addDays }
  };
})();
