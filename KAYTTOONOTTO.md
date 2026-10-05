# Työaikakirjaus – käyttöönotto-ohje (versio 2)

Sovellus kirjoittaa jokaisen työntekijän kirjaukset suoraan hänen omaan Excel-tiedostoonsa SharePointissa. Erillistä palvelinta, salaisia avaimia tai ylläpitoa vaativia asetuksia ei ole.

| Vaihe | Kuka | Aika |
|---|---|---|
| 1. Tiedostot ja käyttöoikeudet SharePointiin | Työnantajan edustaja | 20 min |
| 2. Sovellus verkkoon (GitHub + Azure) | Toteuttaja (Juuso) | 15 min |
| 3. Sovelluksen rekisteröinti Microsoftille | M365-ylläpitäjä | 5 min |
| 4. Asetukset ja tarkistus | Toteuttaja | 10 min |
| 5. Asennus puhelimiin | Jokainen työntekijä | 2 min |

Kustannukset: Azure Static Web Apps *Free* ja GitHub-yksityisrepositorio ovat maksuttomia. Azure vaatii tilauksen (esim. Pay-As-You-Go), mutta Free-tasosta ei laskuteta.

---

## Miten kokonaisuus toimii

- **Asetukset.xlsx** (kaikki voivat lukea): paikat, asiakkaiden väliset etäisyydet, koti–asiakas-sääntö. Ei henkilötietoja.
- **Työntekijät/‹sähköpostin alkuosa›.xlsx**, esim. `juuso.luukkanen.xlsx` (vain työntekijä itse ja edustajat):
  - *Tiedot*: nimi, kotiosoite, kotietäisyydet
  - *Kirjaukset*: Excel-taulukko, johon sovellus kirjoittaa yhden rivin päivää kohden. Saman päivän uusi kirjaus korvaa vanhan.
- Sovellus kirjautuu työntekijän Microsoft 365 -tunnuksella ja käyttää vain hänen omia oikeuksiaan: se pääsee täsmälleen niihin tiedostoihin, jotka työntekijä itsekin voi avata.
- Kilometrit lasketaan etäisyyksistä. Koti ↔ työpaikka -osuudet ovat aina 0 km.
- Työntekijä voi teknisesti muokata omaa tiedostoaan myös Excelissä. Kaikki muutokset jäävät SharePointin versiohistoriaan (työnantajan päätös 5.10.2026).

| Tieto | Työntekijä | Edustaja |
|---|---|---|
| Omat kirjaukset ja kotietäisyydet | Kyllä (sovellus ja oma tiedosto) | Kyllä |
| Muiden tiedostot | Ei | Kyllä |
| Asetukset.xlsx | Lukuoikeus | Kyllä |

---

## Vaihe 1: Tiedostot ja käyttöoikeudet SharePointiin — **Edustaja**

1. **Sivusto:** SharePoint → **+ Luo sivusto** → **Ryhmäsivusto** → nimi **Työajat**, tietosuoja **Yksityinen**. Lisää jäseniksi työnantajan edustajat.
2. **Työntekijät lukijoiksi:** sivuston oikea yläkulma ⚙ → **Sivuston käyttöoikeudet** → **Jaa vain sivusto** → lisää kaikki työntekijät → oikeus **Lukeminen**. (Näin he voivat lukea Asetukset.xlsx:n.)
3. **Asetukset.xlsx:** lataa tiedosto sivuston **Asiakirjat**-kirjaston juureen.
4. **Työntekijät-kansio:** Asiakirjat → **+ Uusi → Kansio** → nimi **Työntekijät** (täsmälleen näin).
   Kansion ⋯ → **Hallitse käyttöoikeuksia** → **Lisäasetukset / Lopeta käyttöoikeuksien periminen** → poista lukijat (työntekijät) kansiosta, jätä vain edustajat.
