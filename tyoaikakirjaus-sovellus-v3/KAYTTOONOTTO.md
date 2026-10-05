# Työaikakirjaus – käyttöönotto-ohje (versio 3, Google Sheets)

Kirjaukset tallentuvat yhteen Google Sheets -taulukkoon työnantajan Google-tilillä. Taulukon sisällä oleva pieni skripti (Apps Script) toimii sovelluksen taustapalveluna. Sovellus julkaistaan ilmaiseksi GitHub Pagesissa. Microsoft 365 -yritystiliä, Azurea tai maksullisia palveluita ei tarvita.

| Vaihe | Kuka | Aika |
|---|---|---|
| 1. Taulukko Google Sheetsiin | Työnantajan edustaja | 10 min |
| 2. Taustapalvelun julkaisu (Apps Script) | Edustaja (taulukon omistaja) | 10 min |
| 3. Sovellus verkkoon (GitHub Pages) | Toteuttaja (Juuso) | 10 min |
| 4. Osoitteet paikoilleen ja tarkistus | Toteuttaja + edustaja | 5 min |
| 5. Linkit työntekijöille ja asennus | Edustaja + jokainen työntekijä | 2 min / hlö |

## Miten kokonaisuus toimii

- **Tyoaikakirjaus-taulukko** (vain edustajat näkevät):
  - *Työntekijät*: nimi, kotiosoite, kotietäisyydet ja henkilökohtainen avain + valmis linkki
  - *Paikat*, *Etäisyydet*, *Asetukset*: kuten ennenkin
  - *Juuso*, *Marko*, … : jokaisen työntekijän oma välilehti, johon sovellus kirjoittaa yhden rivin päivää kohden. Saman päivän uusi kirjaus korvaa vanhan.
  - *Koonti*: kaikkien kirjaukset yhdessä (valikosta *Työaikakirjaus → Päivitä koonti*)
- **Kirjautuminen = henkilökohtainen linkki.** Työntekijä saa linkin kerran, ja sovellus muistaa sen. Google-tiliä ei tarvita.
- Työntekijä näkee sovelluksessa vain omat kirjauksensa. Taulukkoa ei jaeta työntekijöille.
- Linkki toimii kuin salasana: jos se joutuu vääriin käsiin, edustaja vaihtaa avaimen ja vanha linkki lakkaa toimimasta.
- Kilometrit lasketaan taulukon etäisyyksistä. Koti ↔ työpaikka -osuudet ovat aina 0 km.

---

## Vaihe 1: Taulukko Google Sheetsiin — Edustaja

Tarvitaan työnantajan Google-tili. Jos sellaista ei ole, sen voi luoda ilmaiseksi osoitteessa accounts.google.com (*Luo tili → Työ tai yritys* tai *Käytä nykyistä sähköpostiosoitettani*).

1. Avaa **drive.google.com** → **+ Uusi → Tiedoston lataus** → valitse `Tyoaikakirjaus.xlsx`.
2. Avaa ladattu tiedosto → **Tiedosto → Tallenna Google Sheets -muodossa**. Uusi Google-taulukko aukeaa. Ladatun .xlsx-tiedoston voi poistaa Drivesta.
3. **Tiedosto → Asetukset**: Kieliasetus **Suomi**, Aikavyöhyke **(GMT+02:00) Helsinki** → Tallenna asetukset.
4. Jos edustajia on useampi: **Jaa** → lisää muut edustajat → **Muokkaaja**. **Älä jaa taulukkoa työntekijöille.**

## Vaihe 2: Taustapalvelun julkaisu — Edustaja (taulukon omistaja)

Skripti toimii taulukon omistajan nimissä, joten omistaja tekee tämän.

