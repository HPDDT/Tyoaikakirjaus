/**
 * Työaikakirjaus – taustapalvelu Google Sheetsille (versio 3)
 *
 * Liitä tämä koodi taulukon Apps Script -editoriin (Laajennukset → Apps Script) ja julkaise verkkosovelluksena:
 *   Ota käyttöön → Uusi käyttöönotto → Verkkosovellus
 *   Suorita käyttäjänä: Minä · Kenellä on käyttöoikeus: Kuka tahansa
 *
 * Sovellus tunnistaa työntekijän henkilökohtaisesta avaimesta (Työntekijät-välilehti, sarake "Avain").
 * Työntekijä näkee ja kirjoittaa vain omaa välilehteään. Taulukkoa itseään ei jaeta työntekijöille.
 */

const VERSION = 3;
const SH = { emp: 'Työntekijät', places: 'Paikat', dist: 'Etäisyydet', settings: 'Asetukset' };
const HOME = 'KOTI';
const COLS = ['Päivämäärä', 'Aloitus', 'Lopetus', 'Tunnit', 'Reitti', 'Reitin km', 'Muu ajo km', 'Km yhteensä',
  'Päiväraha', 'Lisätiedot', 'Tallennettu', 'Reitti (tunnukset)'];
const FORMATS = ['d.m.yyyy', 'h:mm', 'h:mm', '0.00', '@', '0', '0', '0', '@', '@', 'd.m.yyyy h:mm', '@'];
const WIDTHS = [95, 65, 65, 60, 300, 75, 85, 95, 120, 300, 130, 220];

// ---------------------------------------------------------------- Verkkosovellus