5. **Omat tiedostot:** lataa Työntekijät-kansioon henkilökohtaiset tiedostot (`juuso.luukkanen.xlsx` jne.). Nimen on oltava täsmälleen **sähköpostin alkuosa + .xlsx**.
6. **Jaa jokainen tiedosto omalle työntekijälleen:** tiedoston ⋯ → **Jaa** → työntekijän nimi → oikeus **Voi muokata** → Lähetä.
7. **Linkki asetustiedostoon:** Asetukset.xlsx:n ⋯ → **Kopioi linkki** → asetuksista *Henkilöt, joilla on jo käyttöoikeus* → kopioi. Toimita linkki toteuttajalle.

---

## Vaihe 2: Sovellus verkkoon — **Toteuttaja**

1. github.com → **New repository** → `tyoaikakirjaus` → **Private** → Create.
2. Pura `tyoaikakirjaus-sovellus-v2.zip` ja lataa repositorioon (*uploading an existing file*) kansio **`app`** sekä `README.md` ja `KAYTTOONOTTO.md` → Commit.
3. portal.azure.com → **Create a resource → Static Web App**:

   | Kenttä | Arvo |
   |---|---|
   | Resource group | uusi `tyoaika-rg` |
   | Name | `tyoaikakirjaus` |
   | Plan type | **Free** |
   | Source | GitHub → repository `tyoaikakirjaus`, branch `main` |
   | Build Presets | **Custom** |
   | App location | **`/app`** |
   | Api location | **tyhjä** |
   | Output location | **tyhjä** |

4. **Review + create → Create** (julkaisu 3–5 min, GitHubin Actions-välilehdellä vihreä ✓).
5. Kopioi sovelluksen **URL** (esim. `https://kind-sea-0a1b2c3d4.azurestaticapps.net`) = **SOVELLUKSEN-OSOITE**.

---

## Vaihe 3: Sovelluksen rekisteröinti — **Ylläpitäjä** (5 min)

**entra.microsoft.com** → Identity → Applications → **App registrations → + New registration**:

1. Name `Työaikakirjaus`, *Accounts in this organizational directory only (Single tenant)*.
2. Redirect URI: **Single-page application (SPA)** → `SOVELLUKSEN-OSOITE/` (kauttaviiva lopussa) → **Register**.
3. **API permissions → + Add a permission → Microsoft Graph → Delegated permissions** → ✓ `Files.ReadWrite.All` → Add.
   (`User.Read` on valmiina.) Sitten **Grant admin consent for ‹yritys›** → Yes.
4. Kopioi Overview-sivulta **Application (client) ID** ja **Directory (tenant) ID** toteuttajalle.

Salaisuutta (client secret) ei tarvita. Tunnisteet eivät ole salaisia.

> Delegoitu oikeus `Files.ReadWrite.All` tarkoittaa: sovellus voi käsitellä vain niitä tiedostoja, joihin **kirjautuneella käyttäjällä itsellään** on oikeus – ei mitään muuta.

---

## Vaihe 4: Asetukset ja tarkistus — **Toteuttaja**

1. GitHubissa avaa `app/config.js` → kynäkuvake (Edit) → täytä kolme arvoa:
   ```js
   tenantId: 'Directory (tenant) ID',
   clientId: 'Application (client) ID',
   settingsFileUrl: 'Asetukset.xlsx:n linkki vaiheesta 1.7',
   ```
   → **Commit changes**. Julkaisu päivittyy automaattisesti (2–3 min).
2. Avaa tietokoneella **SOVELLUKSEN-OSOITE** → **Kirjaudu Microsoft-tilillä** → hyväksy.
3. Avaa **SOVELLUKSEN-OSOITE/?tarkistus**. Viiden kohdan pitää olla ✅.

| ❌ kohta | Todennäköinen syy |
|---|---|
| 1. Kirjautuminen | Admin consent puuttuu (vaihe 3.3) tai väärä tenant/client ID |
| 2. Tiedostot löytyvät | Linkki config.js:ssä väärin; käyttäjällä ei lukuoikeutta sivustoon (1.2); kansion nimi ei ole *Työntekijät*; oma tiedosto puuttuu, on väärin nimetty tai sitä ei ole jaettu (1.5–1.6) |
| 3. Asetukset.xlsx | Välilehtiä on nimetty uudelleen tai otsikkorivejä muutettu |
| 4. Kotietäisyydet | Omasta tiedostosta puuttuu etäisyyksiä (Tiedot-välilehti) |
| 5. Kirjaukset-taulukko | Kirjaukset-välilehden Excel-taulukko on poistettu tai nimetty uudelleen |

