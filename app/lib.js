// Kirjautuminen (Microsoft / MSAL), Excel-tiedostojen luku ja kirjoitus (Microsoft Graph käyttäjän omilla
// oikeuksilla), lähetysjono (toimii ilman verkkoa) ja km-laskenta. Ei omaa palvelinta.
import CONFIG from './config.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
export { LS };

const SCOPES = ['User.Read', 'Files.ReadWrite.All'];
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TABLE = 'Kirjaukset';
const err = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const configured = () => [CONFIG.tenantId, CONFIG.clientId, CONFIG.settingsFileUrl].every((v) => v && !String(v).startsWith('TÄYTÄ'));

// ---------- Kirjautuminen

let msalApp = null;

export async function initAuth() {
  if (!configured()) return { state: 'not_configured' };
  if (!window.msal) return { state: 'error', message: 'Kirjautumiskirjastoa ei voitu ladata. Tarkista verkkoyhteys.' };
  msalApp = new window.msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
      redirectUri: window.location.origin + '/',
      postLogoutRedirectUri: window.location.origin + '/',
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await msalApp.initialize();
  try {
    const result = await msalApp.handleRedirectPromise();
    if (result && result.account) msalApp.setActiveAccount(result.account);
  } catch (e) {
    return { state: 'error', message: 'Kirjautuminen epäonnistui: ' + (e.errorMessage || e.message) };
  }
  const acc = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
  if (acc) { msalApp.setActiveAccount(acc); return { state: 'signed_in', account: acc }; }
  return { state: 'signed_out' };
}

export function login() { return msalApp.loginRedirect({ scopes: SCOPES, prompt: 'select_account' }); }
export function logout() {
  LS.del('tyoaika.profile');
  return msalApp.logoutRedirect({ account: msalApp.getActiveAccount() });
}

async function getToken() {
  const account = msalApp.getActiveAccount();
  if (!account) throw err('signed_out', 'Kirjaudu sisään');
  try {
    return (await msalApp.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    if (e instanceof window.msal.InteractionRequiredAuthError) {
      await msalApp.acquireTokenRedirect({ scopes: SCOPES, account });
      throw err('redirecting', 'Kirjautuminen uusitaan');
    }
    throw err('offline', 'Ei yhteyttä');
  }
}

// ---------- Microsoft Graph

async function graph(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    let res;
    try {
      res = await fetch(path.startsWith('https://') ? path : GRAPH + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (_) {
      throw err('offline', 'Ei verkkoyhteyttä');
    }
    if ([429, 503, 504].includes(res.status) && attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.min(8, Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000));
      continue;
    }
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch (_) { return {}; } })() : {};
    if (!res.ok) {
      const msg = (data.error && data.error.message) || '';
      throw err('graph_' + res.status, msg || 'Virhe ' + res.status, { status: res.status });
    }
    return data;
  }
}