1. Taulukossa **Laajennukset → Apps Script**.
2. Poista editorin valmis sisältö (`function myFunction() …`) ja liitä tilalle tiedoston `Koodi.gs` koko sisältö. Nimeä projekti vasemmasta yläkulmasta *Työaikakirjaus* → tallenna (levykekuvake).
3. **Ota käyttöön → Uusi käyttöönotto** → rataskuvake *Valitse tyyppi* → **Verkkosovellus**:

   | Kenttä | Arvo |
   |---|---|
   | Kuvaus | Työaikakirjaus |
   | Suorita käyttäjänä | **Minä** |
   | Kenellä on käyttöoikeus | **Kuka tahansa** |

4. **Ota käyttöön** → **Valtuuta käyttöoikeus** → valitse oma tili. Google varoittaa *"Google ei ole vahvistanut tätä sovellusta"* – se on normaalia omalle skriptille: **Lisäasetukset → Siirry kohteeseen Työaikakirjaus (vaarallinen)** → **Salli**.
5. Kopioi **Verkkosovellus-URL** (päättyy `/exec`) ja toimita se toteuttajalle.
6. Palaa taulukkoon ja päivitä sivu: yläpalkkiin ilmestyy **Työaikakirjaus**-valikko.

> *Kuka tahansa* tarkoittaa, että osoitteeseen voi ottaa yhteyttä ilman Google-tiliä. Ilman voimassa olevaa henkilökohtaista avainta skripti ei kuitenkaan näytä eikä tallenna mitään.

**Jos skriptiä myöhemmin päivitetään:** liitä uusi koodi → **Ota käyttöön → Hallinnoi käyttöönottoja** → kynäkuvake → Versio: **Uusi versio** → Ota käyttöön. Osoite pysyy samana.

## Vaihe 3: Sovellus verkkoon — Toteuttaja

1. github.com → **New repository** → nimi `tyoaikakirjaus` → **Public** → Create repository.
   (Jos teit aiemmin yksityisen repositorion: *Settings → General → Danger Zone → Change visibility → Public*, ja poista vanha `app`-kansio. GitHub Pages on ilmainen vain julkisille repositorioille. Koodissa ei ole salaisuuksia – tiedot ovat Googlessa avaimen takana.)
2. Pura `tyoaikakirjaus-sovellus-v3.zip` ja vedä **kansion sisältö** (index.html, app.js, … sekä kansiot icons ja google) repositorion sivulle (*uploading an existing file*) → **Commit changes**.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, kansio **/ (root)** → Save.
4. 1–2 minuutin päästä sivun yläreunaan tulee osoite, esim. `https://kayttaja.github.io/tyoaikakirjaus/` = **SOVELLUKSEN-OSOITE**.

## Vaihe 4: Osoitteet paikoilleen ja tarkistus

1. **GitHub** (toteuttaja): avaa `config.js` → kynäkuvake → korvaa rivi:
   ```js
   scriptUrl: 'https://script.google.com/macros/s/…/exec',
   ```
   (vaiheen 2.5 osoite) → **Commit changes**. Päivittyy 1–2 minuutissa.
2. **Taulukko** (edustaja): *Asetukset*-välilehden solu **B8** = SOVELLUKSEN-OSOITE. *Työntekijät*-välilehden **Linkki**-sarake täyttyy itsestään.
3. Avaa tietokoneella oma linkkisi (*Työntekijät* → oma rivi → Linkki). Sovellus aukeaa nimelläsi.
4. Avaa **SOVELLUKSEN-OSOITE?tarkistus**. Kaikkien viiden kohdan pitää olla ✅.

| ❌ kohta | Todennäköinen syy |
|---|---|
| 1. Asetukset | `config.js`:n scriptUrl puuttuu tai on väärä (pitää alkaa `https://script.google.com/macros/s/` ja päättyä `/exec`) |
| 2. Yhteys taustapalveluun | Käyttöönotossa ei ole *Kuka tahansa*, osoite on kopioitu väärin tai skriptiä ei ole julkaistu verkkosovelluksena |
| 3. Henkilökohtainen linkki ja taulukko | Linkkiä ei ole avattu tällä laitteella, avain on muuttunut, tai välilehtien nimiä/otsikoita on muutettu |
| 4. Kotietäisyydet | Työntekijän riviltä puuttuu kotietäisyyksiä |
| 5. Kirjaukset | Työntekijän välilehti on nimetty eri tavalla kuin Nimi-sarakkeessa |

