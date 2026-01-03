# Handbok för utlämningspersonal (sv)

Kort guide för dig som lämnar ut matkassar.

## Snabbstart och utrustning

- Logga in med GitHub-kontot (krävs för all personal).
- Byt språk via språkknappen i menyn (sv/en) – samma val syns på alla sidor.
- För dagen-vid-dörren: mobiltelefon är smidigast (se Dagens utdelningar).
- För planering och större ändringar: använd dator.

## Veckoplanering (veckovy)

Översikt över kommande bokningar och beläggning.

- Gå till `Schema` → veckovy för valt utlämningsställe.
- Se beläggning per dag, hitta luckor och flytta tider vid behov (befintliga bokningar).
- Nya bokningar lägger du via hushållskortet eller inskrivningen; använd veckovy för överblick och ombokning.
- Använd veckovy när du planerar kommande dagar/veckor.

## Dagens utlämningar (dagvy)

Arbetsvy för att hantera dagens hämtningar.

- Gå till `Schema` → `Dagens utlämningar` för din favoritplats (eller välj plats i listan).
- Visar bara dagens bokningar, grupperade per tidsfönster, med progressräknare.
- Uppdatera vid behov (dra ner på mobil eller använd uppdatera-knappen).
- Öppna en rad för att se detaljer och markera "Hämtad" eller "Ej hämtad" (no-show).
- Bäst på mobil när du står i dörren.

## Markera ej hämtad (no-show)

Registrera när mottagaren inte hämtar sin matkasse.

- Om mottagaren inte dyker upp: öppna bokningen och markera "Ej hämtad".
- Kan endast göras för dagens eller tidigare bokningar.
- Hjälper till att hålla statistiken korrekt och rensa olösta utlämningar.

## Behöver uppföljning

Ärenden som kräver åtgärd visas på startsidan.

- Röd siffra i navigationen visar antalet olösta ärenden.
- Tre kategorier:
    1. **Olösta utlämningar** – tidigare bokningar utan utfall (markera som hämtad eller ej hämtad)
    2. **Utanför öppettiderna** – kommande bokningar utanför platsens öppettider (omboka)
    3. **Misslyckade SMS** – sändningsfel att hantera
- När alla ärenden är åtgärdade försvinner länken från navigationen.

## Hitta hushåll och boka

Sök upp hushåll och hantera deras bokningar.

- `Hushåll`: sök på namn/telefon, öppna kortet och se historik och kommentarer.
- Skapa nytt hushåll när någon är ny; fyll i namn, telefon och hämtningsplats.
- Boka tider från hushållskortet (hantera bokningar) eller direkt i schemat.
- Telefonnummer visas alltid som +467... (E.164-standard). Om du anger 07... konverteras det automatiskt – detta är avsiktligt.

## Kommentarer

Intern information kopplad till hushållet.

- Lägg till en kommentar i hushållskortet för extra info som inte passar i fälten (t.ex. bud hämtar, önskemål).
- Alla inloggade kan lägga till och ta bort kommentarer.
- **Skriv aldrig känslig information** – inga personnummer, hälsouppgifter, ekonomi eller orsaker till stödbehov.

## Hur SMS fungerar

Automatiska påminnelser till mottagarna.

- SMS skickas automatiskt – du behöver normalt inte göra något manuellt.
- Påminnelsen går 48 timmar före bokad tid.
- Om du lägger till eller flyttar en bokning med mindre än 48 timmar kvar hamnar SMS:et i kön och går ut vid nästa utskick (normalt inom några minuter), inte omedelbart.
- I menyn finns sidan för SMS-översikt: den visar historik och status och används mest vid ovanliga fel (t.ex. fel nummer).
- SMS-mottagaren får länk till sin sida med QR-kod och karta.

## QR-koder och incheckning

Snabb identifiering av mottagare vid utlämning.

- QR-kod är ett hjälpmedel, inte ett krav; du hittar alltid bokningen via `Dagens utlämningar` och kan markera hämtad där.
- Snabbast: be mottagaren öppna QR-koden i sitt SMS på sin egen mobil och skanna med din mobilkamera.
- Alternativ (t.ex. vid laptop): använd QR-scannersidan via länk i navigationen.
- När du öppnar bokningen: kontrollera uppgifter och markera "Hämtad".

## Tips under utdelning

- Håll dig i dagvyn för att undvika att missa sena ankomster; samma dag visas alltid som "kommande" tills du markerar hämtad.
- Lägg en kommentar i hushållskortet om något avviker (t.ex. fel nummer, bud hämtar).
- Vid frågor om plats eller tider: öppna länken i SMS:et – den visar adress och karta.

## Felsökning

**Hittar inte hushållet** – Rensa sökfältet, uppdatera sidan, kontrollera stavning.

**Kan inte markera hämtad** – Kontrollera att bokningen inte redan är markerad eller borttagen.

**Mottagaren fick inget SMS** – Kolla `Behöver uppföljning` eller hushållets SMS-historik. Dela annars länken direkt.

**QR-kod skannar inte** – Höj skärmljusstyrkan, testa annan vinkel, eller sök fram bokningen manuellt i `Dagens utlämningar`.
