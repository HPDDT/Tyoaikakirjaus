// Työaikakirjaus – käyttöliittymä. Ei ulkoisia kirjastoja.
import { initAuth, login, logout, loadProfile, cachedProfile, queueEntry, queueDelete, flushOutbox, outbox, computeKm, HOME, LS, diagnostics as runDiagnostics } from './lib.js';

const MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
const WEEKDAYS = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'];
const WD_SHORT = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
const TITLES = ['Päivämäärä', 'Aloitusaika', 'Lopetusaika', 'Matkat', 'Yhteenveto ja tallennus'];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const range = (a, b, s = 1) => { const o = []; for (let i = a; i <= b; i += s) o.push(i); return o; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtH = (h) => (Math.round(h * 10) / 10).toFixed(1).replace('.', ',');
const fmtKm = (k) => String(Math.round(k * 10) / 10).replace('.', ',');
const minutesBetween = (sh, sm, eh, em) => { let v = eh * 60 + em - (sh * 60 + sm); return v < 0 ? v + 1440 : v; };
const durText = (min) => `${Math.floor(min / 60)} h ${min % 60} min`;
// Taulukossa tasatunnit lyhyesti: 8:00 -> 8, 7:30 pysyy
const shortTime = (t) => String(t || '').replace(/:00$/, '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7"/></svg>',
  sun: '<svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C1B19" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>',
  check: (s = 16, w = 2.5) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`,
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--muted)"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  work: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5h10v16"/><path d="M14 9h6v12"/><path d="M3 21h18M8 9h2M8 13h2M8 17h2"/></svg>',
};

// =====================================================================
// Rulla: numerot pyöreän rullan pinnalla, heitto ja loksahdus riville
// =====================================================================
const ROW = 60, HALF = ROW / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

class Wheel {
  constructor(el, { values, value, label, onChange }) {
    this.el = el; this.values = values; this.value = value; this.onChange = onChange;
    this.pos = 0; this.anim = null; this.drag = null; this.acc = 0;
    // Rullan korkeus tulee tyylistä (pienemmillä näytöillä matalampi); säde sen mukaan
    this.box = el.offsetHeight || 300;
    this.radius = this.box * 0.4667;
    el.setAttribute('role', 'slider'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', label);
    el.innerHTML = '<div class="band"></div>';
    this.rows = [];
    for (let k = 0; k < 7; k++) {
      const r = document.createElement('div'); r.className = 'row';
      r.appendChild(document.createElement('span'));
      el.appendChild(r); this.rows.push(r);
    }
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.moveEv(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this.stepRows(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.stepRows(1); }
    });
    this.draw();
  }
  index() { const i = this.values.findIndex((x) => x.v === this.value); return i < 0 ? 0 : i; }
  setValues(values, value) { this.values = values; this.value = value; this.draw(); }
  destroy() { if (this.anim) cancelAnimationFrame(this.anim.raf); this.anim = null; }
  draw() {
    const len = this.values.length, idx = this.index();
    for (let k = -3; k <= 3; k++) {
      const r = this.rows[k + 3];
      const i = (((idx + k) % len) + len) % len;
      const y = k * ROW + this.pos;
      const th = y / this.radius;
      const d = Math.abs(y) / ROW;
      r.firstChild.textContent = this.values[i].text;
      r.style.opacity = Math.abs(th) < Math.PI / 2 ? (0.2 + 0.8 * Math.cos(th)).toFixed(3) : '0';
      r.style.transform = `translateZ(-${this.radius.toFixed(1)}px) rotateX(${((-th * 180) / Math.PI).toFixed(2)}deg) translateZ(${this.radius.toFixed(1)}px)`;
      r.style.filter = `blur(${(Math.min(d, 2.5) * 0.9).toFixed(2)}px)`;
    }
    this.el.setAttribute('aria-valuetext', this.values[idx].text);
  }
  move(dy) {
    let o = this.pos + dy, n = 0;
    while (o > HALF) { o -= ROW; n--; }
    while (o < -HALF) { o += ROW; n++; }
    this.pos = o;
    if (n) {
      const len = this.values.length;
      const ni = (((this.index() + n) % len) + len) % len;
      this.value = this.values[ni].v;
      try { navigator.vibrate && navigator.vibrate(4); } catch (_) {}
      this.onChange(this.value);
    }
    this.draw();
  }
  stop() { if (this.anim) { cancelAnimationFrame(this.anim.raf); this.anim = null; } }
  animate(D, dur) {
    this.stop();
    if (Math.abs(D) < 0.5) { if (D) this.move(D); return; }
    const a = { D, done: 0, start: null, dur, raf: 0 };
    this.anim = a;
    const tick = (t) => {
      if (this.anim !== a) return;
      if (a.start === null) a.start = t;
      const p = Math.min(1, (t - a.start) / a.dur);
      const target = a.D * easeOut(p);
      const delta = target - a.done; a.done = target;
      this.move(delta);
      if (p < 1) a.raf = requestAnimationFrame(tick); else this.anim = null;
    };
    a.raf = requestAnimationFrame(tick);
  }
  stepRows(n) {
    const remaining = this.anim ? this.anim.D - this.anim.done : 0;
    let D = remaining - n * ROW;
    const end = this.pos + D;
    D += Math.round(end / ROW) * ROW - end;
    this.animate(D, 260 + Math.min(4, Math.abs(n)) * 40);
  }
  down(e) {
    this.stop();
    const r = this.el.getBoundingClientRect();
    this.drag = { y: e.clientY, startY: e.clientY, moved: false, scale: this.box / r.height, samples: [] };
    try { this.el.setPointerCapture(e.pointerId); } catch (_) {}
  }
  moveEv(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 4) return;
    d.moved = true;
    const now = performance.now();
    const dy = (e.clientY - d.y) * d.scale; d.y = e.clientY;
    d.samples.push({ t: now, dy });
    while (d.samples.length && now - d.samples[0].t > 90) d.samples.shift();
    this.move(dy);
  }
  up(e) {
    const d = this.drag; this.drag = null; if (!d) return;
    const o = this.pos;
    if (!d.moved) {
      if (e.type === 'pointercancel') return this.animate(-o, 180);
      const r = this.el.getBoundingClientRect();
      const row = Math.round(((e.clientY - r.top) * d.scale - this.box / 2 - o) / ROW);
      return row ? this.stepRows(row) : this.animate(-o, 160);
    }
    const now = performance.now();
    const first = d.samples.length ? d.samples[0].t : now;
    const sum = d.samples.reduce((s, x) => s + x.dy, 0);
    const vel = now - first > 120 ? 0 : sum / Math.max(16, now - first);
    const D = Math.round((o + vel * 220) / ROW) * ROW - o;
    this.animate(D, Math.max(180, Math.min(900, 180 + Math.abs(D) * 2.2)));
  }
  wheel(e) {
    e.preventDefault();
    this.acc += e.deltaY;
    if (Math.abs(this.acc) >= 40) { const n = Math.max(-3, Math.min(3, Math.trunc(this.acc / 40))); this.acc = 0; this.stepRows(n); }
  }
}

// =====================================================================
// Tila
// =====================================================================
const root = document.getElementById('root');
const app = { auth: { state: 'loading' }, profile: null, toastTimer: null, wheels: [] };
let dark = (() => {
  const saved = LS.get('tyoaika.dark', null);
  if (saved !== null) return saved;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
})();
function freshForm() {
  const n = new Date();
  return { step: 0, d: n.getDate(), m: n.getMonth() + 1, y: n.getFullYear(), sh: 8, sm: 0, eh: 16, em: 0,
    route: [], manualKm: '', allow: null, notes: '', saved: false, savedPending: false, confirm: false, history: false, delMode: false, delDate: null };
}
let S = freshForm();

function applyTheme() {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.getElementById('theme-color'); if (m) m.setAttribute('content', dark ? '#121110' : '#F2EFE8');
  const sw = root.querySelector('.switch'); if (sw) sw.setAttribute('aria-checked', dark ? 'true' : 'false');
}
applyTheme();

// Palvelimen kirjaukset + vielä lähettämättömät (lähettämätön korvaa saman päivän)
function entries() {
  const p = app.profile;
  const map = new Map((p.entries || []).map((e) => [e.date, e]));
  for (const q of outbox()) {
    if (q.delete) { map.delete(q.date); continue; }
    const [sh, sm] = q.start.split(':').map(Number);
    const [eh, em] = q.end.split(':').map(Number);
    const c = computeKm(q.route || [], p);
    map.set(q.date, { date: q.date, start: q.start, end: q.end, hours: minutesBetween(sh, sm, eh, em) / 60,
      km: Math.round((c.km + (q.manualKm || 0)) * 10) / 10, manualKm: q.manualKm || 0, route: q.route || [], allowance: q.allowance, notes: q.notes, pending: true });
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Jo kirjatulle päivälle haetaan aiemmat tiedot lomakkeelle (ajat, reitti, muu ajo, päiväraha, lisätiedot).
// Jos käyttäjä vaihtaa päivän sellaiseen, jolla ei ole kirjausta, lomake palautuu oletuksiin.
const BLANK = { sh: 8, sm: 0, eh: 16, em: 0, route: [], manualKm: '', allow: null, notes: '' };
function prefillFromExisting() {
  const iso = isoDate(S.y, S.m, S.d);
  if (S.prefilledFor === iso) return;
  const e = entries().find((x) => x.date === iso);
  const t = (txt) => { const m = /^(\d{1,2}):(\d{2})$/.exec(txt || ''); return m ? [Number(m[1]), Number(m[2])] : null; };
  if (e && t(e.start) && t(e.end)) {
    const r5 = (v) => Math.min(55, Math.round(v / 5) * 5); // minuuttirulla on 5 min välein
    const [sh, sm0] = t(e.start), [eh, em0] = t(e.end);
    const sm = r5(sm0), em = r5(em0);
    const known = new Set([HOME, ...app.profile.places.map((p) => p.id)]);
    Object.assign(S, {
      sh, sm, eh, em,
      route: (e.route || []).filter((id) => known.has(id)),
      manualKm: e.manualKm ? String(Math.round(e.manualKm)) : '',
      allow: e.allowance || null,
      notes: String(e.notes || '').replace(/\n?\[Puuttuva etäisyys:[^\]]*\]\s*$/, '').trim(),
      prefilledFor: iso,
    });
  } else if (S.prefilledFor) {
    Object.assign(S, BLANK, { route: [], prefilledFor: null });
  }
}

const nameOf = (id) => (id === HOME ? 'Koti' : ((app.profile.places.find((p) => p.id === id) || {}).name || id));
const derived = () => {
  const weekday = WEEKDAYS[new Date(S.y, S.m - 1, S.d).getDay()];
  const dateText = `${S.d}.${S.m}.${S.y}`;
  const startText = `${S.sh}:${pad(S.sm)}`, endText = `${S.eh}:${pad(S.em)}`;
  const workMin = minutesBetween(S.sh, S.sm, S.eh, S.em);
  const overnight = S.eh * 60 + S.em < S.sh * 60 + S.sm;
  const calc = computeKm(S.route, app.profile);
  const manual = parseInt(S.manualKm, 10) || 0;
  const km = Math.round((calc.km + manual) * 10) / 10;
  const dateIso = isoDate(S.y, S.m, S.d);
  const existing = entries().find((e) => e.date === dateIso);
  return { weekday, dateText, startText, endText, workMin, overnight, calc, manual, km, dateIso, existing };
};

// =====================================================================
// Näkymät
// =====================================================================
function center(title, text, buttons = '') {
  return `<div class="screen"><div class="center">${title ? `<h1>${esc(title)}</h1>` : ''}${text ? `<p>${esc(text)}</p>` : ''}${buttons}</div></div>`;
}

function render() {
  for (const w of app.wheels) w.destroy();
  app.wheels = [];
  const a = app.auth;
  if (a.state === 'loading') { root.innerHTML = center('', 'Ladataan…'); return; }
  if (a.state === 'not_configured') { root.innerHTML = center('Työaikakirjaus', 'Sovellusta ei ole vielä määritetty: täytä tiedostoon config.js taustapalvelun osoite (ks. käyttöönotto-ohje).'); return; }
  if (a.state === 'signed_out') {
    root.innerHTML = center('Työaikakirjaus', 'Avaa sovellus työnantajalta saamallasi henkilökohtaisella linkillä – tai liitä linkki tähän.',
      `<input id="avainlinkki" class="keyinput" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Liitä henkilökohtainen linkki" aria-label="Henkilökohtainen linkki">
      ${a.message ? `<p class="small" style="color:var(--danger,#C00000)">${esc(a.message)}</p>` : ''}
      <button type="button" class="btn primary" style="flex:none" data-act="login">Jatka</button>`);
    return;
  }
  if (a.state === 'denied') { root.innerHTML = center('Ei käyttöoikeutta', a.message, '<button type="button" class="btn secondary th" style="flex:none" data-act="logout">Syötä uusi linkki</button>'); return; }
  if (a.state !== 'ready' || !app.profile) { root.innerHTML = center('Hups', a.message || 'Jokin meni vikaan.', '<button type="button" class="btn primary" data-act="reload">Yritä uudelleen</button>'); return; }
  const oldBody = root.querySelector('.body');
  const keepScroll = S.history && oldBody && !app.scrollHistoryEnd ? oldBody.scrollTop : null;
  root.innerHTML = mainView();
  // Ilmoitus säilyy näkyvissä, vaikka näkymä piirretään uudelleen (esim. taustalla päivittyvät kirjaukset)
  if (app.toastEl) { const scr = root.querySelector('.screen'); if (scr) scr.appendChild(app.toastEl); }
  const body = root.querySelector('.body');
  if (body && S.history) {
    if (app.scrollHistoryEnd) { body.scrollTop = body.scrollHeight; app.scrollHistoryEnd = false; }
    else if (keepScroll !== null) body.scrollTop = keepScroll;
  }
  mountWheels();
  const notes = root.querySelector('#lisatiedot'); if (notes) notes.value = S.notes;
  const man = root.querySelector('#muuajo'); if (man) man.value = S.manualKm;
}

function mainView() {
  const D = derived();
  const p = app.profile;
  const title = S.history ? 'Kirjaukset' : S.saved ? '' : TITLES[S.step];
  const segs = [0, 1, 2, 3, 4].map((i) => `<div class="seg th${S.saved || i <= S.step ? ' done' : ''}"></div>`).join('');

  let content = '';
  if (S.history) content = historyView();
  else if (!S.saved && S.step <= 2) content = `<div class="stack">${wheelView(D)}</div>`;
  else if (!S.saved && S.step === 3) content = `<div class="stack">${routeView(D)}</div>`;
  else if (!S.saved && S.step === 4) content = `<div class="stack">${summaryView(D)}</div>`;

  const nav = S.history
    ? '<div class="nav"><button type="button" class="btn secondary th" data-act="closeHistory">Takaisin kirjaukseen</button></div>'
    : `<div class="nav">${!S.saved && S.step > 0 ? `<button type="button" class="btn secondary th" data-act="back"${S.saving ? ' disabled' : ''}>Takaisin</button>` : ''}
        <button type="button" class="btn primary" data-act="primary"${S.saving ? ' disabled aria-busy="true"' : ''}>${S.saving ? '<span class="spin" aria-hidden="true"></span>Tallennetaan…' : S.saved ? 'Uusi kirjaus' : S.step === 4 ? 'Tallenna' : 'Seuraava'}</button></div>`;

  const saved = S.saved && !S.history ? `<div class="saved"><div class="ok">${ICON.check(52, 2.5)}</div><h1>Tallennettu</h1>
      ${S.savedPending ? `<p class="small" style="font-size:15px;max-width:280px">Tallennettu puhelimeen. Lähetetään automaattisesti, kun yhteys toimii.</p>` : ''}</div>` : '';

  const delDialog = S.delDate && S.history ? (() => {
    const [y, m, d] = S.delDate.split('-').map(Number);
    return `<div class="scrim"><div class="dialog th" role="alertdialog" aria-modal="true" aria-labelledby="pt" aria-describedby="pd">
      <h2 id="pt">Poistetaanko kirjaus?</h2>
      <p id="pd">${esc(cap(WEEKDAYS[new Date(y, m - 1, d).getDay()]))} ${d}.${m}.${y} kirjaus poistetaan kokonaan.</p>
      <div class="row2"><button type="button" class="btn secondary th" data-act="cancelDelete">Takaisin</button>
      <button type="button" class="btn primary dangerbtn" data-act="confirmDelete">Poista</button></div></div></div>`;
  })() : '';

  const dialog = S.confirm && !S.saved && !S.history ? `<div class="scrim"><div class="dialog th" role="alertdialog" aria-modal="true" aria-labelledby="kt" aria-describedby="kd">
      <h2 id="kt">Kirjaus on jo tehty</h2>
      <p id="kd">Päivälle ${esc(D.dateText)} on jo kirjaus. Uusi kirjaus korvaa edellisen kirjauksen.</p>
      <div class="row2"><button type="button" class="btn secondary th" data-act="cancelConfirm">Takaisin</button>
      <button type="button" class="btn primary" data-act="confirmSave">OK</button></div></div></div>` : '';

  return `<div class="screen">
    <div class="top">
      <div class="toprow">
        <span class="who">${esc(p.name)}</span>
        <button type="button" class="histbtn th" data-act="toggleHistory" aria-pressed="${S.history}">${ICON.cal}<span>Kirjaukset</span></button>
        <div class="right"><button type="button" class="switch" role="switch" aria-checked="${dark}" aria-label="Tumma teema" data-act="toggleDark">
          <span class="track th"><span class="knob">${ICON.sun}${ICON.moon}</span></span></button></div>
      </div>
      <div class="segs" style="opacity:${S.history ? 0 : 1}">${segs}</div>
      ${S.history
        ? `<div class="title histtitle"><h1>${esc(title)}</h1>${entries().length ? `<button type="button" class="delmode th${S.delMode ? ' on' : ''}" data-act="toggleDelMode" aria-pressed="${!!S.delMode}">${S.delMode ? 'Valmis' : 'Poista kirjauksia'}</button>` : ''}</div>`
        : `<div class="title">${title ? `<h1>${esc(title)}</h1>` : ''}</div>`}
    </div>
    <div class="body">${content}</div>
    ${saved}${nav}${dialog}${delDialog}
  </div>`;
}

function wheelParts(D) {
  const isDate = S.step === 0;
  const a = isDate ? S.d : S.step === 1 ? S.sh : S.eh;
  const b = isDate ? `${S.m}.${S.y}` : pad(S.step === 1 ? S.sm : S.em);
  const sub = isDate ? D.weekday : S.step === 1 ? `${D.weekday} ${D.dateText}` : `Työaika ${durText(D.workMin)}${D.overnight ? ' (yli puolenyön)' : ''}`;
  return { isDate, a, b, sub, label: isDate ? D.dateText : `${a}:${b}` };
}

function wheelView(D) {
  const w = wheelParts(D);
  return `<div style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;flex-direction:column;align-items:center">
      ${w.isDate ? `<div class="recorded" style="opacity:${D.existing ? 1 : 0}">${ICON.check()}<span>Kirjattu</span></div>` : ''}
      <div class="big" style="--em:${w.isDate ? 4.48 : 2.5}" aria-live="polite" aria-label="${esc(w.label)}">
        <span class="ba" aria-hidden="true">${w.a}</span><span class="sep${w.isDate ? '' : ' colon'}" aria-hidden="true">${w.isDate ? '.' : ':'}</span><span class="bb" aria-hidden="true">${w.b}</span>
      </div>
      <div class="sub">${esc(w.sub)}</div>
    </div>
    <div class="wheels"><div class="wheel" data-w="0"></div><div class="wheel" data-w="1"></div></div>
  </div>`;
}

function updateWheelTexts() {
  const D = derived();
  const w = wheelParts(D);
  const big = root.querySelector('.big');
  if (!big) return;
  big.querySelector('.ba').textContent = w.a;
  big.querySelector('.bb').textContent = w.b;
  big.setAttribute('aria-label', w.label);
  root.querySelector('.sub').textContent = w.sub;
  const rec = root.querySelector('.recorded');
  if (rec) rec.style.opacity = D.existing ? 1 : 0;
}

function mountWheels() {
  const els = root.querySelectorAll('.wheel');
  if (els.length !== 2) return;
  const hours = range(0, 23).map((v) => ({ v, text: String(v) }));
  const mins = range(0, 55, 5).map((v) => ({ v, text: pad(v) }));
  const daysFor = (y, m) => range(1, new Date(y, m, 0).getDate()).map((v) => ({ v, text: String(v) }));
  if (S.step === 0) {
    const dayW = new Wheel(els[0], { values: daysFor(S.y, S.m), value: S.d, label: 'Päivä', onChange: (v) => { S.d = v; updateWheelTexts(); } });
    const monW = new Wheel(els[1], { values: range(1, 12).map((v) => ({ v, text: MONTHS[v - 1] })), value: S.m, label: 'Kuukausi',
      onChange: (v) => {
        S.m = v;
        const dim = new Date(S.y, v, 0).getDate();
        if (S.d > dim) S.d = dim;
        dayW.setValues(daysFor(S.y, S.m), S.d);
        updateWheelTexts();
      } });
    app.wheels = [dayW, monW];
  } else if (S.step === 1) {
    app.wheels = [
      new Wheel(els[0], { values: hours, value: S.sh, label: 'Aloitus, tunnit', onChange: (v) => { S.sh = v; updateWheelTexts(); } }),
      new Wheel(els[1], { values: mins, value: S.sm, label: 'Aloitus, minuutit', onChange: (v) => { S.sm = v; updateWheelTexts(); } }),
    ];
  } else {
    app.wheels = [
      new Wheel(els[0], { values: hours, value: S.eh, label: 'Lopetus, tunnit', onChange: (v) => { S.eh = v; updateWheelTexts(); } }),
      new Wheel(els[1], { values: mins, value: S.em, label: 'Lopetus, minuutit', onChange: (v) => { S.em = v; updateWheelTexts(); } }),
    ];
  }
}

function kmHeader(D) {
  return `<div style="display:flex;flex-direction:column"><span class="kmbig">${fmtKm(D.km)} km</span>
    ${D.manual > 0 ? `<span class="small">Reitti ${fmtKm(D.calc.km)} km + muu ajo ${D.manual} km</span>` : ''}</div>`;
}

function routeView(D) {
  const p = app.profile;
  const chips = S.route.length === 0
    ? '<span class="small" style="font-size:15px">Ei vielä reittiä. Aloita lähtöpaikasta.</span>'
    : S.route.map((id, i) => `${i > 0 ? ICON.arrow : ''}<span class="chip">${esc(nameOf(id))}</span>`).join('');
  const missing = D.calc.missing.length
    ? `<div class="warn">Etäisyys puuttuu taulukosta: ${esc(D.calc.missing.map(([x, y]) => `${x === 'Koti' ? 'Koti' : nameOf(x)}–${nameOf(y)}`).join(', '))}. Kerro työnantajan edustajalle.</div>` : '';
  const customers = p.places.filter((x) => x.id !== p.workplace)
    .map((x) => `<button type="button" class="pbtn cust th" data-act="addPlace" data-arg="${esc(x.id)}">${esc(x.name)}</button>`).join('');
  return `<div style="display:flex;flex-direction:column;gap:10px">
    <div class="card kmcard th">
      <div class="kmhead"><div class="kmsum">${kmHeader(D)}</div>
        <div style="display:flex;gap:4px">
          <button type="button" class="chipbtn th" data-act="undo">Kumoa</button>
          <button type="button" class="chipbtn th" data-act="clearRoute">Tyhjennä</button>
        </div></div>
      <div class="chips">${chips}</div>
      ${missing}
      <div class="manual th"><label for="muuajo">Muu ajo</label>
        <input id="muuajo" class="th" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0">
        <span style="font-size:15px;font-weight:600">km</span></div>
    </div>
    <div class="places">
      <button type="button" class="pbtn base th" data-act="addPlace" data-arg="${HOME}">${ICON.home}<span>Koti</span></button>
      <button type="button" class="pbtn base th" data-act="addPlace" data-arg="${esc(p.workplace)}">${ICON.work}<span>${esc(nameOf(p.workplace))}</span></button>
      ${customers}
    </div>
  </div>`;
}

function summaryView(D) {
  const rows = [['Päivämäärä', `${D.weekday} ${D.dateText}`], ['Työaika', `${D.startText}–${D.endText}`], ['Tunnit', durText(D.workMin)],
    ['Kilometrit', `${fmtKm(D.km)} km${D.manual ? ` (sis. muu ajo ${D.manual} km)` : ''}`]]
    .map(([k, v]) => `<div class="srow th"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('');
  const allow = [['half', 'Puolipäiväraha', 'yli 6 h'], ['full', 'Kokopäiväraha', 'yli 10 h']].map(([k, n, r]) => `
    <button type="button" role="checkbox" aria-checked="${S.allow === k}" class="abtn th" data-act="allow" data-arg="${k}">
      <span class="box th">${S.allow === k ? ICON.check(18, 3) : ''}</span>
      <span><span class="n">${n}</span><span class="r">${r}</span></span></button>`).join('');
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="card summary th">${rows}</div>
    <div style="display:flex;flex-direction:column;gap:6px"><div class="label">Päiväraha</div><div class="allow">${allow}</div></div>
    <div style="display:flex;flex-direction:column;gap:6px"><label for="lisatiedot" class="label">Lisätiedot</label>
      <textarea id="lisatiedot" class="notes th" rows="4" maxlength="1000" placeholder="Kirjoita tähän esimerkiksi mitä muu ajo koskee"></textarea></div>
  </div>`;
}

function historyView() {
  const list = entries().slice().reverse(); // vanhin ylimpänä, uusin alimpana
  const groups = [];
  const by = {};
  for (const e of list) {
    const [y, m, d] = e.date.split('-').map(Number);
    const key = `${y}-${m}`;
    if (!by[key]) { by[key] = { title: `${cap(MONTHS[m - 1])} ${y}`, rows: [], hours: 0, km: 0, full: 0, half: 0 }; groups.push(by[key]); }
    const g = by[key];
    g.rows.push({ ...e, label: `${WD_SHORT[new Date(y, m - 1, d).getDay()]} ${d}.${m}.` });
    g.hours += e.hours; g.km += e.km;
    if (e.allowance === 'full') g.full++;
    if (e.allowance === 'half') g.half++;
  }
  const months = groups.map((g) => {
    const allowText = g.full || g.half
      ? [g.full && `${g.full} × kokopäiväraha`, g.half && `${g.half} × puolipäiväraha`].filter(Boolean).join(', ') : 'ei päivärahoja';
    const rows = g.rows.map((e, i) => `<div class="tr${i % 2 ? ' zebra' : ''}" role="row">
        <span role="cell" class="d">${S.delMode ? `<button type="button" class="xbtn" data-act="askDelete" data-arg="${e.date}" aria-label="Poista ${esc(e.label)}">${ICON.x}</button>` : ''}${esc(e.label)}${e.pending ? '<span class="pending" title="Odottaa lähetystä"> •</span>' : ''}</span>
        <span role="cell">${esc(shortTime(e.start))}–${esc(shortTime(e.end))}</span>
        <span role="cell" class="num">${fmtH(e.hours)}</span>
        <span role="cell" class="num">${fmtKm(e.km)}</span>
        <span role="cell" class="num">${e.allowance === 'full' ? 'Koko' : e.allowance === 'half' ? 'Puoli' : '–'}</span></div>`).join('');
    return `<section class="card month th"><h2>${esc(g.title)}</h2>
      <div class="tbl" role="table" aria-label="${esc(g.title)}">
        <div class="tr head" role="row"><span role="columnheader">Pvm</span><span role="columnheader">Työaika</span><span role="columnheader" class="num">h</span><span role="columnheader" class="num">km</span><span role="columnheader" class="num">Päivä&shy;raha</span></div>
        ${rows}
        <div class="tr total" role="row"><span role="cell">Yht.</span><span role="cell">${g.rows.length} pv</span><span role="cell" class="num">${fmtH(g.hours)}</span><span role="cell" class="num">${fmtKm(g.km)}</span><span role="cell"></span></div>
      </div><p class="note">Päivärahat: ${allowText}</p></section>`;
  }).join('');
  return `<div class="hist">
    ${list.length === 0 ? '<p class="small" style="text-align:center;font-size:16px;margin:24px 0">Ei vielä kirjauksia.</p>' : ''}
    ${months}
    ${list.some((e) => e.pending) ? '<p class="small" style="text-align:center"><span class="pending">•</span> odottaa lähetystä (ei verkkoyhteyttä)</p>' : ''}
    <button type="button" class="linkbtn" data-act="logout">Kirjaudu ulos (${esc(app.profile.name)})</button>
  </div>`;
}

function toast(text) {
  const old = document.querySelector('.toast'); if (old) old.remove();
  const scr = root.querySelector('.screen'); if (!scr) return;
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
  scr.appendChild(t);
  app.toastEl = t;
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => { t.remove(); app.toastEl = null; }, 5000);
}

// =====================================================================
// Toiminnot
// =====================================================================
async function save() {
  if (S.saving || S.saved) return; // estää tuplapainallukset
  const D = derived();
  queueEntry({ date: D.dateIso, start: D.startText, end: D.endText, route: S.route, manualKm: D.manual, allowance: S.allow, notes: S.notes.trim() });
  S.saving = true; S.confirm = false;
  render();
  // Odotetaan taulukon kuittausta enintään 12 s; sen jälkeen kirjaus jatkaa matkaansa taustalla.
  const sending = sync();
  const r = await Promise.race([sending, new Promise((ok) => setTimeout(() => ok({ slow: true }), 12000))]);
  S.saving = false; S.saved = true;
  S.savedPending = outbox().some((e) => e.date === D.dateIso);
  render();
  if (r.slow) {
    sending.then(() => {
      const still = outbox().some((e) => e.date === D.dateIso);
      if (S.saved && S.savedPending !== still) { S.savedPending = still; render(); }
    });
    return;
  }
  if (r && r.error && !r.offline) toast(`${r.failed && r.failed.length ? `Kirjausta ei voitu tallentaa: ${r.error.message}` : `Kirjausta ei vielä saatu taulukkoon (${r.error.message}). Se on tallessa puhelimessa ja lähetetään automaattisesti.`}`);
}

// Poisto Kirjaukset-listalta: kirjaus katoaa listalta heti ja poisto lähetetään taulukkoon (myös myöhemmin, jos ei verkkoa).
async function removeDay(date) {
  queueDelete(date);
  S.delDate = null;
  render();
  const [, m, d] = date.split('-').map(Number);
  const r = await sync();
  if (r && r.error && !r.offline) toast(r.error.code === 'needs_update' ? r.error.message : `Poistoa ei vielä saatu taulukkoon (${r.error.message}). Yritetään uudelleen automaattisesti.`);
  else if (r && r.offline) toast(`Kirjaus ${d}.${m}. poistetaan, kun yhteys toimii.`);
  else toast(`Kirjaus ${d}.${m}. poistettu.`);
}

const actions = {
  login: async () => {
    const input = root.querySelector('#avainlinkki');
    if (!login(input ? input.value : '')) { app.auth = { state: 'signed_out', message: 'Linkistä ei löytynyt avainta. Kopioi koko linkki.' }; return render(); }
    app.auth = { state: 'loading' }; render();
    await refresh(); render();
  },
  logout: () => logout(),
  reload: () => location.reload(),
  toggleDark: () => { dark = !dark; LS.set('tyoaika.dark', dark); applyTheme(); },
  toggleHistory: () => { S.history = !S.history; S.confirm = false; S.delMode = false; app.scrollHistoryEnd = S.history; render(); },
  closeHistory: () => { S.history = false; S.delMode = false; render(); },
  back: () => { S.step = Math.max(0, S.step - 1); render(); },
  primary: () => {
    if (S.saved) { if (updateReady) return location.reload(); S = freshForm(); return render(); }
    if (S.step === 4) { if (derived().existing) { S.confirm = true; return render(); } return save(); }
    if (S.step === 0) prefillFromExisting();
    S.step++; render();
  },
  cancelConfirm: () => { S.confirm = false; render(); },
  confirmSave: () => save(),
  toggleDelMode: () => { S.delMode = !S.delMode; render(); },
  askDelete: (date) => { S.delDate = date; render(); },
  cancelDelete: () => { S.delDate = null; render(); },
  confirmDelete: () => { if (S.delDate) removeDay(S.delDate); },
  addPlace: (id) => { if (S.route[S.route.length - 1] !== id) { S.route = [...S.route, id]; render(); } },
  undo: () => { S.route = S.route.slice(0, -1); render(); },
  clearRoute: () => { S.route = []; S.manualKm = ''; render(); },
  allow: (k) => { S.allow = S.allow === k ? null : k; render(); },
};

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el) || S.saving) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset.arg);
});
root.addEventListener('input', (e) => {
  if (e.target.id === 'lisatiedot') S.notes = e.target.value;
  if (e.target.id === 'muuajo') {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (v !== e.target.value) e.target.value = v;
    S.manualKm = v;
    const sum = root.querySelector('.kmsum'); if (sum) sum.innerHTML = kmHeader(derived());
  }
});

// =====================================================================
// Käynnistys, kirjautuminen ja synkronointi
// =====================================================================
async function refresh() {
  try {
    app.profile = await loadProfile();
    app.auth = { state: 'ready' };
  } catch (e) {
    if (['not_registered', 'settings_invalid'].includes(e.code)) app.auth = { state: 'denied', message: e.message };
    else if (cachedProfile()) { app.profile = cachedProfile(); app.auth = { state: 'ready' }; }
    else app.auth = { state: 'error', message: e.code === 'offline' ? 'Ei verkkoyhteyttä. Sovellus tarvitsee yhteyden ensimmäisellä käyttökerralla.' : e.message };
  }
}

async function sync() {
  if (outbox().length === 0) return { sent: 0, failed: [] };
  const r = await flushOutbox();
  if (r.sent) {
    // Päivitetään omat kirjaukset taustalla – tallennuksen kuittaus ei odota tätä
    loadProfile().then((p) => {
      app.profile = p;
      if ((S.history || S.saved) && !app.wheels.some((w) => w.drag || w.anim)) render();
    }).catch(() => {});
  }
  return r;
}

// Käyttöönoton tarkistus: https://<osoite>/?tarkistus
async function diagnostics() {
  root.innerHTML = center('Tarkistus', 'Tarkistetaan asetuksia…');
  let html;
  try {
    const steps = await runDiagnostics();
    const r = { steps, ok: steps.length === 5 && steps.every((x) => x.ok) };
    html = r.steps.map((s) => `<div class="srow" style="flex-direction:column;align-items:flex-start;gap:4px"><span style="font-weight:600">${s.ok ? '✅' : '❌'} ${esc(s.step)}</span><span class="small" style="font-size:14px;word-break:break-word">${esc(s.detail)}</span></div>`).join('');
    html = `<div class="card summary" style="width:100%;text-align:left">${html}</div><p>${r.ok ? 'Kaikki kunnossa – sovellus on käyttövalmis.' : 'Korjaa ensimmäinen ❌-kohta ja päivitä sivu.'}</p>`;
  } catch (e) {
    html = `<p>Tarkistus epäonnistui: ${esc(e.message)}</p>`;
  }
  root.innerHTML = `<div class="screen"><div class="center" style="justify-content:flex-start;overflow:auto"><h1>Tarkistus</h1>${html}
    <button type="button" class="btn secondary th" style="flex:none" onclick="location.href='./'">Avaa sovellus</button></div></div>`;
}

async function start() {
  render();
  const a = await initAuth();
  if (new URLSearchParams(location.search).has('tarkistus') && a.state !== 'not_configured') return diagnostics();
  if (a.state !== 'signed_in') { app.auth = a; return render(); }
  const cached = cachedProfile();
  if (cached) { app.profile = cached; app.auth = { state: 'ready' }; render(); }
  await refresh();
  const r = await sync();
  // Piirretään uudelleen vain, jos käyttäjä ei ole kesken rullan pyörittämisen
  if (!app.wheels.some((w) => w.drag || w.anim)) render();
  if (r.error && !r.offline) toast(`Kirjausta ei vielä saatu tallennettua (${r.error.message}). Yritetään uudelleen automaattisesti.`);
}

const quietSync = async () => {
  if (app.auth.state !== 'ready' || outbox().length === 0) return;
  const r = await sync();
  if (r.sent && (S.history || S.saved)) render();
};
window.addEventListener('online', quietSync);
// Henkilökohtainen linkki avattu jo auki olevaan sivuun: ladataan uudelleen, jolloin avain otetaan käyttöön
window.addEventListener('hashchange', () => { if (/[#&]avain=/.test(location.hash)) location.reload(); });
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && quietSync());

start();

// Päivitykset: uusi versio haetaan aina, kun sovellus tuodaan näkyviin. Kun uusi versio on asentunut,
// sivu ladataan uudelleen heti, kun se ei keskeytä kirjausta (alkunäkymä, valmis-näkymä tai seuraava avaus).
let updateReady = false;
const safeToReload = () => !S.saving && (S.saved || (S.step === 0 && !S.history && !S.confirm && !S.delDate));
function reloadIfUpdated() { if (updateReady && safeToReload()) location.reload(); }
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = !!controller; // ensiasennus ei ole päivitys
    controller = navigator.serviceWorker.controller;
    if (wasControlled) { updateReady = true; reloadIfUpdated(); }
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { reg.update().catch(() => {}); reloadIfUpdated(); }
      });
    } catch (_) {}
  });
}
