# Handbok för handläggare (sv)

Kort guide för dig som registrerar hushåll och schemalägger matkassar. Kan skrivas ut eller sparas som PDF.

## Snabbstart

- Logga in med GitHub-kontot (krävs för all personal).
- Byt språk via språkknappen i menyn (sv/en).
- Använd helst dator för inskrivning och schemaläggning.

## Skapa nytt hushåll

Gå till `Hushåll` → `Nytt hushåll`. Guiden har följande steg:

1. **Grunduppgifter** – Förnamn, efternamn, telefonnummer (obligatoriskt), adress, hämtplats.
2. **Medlemmar** – Lägg till hushållsmedlemmar med ålder och kön.
3. **Matrestriktioner** – Välj från lista eller lägg till egna.
4. **Husdjur** – Ange eventuella husdjur.
5. **Ytterligare behov** – Rullstolsanpassning, tolk, etc.
6. **Verifiering** – Bekräfta obligatoriska kontroller (konfigureras av admin).
7. **Matkassar** – Schemalägg första matkassarna direkt (valfritt).
8. **Sammanfattning** – Granska och spara.

Telefonnummer visas alltid som +467... (E.164-standard). Om du anger 07... konverteras det automatiskt – detta är avsiktligt.

## Schemalägg matkassar

**Från hushållskortet:**
- Öppna hushållet → `Hantera matkassar`
- Välj hämtplats och lägg till datum/tider
- Klicka `Spara matkassar`

**Från schemat:**
- Gå till `Schema` → välj utlämningsställe → veckovy
- Klicka på en ledig tid och välj hushåll

## Ändra eller ta bort matkassar

- Öppna hushållet → `Hantera matkassar`
- Ändra datum/tid eller ta bort raden
- Spara ändringarna

Alternativt: öppna bokningen i schemat och välj `Omboka` eller `Ta bort`.

## Hur SMS fungerar

- **Påminnelse** skickas automatiskt 48 timmar före bokad tid.
- **Uppdatering** skickas om du ändrar en bokning efter att påminnelsen gått ut.
- **Avbokning** skickas om du tar bort en bokning efter att påminnelsen gått ut.
- **Avslutsmeddelande** skickas automatiskt när hushållet inte har fler bokningar (48 timmar efter sista hämtning).

Om bokningen är inom 48 timmar skickas SMS vid nästa utskick (normalt inom några minuter).

## Kommentarer

- Lägg till kommentarer i hushållskortet för extra info (t.ex. bud hämtar, önskemål).
- Kommentarer syns för all personal och visar vem som skrev.
- **Skriv aldrig känslig information** – inga personnummer, hälsouppgifter, ekonomi eller orsaker till stödbehov.

## Behöver uppföljning

Startsidan visar ärenden som behöver åtgärdas:

1. **Olösta utlämningar** – tidigare bokningar utan utfall.
2. **Utanför öppettiderna** – bokningar utanför platsens öppettider.
3. **Misslyckade SMS** – sändningsfel att hantera.

## Felsökning

**Telefonnummer godkänns inte** – Använd svenskt format: +46XXXXXXXXX eller 07XXXXXXXX (inga mellanslag).

**Hushållet finns redan** – Systemet varnar om liknande namn eller samma telefonnummer redan finns.

**Kan inte boka på viss tid** – Kontrollera att utlämningsstället har öppet den dagen/tiden.

**SMS skickades inte** – Kolla `Behöver uppföljning` på startsidan eller hushållets SMS-historik.
