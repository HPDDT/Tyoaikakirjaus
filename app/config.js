// Sovelluksen asetukset – täytä nämä kerran käyttöönoton yhteydessä (ks. KAYTTOONOTTO.md).
// Arvot eivät ole salaisia: ne näkyvät joka tapauksessa selaimelle.
export default {
  // Microsoft Entra -hallintakeskus → App registrations → Työaikakirjaus → Overview
  tenantId: 'TÄYTÄ-Directory-tenant-ID',
  clientId: 'TÄYTÄ-Application-client-ID',

  // Asetukset.xlsx:n linkki SharePointista: tiedoston ⋯-valikko → Kopioi linkki
  settingsFileUrl: 'TÄYTÄ-Asetukset.xlsx-linkki',

  // Kansio (samassa tiedostokirjastossa kuin Asetukset.xlsx), jossa työntekijöiden omat tiedostot ovat.
  // Tiedoston nimi = sähköpostin alkuosa, esim. juuso.luukkanen@hpddt.fi → juuso.luukkanen.xlsx
  employeeFolder: 'Työntekijät',
};
