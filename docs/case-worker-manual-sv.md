# Handbok för handläggare (sv)

Kort guide för dig som registrerar hushåll och schemalägger matkassar.

## Snabbstart

- Logga in med GitHub-kontot (krävs för all personal).
- Byt språk via språkknappen i menyn (sv/en).
- Använd helst dator för inskrivning och schemaläggning.

## Skapa nytt hushåll

Gå till `Hushåll` → `Nytt hushåll`. Guiden har följande steg:

1. **Grunduppgifter**
    - Förnamn (obligatoriskt)
    - Efternamn (obligatoriskt)
    - Telefonnummer (obligatoriskt, endast svenska mobilnummer)
    - SMS-samtycke (obligatoriskt för att kunna skicka påminnelser)
    - Språk (standard: svenska)
    - Postnummer (valfritt)
2. **Medlemmar** – Lägg till hushållsmedlemmar med ålder och kön.
3. **Matrestriktioner** – Välj från lista eller lägg till egna.
4. **Husdjur** – Välj från lista eller lägg till egna.
5. **Ytterligare behov** – Rullstolsanpassning, tolk, etc.
6. **Verifiering** – Bekräfta obligatoriska kontroller (visas endast om admin har konfigurerat frågor).
7. **Sammanfattning** – Granska och spara.

Innan hushållet sparas visas en bekräftelsedialog om att du har informerat hushållet om hur deras personuppgifter behandlas.

**Efter att hushållet sparats:**

- Ett välkomst-SMS med länk till integritetspolicyn skickas automatiskt (om SMS-samtycke gavs).
- En dialog frågar om du vill schemalägga matkassar direkt eller göra det senare.

Telefonnummer visas alltid som +467... (E.164-standard). Om du anger 07... konverteras det automatiskt – detta är avsiktligt.

## Schemalägg matkassar

Boka in hämtningstider för hushållet.

**Från hushållskortet:**

- Öppna hushållet → `Hantera matkassar`
- Välj hämtplats och lägg till datum/tider
- Klicka `Spara matkassar`

**Från schemat:**

- Gå till `Schema` → välj utlämningsställe → veckovy
- Klicka på en ledig tid och välj hushåll

## Ändra eller ta bort matkassar

Omboka eller avboka redan schemalagda hämtningar.

- Öppna hushållet → `Hantera matkassar`
- Ändra datum/tid eller ta bort raden
- Spara ändringarna

Alternativt: öppna bokningen i schemat och välj `Omboka` eller `Ta bort`.

## Hur SMS fungerar

Systemet skickar SMS automatiskt vid olika händelser.

- **Välkomst-SMS** skickas vid inskrivning med länk till integritetspolicyn.
- **Påminnelse** skickas automatiskt 48 timmar före bokad tid.
- **Uppdatering** skickas om du ändrar en bokning efter att påminnelsen gått ut.
- **Avbokning** skickas om du tar bort en bokning efter att påminnelsen gått ut.
- **Avslutsmeddelande** skickas automatiskt när hushållet inte har fler bokningar (48 timmar efter sista hämtning).

Om bokningen är inom 48 timmar skickas SMS vid nästa utskick (normalt inom några minuter).

## Kommentarer

Intern information kopplad till hushållet.

- Lägg till kommentarer i hushållskortet för extra info (t.ex. bud hämtar, önskemål).
- Alla inloggade kan lägga till och ta bort kommentarer.
- **Skriv aldrig känslig information** – inga personnummer, hälsouppgifter, ekonomi eller orsaker till stödbehov.

## Behöver uppföljning

Startsidan visar ärenden som behöver åtgärdas:

1. **Olösta utlämningar** – tidigare bokningar utan utfall.
2. **Utanför öppettiderna** – bokningar utanför platsens öppettider.
3. **Misslyckade SMS** – sändningsfel att hantera.

## Felsökning

**Telefonnummer godkänns inte** – Endast svenska mobilnummer stöds. Ange utan landskod eller med +46.

**Hushållet finns redan** – Systemet varnar om liknande namn eller samma telefonnummer redan finns.

**Kan inte boka på viss tid** – Kontrollera att utlämningsstället har öppet den dagen/tiden i `Schema`.

**SMS skickades inte** – Kontrollera att SMS-samtycke är markerat. Kolla `Behöver uppföljning` på startsidan.
