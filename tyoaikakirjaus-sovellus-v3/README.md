# Työaikakirjaus (versio 3)

Työajan, kilometrien ja päivärahojen kirjaus puhelimella. Asennettava verkkosovellus (GitHub Pages), joka tallentaa
kirjaukset Google Sheets -taulukkoon taulukon oman Apps Script -taustapalvelun kautta.

- Juurikansio – koko sovellus (HTML/CSS/JS, ei käännösvaihetta eikä ulkoisia kirjastoja)
- `config.js` – taustapalvelun osoite
- `google/Koodi.gs` – Apps Script -koodi, joka liitetään taulukkoon
- `KAYTTOONOTTO.md` – vaiheittainen ohje

Työntekijä tunnistetaan henkilökohtaisesta linkistä (`…/#avain=…`), jonka avain on taulukon Työntekijät-välilehdellä.
Käyttöönoton tarkistus: `?tarkistus`.
