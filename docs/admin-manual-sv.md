# Adminhandbok – Inställningar

Den här handboken vänder sig till dig som sätter upp systemet – utlämningsställen, öppettider, registreringsformulär och liknande. Du behöver administratörsrollen. För det dagliga handläggararbetet (registrera hushåll, schemalägga matkassar, följa upp ärenden), se [Handläggarhandboken](./case-worker).

## Lägga till ny personal

Nya personer som ska börja arbeta i Matcentralen behöver gå igenom ett antal steg innan de kan logga in. Som administratör hjälper du dem genom processen.

**Förutsättningar som personen själv måste ordna:**

1. **GitHub-konto** – skapas kostnadsfritt på [github.com](https://github.com/join). Användarnamnet behöver inte vara ett riktigt namn; välj gärna något neutralt (t.ex. `förnamn-vs`).
2. **Säker tvåfaktorsautentisering på GitHub** – organisationen godkänner endast säkra metoder:
    - **GitHub Mobile-appen** (enklaste alternativet – bara en notis att godkänna)
    - **Passkey** (Face ID, Touch ID, Windows Hello)
    - **Autentiseringsapp** (Google Authenticator, Authy, Microsoft Authenticator)
    - **SMS godkänns inte** – det räknas inte som säker tvåfaktorsautentisering. Om personen bara har SMS aktiverat kommer inloggningen att misslyckas.
    - Stegvisa instruktioner visas automatiskt på inloggningssidan om något är fel.

**Steg som du som admin gör:**

3. **Bjud in personen till GitHub-organisationen `vasteras-stadsmission`**:
    - Gå till [github.com/orgs/vasteras-stadsmission/people](https://github.com/orgs/vasteras-stadsmission/people) → `Invite member`.
    - Ange personens GitHub-användarnamn eller e-postadress. Skicka inbjudan.
    - Personen får ett mejl från GitHub och behöver klicka på länken för att acceptera inbjudan. Om personen inte ser inbjudan kan de kontrollera [github.com/orgs/vasteras-stadsmission/invitation](https://github.com/orgs/vasteras-stadsmission/invitation) direkt.
4. **Första inloggningen**: När personen loggar in första gången skapas deras konto automatiskt med rollen **Utlämningspersonal**. Be dem fylla i sitt riktiga namn (för- och efternamn) när de blir ombedda – det visas i gränssnittet.
5. **Om personen ska bli administratör**: Gå till `Inställningar` → `Användare`, hitta personen i listan och ändra rollen till `Administratör`. Ändringen syns inom fem minuter (eller direkt om personen loggar ut och in). Administratörer har åtkomst till alla delar av systemet (hushåll, inställningar, statistik och användarhantering).

**Vanliga fel vid inloggning:**

- **"GitHub nekade åtkomst"** – Personen behöver aktivera en säker tvåfaktormetod (se ovan). Stegvisa instruktioner visas på sidan.
- **"Du har en väntande inbjudan"** – Personen har fått inbjudan men har inte accepterat den än. Använd knappen "Kontrollera väntande inbjudningar på GitHub" på felsidan.
- **"Inte medlem i organisationen"** – Personen har inget GitHub-konto i organisationen. Antingen har du inte skickat inbjudan än, eller så har personen loggat in med fel GitHub-konto.

## Verifieringschecklista

Kontrollpunkter som personal måste bekräfta vid inskrivning av nya hushåll.

- Gå till `Inställningar` → `Registreringsformulär`.
- Checklistan visas för personalen i inskrivningsflödet som "Jag har säkerställt att...".
- Lägg till punkt: fyll i text på svenska och engelska, markera om den är obligatorisk och lägg till ev. hjälptext.
- Ändra ordning genom att dra punkterna; sparas direkt.
- Redigering eller borttagning påverkar nya inskrivningar. Befintliga anteckningar ligger kvar.

## Utlämningsställen

Fysiska platser där matkassar lämnas ut.

- Gå till `Inställningar` → `Utlämningsställen`.
- Skapa eller öppna en platsflik och fyll i:
    - Namn, gatuadress och postnummer (obligatoriska)
    - Max antal kassar per dag och per tidsslot (valfritt)
    - Slotlängd i minuter (15-minutersintervall)
    - Kontaktperson (namn, e-post, telefon) – syns endast internt
- Spara platsen innan du går vidare till scheman. Radering kräver bekräftelse – säkerställ att bokningar har flyttats.

## Scheman och öppettider (per plats)

Styr vilka dagar och tider bokningar kan göras på varje utlämningsställe.

- Efter att platsen är sparad: öppna fliken `Scheman`.
- Skapa scheman med namn, start- och slutvecka och markera vilka veckodagar som är öppna samt tidsintervall.
- Överlapp är inte tillåtet. Vid specialveckor: gör ett schema fram till veckan före, ett separat schema för specialveckan, och därefter ett nytt schema för efterföljande veckor.
- Vid ändring eller borttagning visar systemet hur många bokningar som påverkas; flytta dem först vid behov.
- Slot-längden för nya tider styrs av värdet från platsens grundflik.

## Varningsgräns för matkassar

Varningssystem för att identifiera hushåll med högt antal matkassar.

- Gå till `Inställningar` → `Varningsgräns för matkassar`.
- Ange en gräns för antal kassar varefter systemet visar en varning.
- När ett hushåll överskrider gränsen visas varning på hushållskortet och vid bokningar.
- Hjälper till att identifiera hushåll som kan behöva extra stöd eller genomgång.
- Lämna fältet tomt för att stänga av varningen.

## Rekommenderat arbetssätt

- Gör plats- och schemaändringar på dator för bäst överblick.
- Efter schemaändringar: kontrollera `Veckoschema` i `Schema` så att tiderna ser rätt ut.
- Lös ärenden på startsidan regelbundet (oregistrerade utlämningar, fel i SMS osv.).

## Felsökning

**Kan inte ta bort plats** – Platsen har kommande bokningar. Flytta eller ta bort dem först.

**Schemat sparades inte** – Klicka "Spara" innan du navigerar bort. Kontrollera att start/slutvecka inte överlappar annat schema.

**Platsen syns inte i rullistan** – Uppdatera sidan eller rensa webbläsarens cache.

**Kapacitetsvarning ignoreras** – Kapacitet är en mjuk gräns (varnar men blockerar inte). Personal måste själva respektera gränsen.