---

## Vaihe 5: Asennus puhelimeen — **Jokainen työntekijä**

> 1. Avaa puhelimen **Chrome**-selaimella **SOVELLUKSEN-OSOITE**.
> 2. **⋮ → Asenna sovellus** (tai *Lisää aloitusnäytölle*). iPhone: Safari → **Jaa → Lisää Koti-valikkoon**.
> 3. Avaa sovellus ja kirjaudu työsähköpostillasi (vain kerran).
>
> Kirjaus: päivämäärä → aloitus → lopetus → reitti → päiväraha ja lisätiedot → **Tallenna**. Toimii myös ilman verkkoa – kirjaus lähtee, kun yhteys palaa. Omat kirjaukset näet **Kirjaukset**-napista.

---

## Edustajan käyttö

**Yhden työntekijän kirjaukset:** avaa hänen tiedostonsa Työntekijät-kansiosta.

**Kaikkien kirjaukset yhteen (koonti):** Excel työpöytäsovelluksessa (Windows) → uusi työkirja →
**Tiedot → Nouda tiedot → Tiedostosta → SharePoint-kansiosta** → anna sivuston osoite (esim. `https://hpddt.sharepoint.com/sites/Tyoajat`) → **Muunna tiedot** → suodata *Folder Path* -sarakkeesta rivit, joissa on `/Työntekijät/` → **Yhdistä tiedostot** → valitse taulukko **Kirjaukset** → OK → Sulje ja lataa.
Tulos on yksi taulukko, jossa sarake *Source.Name* kertoo työntekijän. Päivitys: **Tiedot → Päivitä kaikki**. Tallenna koonti Työajat-sivustolle (ei Työntekijät-kansioon).

**Uusi työntekijä:**
1. Kopioi `POHJA-uusi-tyontekija.xlsx` Työntekijät-kansioon ja nimeä se `‹sähköpostin alkuosa›.xlsx`.
2. Täytä *Tiedot*-välilehti: nimi, sähköposti, kotiosoite ja kotietäisyydet.
3. Jaa tiedosto työntekijälle (**Voi muokata**) ja lisää hänet sivuston lukijaksi (vaihe 1.2).
4. Lähetä vaiheen 5 ohje.

**Työntekijä lopettaa:** poista tiedoston jako (tai M365-tili suljetaan). Tiedosto ja kirjaukset säilyvät.

**Uusi asiakas:** Asetukset.xlsx → rivi Paikat-välilehdelle ja uudet parit Etäisyydet-välilehdelle → lisäksi jokaisen työntekijän tiedostoon *Tiedot*-välilehdelle rivi (Tunnus, Paikka, km).

**Puuttuva etäisyys:** sovellus varoittaa, ja kirjauksen Lisätiedot-kenttään tulee `[Puuttuva etäisyys: …]`. Lisää etäisyys ja pyydä tallentamaan päivä uudelleen.

**Muutosten jäljitys:** tiedoston ⋯ → **Versiohistoria** näyttää jokaisen muutoksen ja muuttajan.

---

## Huomioita nykyisistä tiedoista

- **Hannu:** sähköposti `hpddt@nic.fi` – tiedoston nimi on `hpddt.xlsx`. Jos Hannu kirjautuu Microsoft 365:een eri osoitteella, nimeä tiedosto sen osoitteen alkuosan mukaan.
- **Suvi:** tiedosto `suvi.ojala.xlsx` on tehty, mutta kotietäisyydet puuttuvat.
- **Antto ja Ivan:** tiedostot puuttuvat (sähköposti puuttuu) – tee pohjasta yllä olevan ohjeen mukaan.