const shareId = (url) => 'u!' + btoa(unescape(encodeURIComponent(url.trim()))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
const enc = (s) => encodeURIComponent(s).replace(/'/g, "''");
const sheetPath = (drive, item, sheet) => `/drives/${drive}/items/${item}/workbook/worksheets('${enc(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`;
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const norm = (v) => str(v).toLowerCase();
const num = (v) => { if (typeof v === 'number') return v; const n = Number(str(v).replace(',', '.')); return str(v) !== '' && Number.isFinite(n) ? n : null; };
export const pairKey = (a, b) => [a, b].sort().join('|');
export const HOME = 'KOTI';

// --- Asetukset.xlsx (kaikille yhteinen)
async function readSheet(drive, item, name) {
  try { return (await graph('GET', sheetPath(drive, item, name))).values || []; }
  catch (e) { if (e.status === 404) throw err('settings_invalid', `Excelistä puuttuu välilehti "${name}"`); throw e; }
}
function parseSettings(paikat, etaisyydet, asetukset) {
  const ph = paikat.findIndex((r) => norm(r[0]) === 'tunnus');
  if (ph < 0) throw err('settings_invalid', 'Paikat-välilehdeltä ei löydy otsikkoa "Tunnus"');
  const places = [];
  for (const r of paikat.slice(ph + 1)) {
    const id = str(r[0]).toUpperCase();
    if (id && id !== HOME) places.push({ id, name: str(r[1]) || id, type: str(r[2]) });
  }
  const workplace = (places.find((p) => norm(p.type) === 'toimisto') || places.find((p) => p.id === 'TP') || {}).id;
  if (!workplace) throw err('settings_invalid', 'Paikat-välilehdeltä puuttuu toimisto (Tyyppi = Toimisto)');
  const ids = new Set(places.map((p) => p.id));
  const eh = etaisyydet.findIndex((r) => norm(r[0]).startsWith('mistä'));
  const distances = {};
  for (const r of etaisyydet.slice(eh + 1)) {
    const a = str(r[0]).toUpperCase(), b = str(r[2]).toUpperCase(), km = num(r[4]);
    if (ids.has(a) && ids.has(b) && km !== null && km >= 0) distances[pairKey(a, b)] = km;
  }
  let policy = 'full';
  for (const r of asetukset) if (norm(r[0]).startsWith('koti ↔ asiakas') && norm(r[1]).startsWith('vähennetään')) policy = 'deduct';
  return { places, workplace, distances, policy };
}

// --- Työntekijän oma tiedosto
function parseHome(tiedot) {
  const h = tiedot.findIndex((r) => norm(r[0]) === 'tunnus');
  const home = {};
  if (h >= 0) for (const r of tiedot.slice(h + 1)) {
    const id = str(r[0]).toUpperCase(), km = num(r[2]);
    if (id && km !== null && km >= 0) home[id] = km;
  }
  const nameRow = tiedot.find((r) => norm(r[0]) === 'nimi');
  return { home, name: nameRow ? str(nameRow[1]) : '' };
}

// Excelin päivä- ja aika-arvot: sarjanumero tai teksti
function toIsoDate(v) {
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function toTime(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) { const min = Math.round(v * 1440); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; }
  const m = /^(\d{1,2})[:.](\d{2})/.exec(str(v));
  return m ? `${Number(m[1])}:${m[2]}` : '';
}
function rowToEntry(values) {
  const [date, start, end, hours, , , manual, total, allow, notes, , ids] = values;
  return {
    date: toIsoDate(date), start: toTime(start), end: toTime(end), hours: num(hours) || 0,
    km: num(total) || 0, manualKm: num(manual) || 0,
    allowance: norm(allow).startsWith('koko') ? 'full' : norm(allow).startsWith('puoli') ? 'half' : null,
    notes: str(notes), route: str(ids).split('>').filter(Boolean),
  };
}

async function locate() {
  const me = await graph('GET', '/me?$select=displayName,mail,userPrincipalName');
  const email = norm(me.mail || me.userPrincipalName);
  let settingsItem;
  try {
    settingsItem = await graph('GET', `/shares/${shareId(CONFIG.settingsFileUrl)}/driveItem?$select=id,name,parentReference`);
  } catch (e) {
    if (e.code === 'offline' || e.code === 'redirecting') throw e;
    throw err('settings_unreachable', 'Asetukset-tiedostoa ei voitu avata. Tarkista, että sinulla on lukuoikeus Työajat-sivustoon ja että config.js:n linkki on oikein.', { detail: e.message });
  }
  const drive = settingsItem.parentReference.driveId;
  const local = email.split('@')[0];
  const fileName = `${local}.xlsx`;
  let own;
  try {
    own = await graph('GET', `/drives/${drive}/root:/${CONFIG.employeeFolder.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(fileName)}?$select=id,name`);
  } catch (e) {
    if (e.code === 'offline' || e.code === 'redirecting') throw e;
    throw err('not_registered', `Omaa kirjaustiedostoasi (${CONFIG.employeeFolder}/${fileName}) ei löytynyt tai sitä ei ole jaettu sinulle. Pyydä työnantajan edustajaa luomaan ja jakamaan se.`, { detail: e.message });
  }
  return { me, email, drive, settingsId: settingsItem.id, ownId: own.id, fileName };
}

async function readEntries(drive, ownId) {
  let rows;
  try { rows = (await graph('GET', `/drives/${drive}/items/${ownId}/workbook/tables('${TABLE}')/rows?$select=index,values`)).value || []; }
  catch (e) { if (e.status === 404) throw err('table_missing', `Omasta tiedostostasi puuttuu Excel-taulukko "${TABLE}".`); throw e; }
  return rows.map((r) => ({ index: r.index, ...rowToEntry(r.values[0]) }));
}

export async function loadProfile() {
  const L = await locate();
  const [paikat, etaisyydet, asetukset, tiedot, rows] = await Promise.all([
    readSheet(L.drive, L.settingsId, 'Paikat'), readSheet(L.drive, L.settingsId, 'Etäisyydet'),
    readSheet(L.drive, L.settingsId, 'Asetukset'), readSheet(L.drive, L.ownId, 'Tiedot'), readEntries(L.drive, L.ownId),
  ]);
  const settings = parseSettings(paikat, etaisyydet, asetukset);
  const own = parseHome(tiedot);
  const profile = {
    ...settings, home: own.home, name: own.name || L.me.displayName || L.email, email: L.email,
    entries: rows.filter((e) => e.date).sort((a, b) => (a.date < b.date ? 1 : -1)),
    ids: { drive: L.drive, own: L.ownId },
  };
  LS.set('tyoaika.profile', profile);
  return profile;
}
export function cachedProfile() { return LS.get('tyoaika.profile', null); }

// ---------- Kirjauksen tallennus omaan tiedostoon (saman päivän rivi korvataan)

export function computeKm(route, profile) {
  let total = 0; const missing = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    if (a === b) continue;
    if (a === HOME || b === HOME) {
      const other = a === HOME ? b : a;
      if (other === profile.workplace) continue; // koti ↔ työpaikka = 0 km
      const direct = profile.home[other];
      if (typeof direct !== 'number') { missing.push(['Koti', other]); continue; }
      if (profile.policy === 'deduct') {
        const c = profile.home[profile.workplace];
        if (typeof c !== 'number') { missing.push(['Koti', profile.workplace]); continue; }
        total += Math.max(0, direct - c);
      } else total += direct;
    } else {
      const d = profile.distances[pairKey(a, b)];
      if (typeof d !== 'number') missing.push([a, b]); else total += d;
    }
  }
  return { km: Math.round(total * 10) / 10, missing };
}

function entryRow(p, profile) {
  const nameOf = (id) => (id === HOME ? 'Koti' : (profile.places.find((x) => x.id === id) || {}).name || id);
  const [sh, sm] = p.start.split(':').map(Number);
  const [eh, em] = p.end.split(':').map(Number);
  let min = eh * 60 + em - (sh * 60 + sm); if (min < 0) min += 1440;
  const c = computeKm(p.route || [], profile);
  let notes = p.notes || '';
  if (c.missing.length) notes = (notes ? notes + '\n' : '') + `[Puuttuva etäisyys: ${c.missing.map(([a, b]) => `${a === 'Koti' ? 'Koti' : nameOf(a)}–${nameOf(b)}`).join(', ')}]`;
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  return [
    p.date, "'" + p.start, "'" + p.end, Math.round((min / 60) * 100) / 100,
    (p.route || []).map(nameOf).join(' → '), c.km, p.manualKm || 0, Math.round((c.km + (p.manualKm || 0)) * 10) / 10,
    p.allowance === 'full' ? 'Kokopäiväraha' : p.allowance === 'half' ? 'Puolipäiväraha' : 'Ei',
    notes, stamp, (p.route || []).join('>'),
  ];
}

async function saveEntry(p, profile) {
  const { drive, own } = profile.ids;
  const base = `/drives/${drive}/items/${own}/workbook`;
  const values = [entryRow(p, profile)];
  const rows = await readEntries(drive, own);
  const target = rows.find((r) => r.date === p.date) || rows.find((r) => !r.date);
  if (target) {
    // Päivitetään olemassa oleva (tai tyhjä) taulukon rivi sen solualueen kautta
    const addr = (await graph('GET', `${base}/tables('${TABLE}')/range?$select=address`)).address; // esim. Kirjaukset!A1:L9
    const m = /^(.*)!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?\d+$/.exec(addr);
    if (!m) throw err('table_address', 'Kirjaukset-taulukon sijaintia ei voitu lukea: ' + addr);
    const sheet = m[1].replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
    const row = Number(m[3]) + 1 + target.index;
    await graph('PATCH', `${base}/worksheets('${enc(sheet)}')/range(address='${m[2]}${row}:${m[4]}${row}')`, { values });
  } else {
    await graph('POST', `${base}/tables('${TABLE}')/rows`, { values });
  }
}

// ---------- Lähetysjono: kirjaus tallentuu ensin puhelimeen ja lähtee, kun yhteys toimii

export function outbox() { return LS.get('tyoaika.outbox', []); }
export function queueEntry(payload) {
  const list = outbox().filter((e) => e.date !== payload.date);
  list.push({ ...payload, queuedAt: Date.now() });
  LS.set('tyoaika.outbox', list);
}
let flushing = null;
export function flushOutbox(profile) {
  if (flushing) return flushing;
  flushing = (async () => {
    const results = { sent: 0, failed: [], offline: false };
    if (!profile || !profile.ids) return results;
    for (const item of outbox()) {
      try {
        const { queuedAt, ...payload } = item;
        await saveEntry(payload, profile);
        LS.set('tyoaika.outbox', outbox().filter((e) => !(e.date === item.date && e.queuedAt === item.queuedAt)));
        results.sent++;
      } catch (e) {
        // Jätetään jonoon ja yritetään myöhemmin (ei verkkoa, kirjautuminen uusitaan, tiedosto lukossa tms.)
        results.offline = e.code === 'offline'; results.error = e; break;
      }
    }
    return results;
  })().finally(() => { flushing = null; });
  return flushing;
}

// ---------- Käyttöönoton tarkistus (/?tarkistus)

export async function diagnostics() {
  const steps = [];
  const step = async (name, fn) => {
    try { steps.push({ step: name, ok: true, detail: (await fn()) || '' }); return true; }
    catch (e) { steps.push({ step: name, ok: false, detail: e.message + (e.detail ? ' – ' + e.detail : '') }); return false; }
  };
  let L, settings;
  if (!(await step('1. Kirjautuminen', async () => { const me = await graph('GET', '/me?$select=mail,userPrincipalName'); return me.mail || me.userPrincipalName; }))) return steps;
  if (!(await step('2. Tiedostot löytyvät', async () => { L = await locate(); return `Asetukset.xlsx ja ${CONFIG.employeeFolder}/${L.fileName}`; }))) return steps;
  if (!(await step('3. Asetukset.xlsx luettavissa', async () => {
    const [a, b, c] = await Promise.all([readSheet(L.drive, L.settingsId, 'Paikat'), readSheet(L.drive, L.settingsId, 'Etäisyydet'), readSheet(L.drive, L.settingsId, 'Asetukset')]);
    settings = parseSettings(a, b, c);
    return `${settings.places.length} paikkaa, ${Object.keys(settings.distances).length} etäisyyttä, koti–asiakas: ${settings.policy === 'deduct' ? 'vähennetään koti–työpaikka' : 'korvataan kokonaan'}`;
  }))) return steps;
  await step('4. Oma tiedosto: kotietäisyydet', async () => {
    const h = parseHome(await readSheet(L.drive, L.ownId, 'Tiedot')).home;
    const miss = settings.places.filter((p) => typeof h[p.id] !== 'number').map((p) => p.name);
    if (miss.length) throw err('x', 'Puuttuu: ' + miss.join(', '));
    return `${Object.keys(h).length}/${settings.places.length} täytetty`;
  });
  await step('5. Oma tiedosto: Kirjaukset-taulukko', async () => `${(await readEntries(L.drive, L.ownId)).filter((e) => e.date).length} kirjausta`);
  return steps;
}