function doGet() {
  return out_({ ok: true, app: 'tyoaikakirjaus', version: VERSION });
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return out_({ ok: false, code: 'bad_request', message: 'Virheellinen pyyntö' }); }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cfg = readSettings_(ss);
    const emp = findEmployee_(ss, cfg, req.key);
    if (req.action === 'profile') return out_({ ok: true, profile: profile_(ss, cfg, emp) });
    if (req.action === 'save') return out_({ ok: true, saved: save_(ss, cfg, emp, req.entry || {}) });
    if (req.action === 'delete') return out_({ ok: true, deleted: delete_(ss, emp, req.date) });
    return out_({ ok: false, code: 'bad_request', message: 'Tuntematon toiminto' });
  } catch (err) {
    return out_({ ok: false, code: err.code || 'error', message: err.message || String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, message) { const e = new Error(message); e.code = code; return e; }
const str_ = (v) => (v === null || v === undefined ? '' : String(v).trim());
const norm_ = (v) => str_(v).toLowerCase();
const num_ = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = str_(v).replace(',', '.'); const n = Number(s);
  return s !== '' && isFinite(n) ? n : null;
};
const pairKey_ = (a, b) => [a, b].sort().join('|');

// ---------------------------------------------------------------- Asetukset

function sheet_(ss, name) {
  const s = ss.getSheetByName(name);
  if (!s) throw fail_('settings_invalid', `Taulukosta puuttuu välilehti "${name}"`);
  return s;
}

function readSettings_(ss) {
  const paikat = sheet_(ss, SH.places).getDataRange().getValues();
  const ph = paikat.findIndex((r) => norm_(r[0]) === 'tunnus');
  if (ph < 0) throw fail_('settings_invalid', 'Paikat-välilehdeltä ei löydy otsikkoa "Tunnus"');
  const places = [];
  paikat.slice(ph + 1).forEach((r) => {
    const id = str_(r[0]).toUpperCase();
    if (id && id !== HOME) places.push({ id: id, name: str_(r[1]) || id, type: str_(r[2]) });
  });
  const wp = places.find((p) => norm_(p.type) === 'toimisto') || places.find((p) => p.id === 'TP');
  if (!wp) throw fail_('settings_invalid', 'Paikat-välilehdeltä puuttuu toimisto (Tyyppi = Toimisto)');
  const ids = {}; places.forEach((p) => { ids[p.id] = true; });

  const et = sheet_(ss, SH.dist).getDataRange().getValues();
  const eh = et.findIndex((r) => norm_(r[0]).indexOf('mistä') === 0);
  const distances = {};
  et.slice(eh + 1).forEach((r) => {
    const a = str_(r[0]).toUpperCase(), b = str_(r[2]).toUpperCase(), km = num_(r[4]);
    if (ids[a] && ids[b] && km !== null && km >= 0) distances[pairKey_(a, b)] = km;
  });

  let policy = 'full';
  sheet_(ss, SH.settings).getDataRange().getValues().forEach((r) => {
    if (norm_(r[0]).indexOf('koti ↔ asiakas') === 0 && norm_(r[1]).indexOf('vähennetään') === 0) policy = 'deduct';
  });
  return { places: places, workplace: wp.id, distances: distances, policy: policy };
}

// ---------------------------------------------------------------- Työntekijät

function empLayout_(values) {
  const h = values.findIndex((r) => norm_(r[0]) === 'nimi');
  if (h < 1) throw fail_('settings_invalid', 'Työntekijät-välilehdeltä ei löydy otsikkoa "Nimi"');
  const head = values[h].map(norm_);
  const col = (prefix) => head.findIndex((x) => x.indexOf(prefix) === 0);
  return { h: h, ids: values[h - 1].map((v) => str_(v).toUpperCase()), name: 0,
    email: col('sähköposti'), address: col('kotiosoite'), key: col('avain') };
}

function findEmployee_(ss, cfg, key) {
  key = str_(key);
  if (key.length < 12) throw fail_('not_registered', 'Henkilökohtainen linkki puuttuu tai on virheellinen. Avaa sovellus työnantajalta saamallasi linkillä.');
  const values = sheet_(ss, SH.emp).getDataRange().getValues();
  const L = empLayout_(values);
  if (L.key < 0) throw fail_('settings_invalid', 'Työntekijät-välilehdeltä puuttuu sarake "Avain"');
  const known = {}; cfg.places.forEach((p) => { known[p.id] = true; });
  for (let i = L.h + 1; i < values.length; i++) {
    const r = values[i];
    if (str_(r[L.key]) !== key || !str_(r[0])) continue;
    const home = {};
    L.ids.forEach((id, c) => {
      const km = num_(r[c]);
      if (known[id] && km !== null && km >= 0) home[id] = km;
    });
    return { name: str_(r[0]), email: L.email >= 0 ? str_(r[L.email]) : '', home: home };
  }
  throw fail_('not_registered', 'Henkilökohtainen linkkisi ei ole voimassa. Pyydä työnantajan edustajalta uusi linkki.');
}

// Työntekijän oma välilehti (nimi = Työntekijät-välilehden Nimi). Luodaan tarvittaessa.
const RESERVED = ['Ohje', 'Tarkistus', 'Koonti', SH.emp, SH.places, SH.dist, SH.settings].map((x) => x.toLowerCase());
function checkName_(name) {
  if (RESERVED.indexOf(name.toLowerCase()) >= 0) throw fail_('settings_invalid', `Työntekijän nimi "${name}" on varattu välilehden nimi – muuta nimeä Työntekijät-välilehdellä.`);
}
function empSheet_(ss, name) {
  checkName_(name);
  let s = ss.getSheetByName(name);
  if (s) return s;
  s = ss.insertSheet(name, ss.getNumSheets());
  s.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#1D4ED8').setFontColor('#FFFFFF');
  s.setFrozenRows(1);
  WIDTHS.forEach((w, i) => s.setColumnWidth(i + 1, w));
  return s;
}

function readEntries_(ss, sheet) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  const range = sheet.getRange(2, 1, n, COLS.length);
  const v = range.getValues(), d = range.getDisplayValues();
  const tz = ss.getSpreadsheetTimeZone();
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = isoDate_(v[i][0], d[i][0], tz);
    if (!date) continue;
    const allow = norm_(v[i][8]);
    out.push({
      row: i + 2, date: date, start: time_(d[i][1]), end: time_(d[i][2]),
      hours: num_(v[i][3]) || 0, km: num_(v[i][7]) || 0, manualKm: num_(v[i][6]) || 0,
      allowance: allow.indexOf('koko') === 0 ? 'full' : allow.indexOf('puoli') === 0 ? 'half' : null,
      notes: str_(v[i][9]), route: str_(v[i][11]).split('>').filter(String),
    });
  }
  return out;
}