## Vaihe 5: Linkit työntekijöille ja asennus

**Edustaja:** lähetä jokaiselle hänen oma linkkinsä *Linkki*-sarakkeesta yksityisesti (sähköposti, tekstiviesti tai WhatsApp). Älä lähetä linkkejä ryhmäviestinä.

**Työntekijälle lähetettävä ohje:**

> **Android:** avaa saamasi linkki puhelimen **Chrome**-selaimessa → **⋮ → Asenna sovellus** (tai *Lisää aloitusnäytölle*). Valmis – sovellus muistaa sinut.
>
> **iPhone:** avaa linkki **Safarissa** → **Jaa → Lisää Koti-valikkoon**. Avaa sovellus kotinäytöltä, kopioi linkki viestistä uudelleen, liitä se kenttään ja paina **Jatka** (vain kerran).
>
> Kirjaus: päivämäärä → aloitus → lopetus → reitti → päiväraha ja lisätiedot → **Tallenna**. Toimii myös ilman verkkoa – kirjaus lähtee, kun yhteys palaa. Omat kirjaukset näet **Kirjaukset**-napista.

---

## Edustajan käyttö

**Kirjaukset:** jokaisella työntekijällä on oma välilehti. **Työaikakirjaus → Päivitä koonti** kokoaa kaikkien kirjaukset *Koonti*-välilehdelle päivämäärän mukaan. Siitä voi tehdä esim. **Lisää → Pivot-taulukko** (rivit: Työntekijä, arvot: Tunnit ja Km yhteensä).

**Uusi työntekijä:** lisää rivi *Työntekijät*-välilehdelle (nimi, kotiosoite, kotietäisyydet) → **Työaikakirjaus → Luo puuttuvat avaimet** → lähetä hänelle Linkki-sarakkeen linkki ja vaiheen 5 ohje. Välilehti luodaan automaattisesti ensimmäisestä kirjauksesta.

**Työntekijä lopettaa:** tyhjennä hänen *Avain*-solunsa. Linkki lakkaa toimimasta, kirjaukset säilyvät.

**Linkki joutui vääriin käsiin / puhelin katosi:** valitse työntekijän rivi → **Työaikakirjaus → Vaihda valitun työntekijän avain** → lähetä uusi linkki.

**Nimen muutos:** jos muutat Nimi-sarakkeen nimeä, nimeä myös hänen välilehtensä samaksi.

**Uusi asiakas:** rivi *Paikat*-välilehdelle → uudet parit *Etäisyydet*-välilehdelle → *Työntekijät*-välilehdelle uusi sarake viimeisen paikan vasemmalle puolelle (tunnus riville 4, nimi riville 5) ja kotietäisyydet.

**Puuttuva etäisyys:** sovellus varoittaa, ja kirjauksen Lisätiedot-kenttään tulee `[Puuttuva etäisyys: …]`. Lisää etäisyys ja pyydä tallentamaan päivä uudelleen.

**Muutosten jäljitys:** **Tiedosto → Versiohistoria → Näytä versiohistoria.**

---

## Huomioita nykyisistä tiedoista

- **Kaikilla kahdeksalla** (myös Ivanilla) on valmiina avain, joten linkit syntyvät heti, kun Asetukset!B8 on täytetty. Sähköpostiosoitetta ei enää tarvita kirjautumiseen.
- **Antto ja Ivan:** kotiosoite ja kotietäisyydet puuttuvat – täytä ennen kuin he alkavat käyttää sovellusta.
