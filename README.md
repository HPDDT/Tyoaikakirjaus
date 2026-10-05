# Työaikakirjaus (versio 2)

Työajan, kilometrien ja päivärahojen kirjaus puhelimella. Asennettava verkkosovellus, joka lukee ja kirjoittaa
SharePointin Excel-tiedostoja suoraan kirjautuneen käyttäjän omilla Microsoft 365 -oikeuksilla (Microsoft Graph,
delegoitu `Files.ReadWrite.All`). Ei omaa palvelinta.

- `app/` – koko sovellus (HTML/CSS/JS, ei käännösvaihetta). Microsoftin kirjautumiskirjasto ladataan jsDelivristä.
- `app/config.js` – kolme käyttöönottokohtaista arvoa (tenant, client ID, Asetukset.xlsx:n linkki)
- `KAYTTOONOTTO.md` – vaiheittainen ohje

Tiedostot SharePointissa:
- `Asetukset.xlsx` – Paikat, Etäisyydet, Asetukset (kaikki lukevat)
- `Työntekijät/<sähköpostin alkuosa>.xlsx` – Tiedot (kotietäisyydet) + Excel-taulukko `Kirjaukset` (vain oma + edustajat)

Käyttöönoton tarkistus: `/?tarkistus`.