function isoDate_(v, shown, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = str_(shown || v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}`;
  return '';
}
function time_(shown) {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(str_(shown));
  return m ? `${Number(m[1])}:${m[2]}` : '';
}

function profile_(ss, cfg, emp) {
  checkName_(emp.name);
  const s = ss.getSheetByName(emp.name);
  const entries = s ? readEntries_(ss, s) : [];
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  entries.forEach((e) => { delete e.row; });
  return { places: cfg.places, workplace: cfg.workplace, distances: cfg.distances, policy: cfg.policy,
    home: emp.home, name: emp.name, email: emp.email, entries: entries };
}

// ---------------------------------------------------------------- Kilometrit ja tallennus

function computeKm_(route, cfg, home) {
  let total = 0; const missing = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    if (a === b) continue;
    if (a === HOME || b === HOME) {
      const other = a === HOME ? b : a;
      if (other === cfg.workplace) continue; // koti ↔ työpaikka = 0 km
      const direct = home[other];
      if (typeof direct !== 'number') { missing.push([HOME, other]); continue; }
      if (cfg.policy === 'deduct') {
        const c = home[cfg.workplace];
        if (typeof c !== 'number') { missing.push([HOME, cfg.workplace]); continue; }
        total += Math.max(0, direct - c);
      } else total += direct;
    } else {
      const d = cfg.distances[pairKey_(a, b)];
      if (typeof d !== 'number') missing.push([a, b]); else total += d;
    }
  }
  return { km: Math.round(total * 10) / 10, missing: missing };
}

const safeText_ = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s);

function save_(ss, cfg, emp, p) {
  // Tarkistetaan syöte
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str_(p.date));
  const tm = (t) => /^(\d{1,2}):(\d{2})$/.exec(str_(t));
  const st = tm(p.start), en = tm(p.end);
  if (!dm || !st || !en || Number(st[1]) > 23 || Number(en[1]) > 23 || Number(st[2]) > 59 || Number(en[2]) > 59) {
    throw fail_('bad_request', 'Virheellinen päivämäärä tai kellonaika');
  }
  const ids = {}; cfg.places.forEach((pl) => { ids[pl.id] = pl.name; });
  const route = (Array.isArray(p.route) ? p.route : []).map((x) => str_(x).toUpperCase()).filter((x) => x === HOME || ids[x]);
  const manual = Math.max(0, Math.min(5000, Math.round(num_(p.manualKm) || 0)));
  const allowance = p.allowance === 'full' || p.allowance === 'half' ? p.allowance : null;
  let notes = str_(p.notes).slice(0, 2000);

  const nameOf = (id) => (id === HOME ? 'Koti' : ids[id] || id);
  const c = computeKm_(route, cfg, emp.home);
  if (c.missing.length) {
    const labels = c.missing.map((x) => nameOf(x[0]) + '–' + nameOf(x[1])).filter((x, i, a) => a.indexOf(x) === i);
    notes = (notes ? notes + '\n' : '') + `[Puuttuva etäisyys: ${labels.join(', ')}]`;
  }
  const sMin = Number(st[1]) * 60 + Number(st[2]), eMin = Number(en[1]) * 60 + Number(en[2]);
  let min = eMin - sMin; if (min < 0) min += 1440;
  const serial = (Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) - Date.UTC(1899, 11, 30)) / 864e5;
  const row = [
    serial, sMin / 1440, eMin / 1440, Math.round((min / 60) * 100) / 100,
    safeText_(route.map(nameOf).join(' → ')), c.km, manual, Math.round((c.km + manual) * 10) / 10,
    allowance === 'full' ? 'Kokopäiväraha' : allowance === 'half' ? 'Puolipäiväraha' : 'Ei',
    safeText_(notes), new Date(), route.join('>'),
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = empSheet_(ss, emp.name);
    const existing = readEntries_(ss, sheet).find((e) => e.date === str_(p.date));
    const r = existing ? existing.row : Math.max(2, sheet.getLastRow() + 1);
    const range = sheet.getRange(r, 1, 1, COLS.length);
    range.setNumberFormats([FORMATS.map((f, i) => (f === '0' && row[i] % 1 ? '0.0' : f))]);
    range.setValues([row]);
    sortSheet_(sheet);
    SpreadsheetApp.flush();
    return { date: p.date, replaced: !!existing, km: c.km, missing: c.missing.length };
  } finally {
    lock.releaseLock();
  }
}

// Poistaa työntekijän oman välilehden kyseisen päivän rivin. Palauttaa false, jos päivälle ei ollut kirjausta.
function delete_(ss, emp, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str_(date))) throw fail_('bad_request', 'Virheellinen päivämäärä');
  checkName_(emp.name);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss.getSheetByName(emp.name);
    if (!sheet) return false;
    const rows = readEntries_(ss, sheet).filter((e) => e.date === str_(date)).map((e) => e.row).sort((a, b) => b - a);
    rows.forEach((r) => sheet.deleteRow(r));
    SpreadsheetApp.flush();
    return rows.length > 0;
  } finally {
    lock.releaseLock();
  }
}

// Kirjaukset päivämäärän mukaan vanhimmasta uusimpaan
function sortSheet_(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n > 1) sheet.getRange(2, 1, n, COLS.length).sort({ column: 1, ascending: true });
}

// ---------------------------------------------------------------- Valikko taulukossa

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Työaikakirjaus')
    .addItem('Luo puuttuvat avaimet', 'luoAvaimet')
    .addItem('Vaihda valitun työntekijän avain', 'vaihdaAvain')
    .addSeparator()
    .addItem('Päivitä koonti (kaikki kirjaukset)', 'paivitaKoonti')
    .addToUi();
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

// Täyttää avaimen jokaiselle työntekijälle, jolla on nimi mutta ei avainta. Linkki muodostuu kaavalla.
function luoAvaimet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = sheet_(ss, SH.emp);
  const values = s.getDataRange().getValues();
  const L = empLayout_(values);
  let n = 0;
  for (let i = L.h + 1; i < values.length; i++) {
    if (str_(values[i][0]) && !str_(values[i][L.key])) { s.getRange(i + 1, L.key + 1).setValue(newKey_()); n++; }
  }
  SpreadsheetApp.getUi().alert(n ? `Luotiin ${n} avainta. Lähetä Linkki-sarakkeen linkki kullekin työntekijälle.` : 'Kaikilla työntekijöillä on jo avain.');
}

// Mitätöi valitun rivin vanhan linkin ja luo uuden (esim. jos linkki on päätynyt vääriin käsiin).
function vaihdaAvain() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  if (s.getName() !== SH.emp) { ui.alert('Valitse ensin työntekijän rivi Työntekijät-välilehdeltä.'); return; }
  const values = s.getDataRange().getValues();
  const L = empLayout_(values);
  const r = s.getActiveCell().getRow();
  const name = r - 1 > L.h && r <= values.length ? str_(values[r - 1][0]) : '';
  if (!name) { ui.alert('Valitse työntekijän rivi.'); return; }
  if (ui.alert(`Vaihdetaanko työntekijän ${name} avain? Vanha linkki lakkaa toimimasta.`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  s.getRange(r, L.key + 1).setValue(newKey_());
  ui.alert('Avain vaihdettu. Lähetä työntekijälle uusi linkki Linkki-sarakkeesta.');
}

// Kokoaa kaikkien työntekijöiden kirjaukset Koonti-välilehdelle (esim. palkanlaskentaa ja pivot-taulukoita varten).
function paivitaKoonti() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const values = sheet_(ss, SH.emp).getDataRange().getValues();
  const L = empLayout_(values);
  let k = ss.getSheetByName('Koonti');
  if (!k) k = ss.insertSheet('Koonti', 2);
  k.clear();
  k.getRange(1, 1, 1, COLS.length + 1).setValues([['Työntekijä'].concat(COLS)])
    .setFontWeight('bold').setBackground('#1D4ED8').setFontColor('#FFFFFF');
  k.setFrozenRows(1);
  let r = 2, total = 0;
  for (let i = L.h + 1; i < values.length; i++) {
    const name = str_(values[i][0]);
    if (!name || RESERVED.indexOf(name.toLowerCase()) >= 0) continue;
    const s = ss.getSheetByName(name);
    const n = s ? s.getLastRow() - 1 : 0;
    if (n < 1) continue;
    sortSheet_(s);
    s.getRange(2, 1, n, COLS.length).copyTo(k.getRange(r, 2, n, COLS.length));
    k.getRange(r, 1, n, 1).setValues(Array.from({ length: n }, () => [name]));
    r += n; total += n;
  }
  if (total > 1) k.getRange(2, 1, total, COLS.length + 1).sort([{ column: 2, ascending: true }, { column: 1, ascending: true }]);
  SpreadsheetApp.getUi().alert(`Koonti päivitetty: ${total} kirjausta.`);
}
