// Henkilökohtainen avain, yhteys taustapalveluun (Google Apps Script + Google Sheets), lähetysjono (toimii ilman
// verkkoa) ja km-laskenta.
import CONFIG from './config.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
export { LS };

const err = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const configured = () => /^https:\/\/script\.google(usercontent)?\.com\//.test(String(CONFIG.scriptUrl || '').trim());
export const pairKey = (a, b) => [a, b].sort().join('|');
export const HOME = 'KOTI';
const KEY = 'tyoaika.key';

// ---------- Henkilökohtainen avain
// Linkki on muotoa https://<osoite>/#avain=XXXX. Avain tallennetaan puhelimeen ja poistetaan osoiteriviltä.

export function parseKey(text) {
  const s = String(text || '').trim();
  const m = /[#&?]avain=([A-Za-z0-9_-]+)/.exec(s);
  const k = m ? m[1] : /^[A-Za-z0-9_-]{12,}$/.test(s) ? s : '';
  return k.length >= 12 ? k : '';
}

export async function initAuth() {
  if (!configured()) return { state: 'not_configured' };
  const fromUrl = parseKey(location.hash);
  if (fromUrl) {
    if (fromUrl !== LS.get(KEY, '')) LS.del('tyoaika.profile');
    LS.set(KEY, fromUrl);
    history.replaceState(null, '', location.pathname + location.search);
  }
  return LS.get(KEY, '') ? { state: 'signed_in' } : { state: 'signed_out' };
}

export function login(text) {
  const k = parseKey(text);
  if (!k) return false;
  LS.set(KEY, k); LS.del('tyoaika.profile');
  return true;
}
export function logout() {
  LS.del(KEY); LS.del('tyoaika.profile');
  location.reload();
}

// ---------- Taustapalvelu

async function api(action, extra = {}) {
  const key = LS.get(KEY, '');
  if (!key) throw err('signed_out', 'Henkilökohtainen linkki puuttuu');
  let res;
  try {
    // text/plain: ei CORS-esikyselyä (Apps Script ei vastaa niihin)
    res = await fetch(CONFIG.scriptUrl.trim(), {
      method: 'POST', redirect: 'follow', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key, ...extra }),
    });
  } catch (_) {
    throw err('offline', 'Ei yhteyttä taustapalveluun');
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (_) {
    throw err('bad_response', `Taustapalvelu vastasi odottamattomasti (${res.status}). Tarkista, että skripti on julkaistu verkkosovelluksena ja käyttöoikeus on "Kuka tahansa".`);
  }
  if (!data.ok) throw err(data.code || 'error', data.message || 'Tuntematon virhe');
  return data;
}

export async function loadProfile() {
  const { profile } = await api('profile');
  LS.set('tyoaika.profile', profile);
  return profile;
}
export function cachedProfile() { return LS.get('tyoaika.profile', null); }

// ---------- Km-laskenta (sama sääntö kuin taustapalvelussa, joka laskee tallennettavat luvut)

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

// ---------- Lähetysjono: kirjaus tallentuu ensin puhelimeen ja lähtee, kun yhteys toimii

export function outbox() { return LS.get('tyoaika.outbox', []); }
export function queueEntry(payload) {
  const list = outbox().filter((e) => e.date !== payload.date);
  list.push({ ...payload, queuedAt: Date.now() });
  LS.set('tyoaika.outbox', list);
}
// Poisto jonotetaan samalla tavalla; se korvaa saman päivän lähettämättömän tallennuksen.
export function queueDelete(date) {
  const list = outbox().filter((e) => e.date !== date);
  list.push({ date, delete: true, queuedAt: Date.now() });
  LS.set('tyoaika.outbox', list);
}
let flushing = null;
export function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    const results = { sent: 0, failed: [], offline: false };
    if (!LS.get(KEY, '')) return results;
    for (const item of outbox()) {
      try {
        const { queuedAt, delete: del, ...entry } = item;
        if (del) await api('delete', { date: item.date });
        else await api('save', { entry });
        LS.set('tyoaika.outbox', outbox().filter((e) => !(e.date === item.date && e.queuedAt === item.queuedAt)));
        results.sent++;
      } catch (e) {
        if (item.delete && /tuntematon toiminto/i.test(e.message)) { // taustapalvelu on vanha versio
          results.error = err('needs_update', 'Poisto vaatii taustapalvelun päivityksen. Kirjaus poistetaan automaattisesti, kun se on tehty.');
          break;
        }
        if (e.code === 'bad_request') { // virheellinen kirjaus ei korjaannu uudelleenyrityksellä
          LS.set('tyoaika.outbox', outbox().filter((x) => x.queuedAt !== item.queuedAt));
          results.failed.push(item); results.error = e; continue;
        }
        results.offline = e.code === 'offline'; results.error = e; break;
      }
    }
    return results;
  })().finally(() => { flushing = null; });
  return flushing;
}

// ---------- Käyttöönoton tarkistus (?tarkistus)

export async function diagnostics() {
  const steps = [];
  const step = async (name, fn) => {
    try { steps.push({ step: name, ok: true, detail: (await fn()) || '' }); return true; }
    catch (e) { steps.push({ step: name, ok: false, detail: e.message }); return false; }
  };
  if (!(await step('1. Asetukset (config.js)', async () => {
    if (!configured()) throw err('x', 'scriptUrl puuttuu tai ei ole Apps Scriptin verkkosovellusosoite (https://script.google.com/macros/s/…/exec)');
    return CONFIG.scriptUrl.trim().replace(/^(.{48}).*(.{6})$/, '$1…$2');
  }))) return steps;
  if (!(await step('2. Yhteys taustapalveluun', async () => {
    let r;
    try { r = await fetch(CONFIG.scriptUrl.trim(), { cache: 'no-store', redirect: 'follow' }); }
    catch (_) { throw err('x', 'Ei yhteyttä. Tarkista osoite ja että verkkosovelluksen käyttöoikeus on "Kuka tahansa".'); }
    let d; try { d = await r.json(); } catch (_) { throw err('x', `Vastaus ei ollut sovelluksen (${r.status}). Onko oikea skripti julkaistu verkkosovelluksena?`); }
    if (d.app !== 'tyoaikakirjaus') throw err('x', 'Osoitteessa vastaa jokin muu skripti');
    return 'Taustapalvelun versio ' + d.version;
  }))) return steps;
  let p;
  if (!(await step('3. Henkilökohtainen linkki ja taulukko', async () => {
    if (!LS.get(KEY, '')) throw err('x', 'Avaa ensin oma henkilökohtainen linkki tällä laitteella');
    p = (await api('profile')).profile;
    return `${p.name}: ${p.places.length} paikkaa, ${Object.keys(p.distances).length} etäisyyttä, koti–asiakas: ${p.policy === 'deduct' ? 'vähennetään koti–työpaikka' : 'korvataan kokonaan'}`;
  }))) return steps;
  await step('4. Kotietäisyydet', async () => {
    const miss = p.places.filter((x) => typeof p.home[x.id] !== 'number').map((x) => x.name);
    if (miss.length) throw err('x', 'Puuttuu Työntekijät-välilehdeltä: ' + miss.join(', '));
    return `${p.places.length}/${p.places.length} täytetty`;
  });
  await step('5. Kirjaukset', async () => `${p.entries.length} kirjausta välilehdellä "${p.name}"`);
  return steps;
}
