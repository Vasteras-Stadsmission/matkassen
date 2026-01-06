# Matcentralen - Användarguide

Den här guiden visar hur Matcentralen fungerar för personal och mottagare.

---

## Navigationsöversikt

Så här är webbplatsen uppbyggd:

```mermaid
flowchart TB
    subgraph Personalens sidor
        Start["🏠 Startsida<br/>(Uppföljning)"]

        Schema["📅 Schema"]
        Hushall["👥 Hushåll"]
        Statistik["📊 Statistik"]
        Installningar["⚙️ Inställningar"]

        Start --> Schema
        Start --> Hushall
        Start --> Statistik
        Start --> Installningar

        Schema --> DagensUtlamningar["Dagens utlämningar"]
        Schema --> Veckoschema["Veckoschema"]

        Hushall --> NyttHushall["Nytt hushåll"]
        Hushall --> HushallDetalj["Hushållsdetaljer"]
        HushallDetalj --> RedigeraHushall["Redigera hushåll"]
        HushallDetalj --> HanteraMatkassar["Hantera matkassar"]

        Installningar --> AllmannaInst["Allmänna"]
        Installningar --> Platser["Utlämningsställen"]
        Installningar --> Matkassegranser["Matkassegränser"]
    end

    subgraph Mottagarens sida
        Mottagare["📱 Matpaket-sida<br/>(öppen för alla)"]
    end

    DagensUtlamningar -.->|"QR-kod<br/>kopplar ihop"| Mottagare
```

---

## Uppgift 1: Dela ut matkasse

Det här är den vanligaste uppgiften – att lämna ut en matkasse till ett hushåll.

```mermaid
flowchart TD
    subgraph Personal
        P1["1. Gå till Schema"]
        P2["2. Välj ditt utlämningsställe"]
        P3["3. Klicka på 'Dagens utlämningar'"]
        P4["4. Se listan med dagens matkassar"]
        P5["5. Mottagare visar sin QR-kod"]
        P6["6. Skanna QR-koden<br/>(eller klicka på matkassen i listan)"]
        P7["7. Granska hushållsinformation"]
        P8["8. Klicka 'Markera som utlämnad'"]
        P9["✅ Klart! Matkassen är registrerad"]

        P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8 --> P9
    end

    subgraph Mottagare
        M1["Får SMS med länk"]
        M2["Öppnar länken i mobilen"]
        M3["Ser tid, plats och QR-kod"]
        M4["Kommer till utlämningsstället"]
        M5["Visar QR-koden för personal"]
        M6["Får sin matkasse"]

        M1 --> M2 --> M3 --> M4 --> M5 --> M6
    end

    P5 -.->|"Möts vid<br/>utlämning"| M5
```

### Vad du ser på skärmen

| Steg | Vad du ser |
|------|------------|
| Dagens utlämningar | Lista med alla matkassar för dagen, visar namn och tid |
| Matkassedialog | Hushållets kontaktinfo, medlemmar, matrestriktioner, husdjur |
| Efter utlämning | Grön bock visar att matkassen är utlämnad |

### Om något går fel

| Situation | Vad du gör |
|-----------|------------|
| Mottagare kommer inte | Klicka "Utebliven" |
| Fel person? | Kontrollera namn och telefonnummer |
| Klickade fel? | Klicka "Ångra utlämning" |

---

## Uppgift 2: Registrera nytt hushåll

När ett nytt hushåll ska få matkassar fyller du i ett formulär i flera steg.

```mermaid
flowchart TD
    H1["1. Gå till Hushåll"]
    H2["2. Klicka 'Nytt hushåll'"]

    subgraph Steg för steg
        S1["Steg 1: Grunduppgifter<br/>Namn, telefon, postnummer, språk"]
        S2["Steg 2: Medlemmar<br/>Ålder och kön för alla i hushållet"]
        S3["Steg 3: Matrestriktioner<br/>Halal, vegetariskt, allergier..."]
        S4["Steg 4: Husdjur<br/>Hund, katt, annat"]
        S5["Steg 5: Ytterligare behov<br/>Hygienartiklar, barnartiklar..."]
        S6["Steg 6: Verifiering<br/>Bekräfta checklista"]
        S7["Steg 7: Matkassar<br/>Välj datum och tider"]
        S8["Steg 8: Sammanfattning<br/>Granska och bekräfta"]
    end

    H1 --> H2 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8

    S8 --> Klar["✅ Hushållet är registrerat!<br/>SMS skickas automatiskt"]
```

### Tips vid registrering

- **Telefonnummer**: Måste vara svenskt (+46)
- **SMS-samtycke**: Krävs för att kunna skicka påminnelser
- **Dubbletter**: Systemet varnar om telefonnummer redan finns
- **Liknande namn**: Du får en varning om ett liknande hushåll redan finns

---

## Uppgift 3: Hantera problem (Uppföljning)

Startsidan visar saker som behöver åtgärdas.

```mermaid
flowchart TD
    Start["🏠 Startsida (Uppföljning)"]

    Start --> Problem1
    Start --> Problem2
    Start --> Problem3

    subgraph Problem1["Oregistrerade utlämningar"]
        O1["Matkasse som borde<br/>ha lämnats ut igår"]
        O1 --> O2{"Vad hände?"}
        O2 -->|"Glömde registrera"| O3["Klicka 'Utlämnad'"]
        O2 -->|"Kom aldrig"| O4["Klicka 'Uteblev'"]
    end

    subgraph Problem2["Utanför öppettider"]
        U1["Matkasse bokad när<br/>det är stängt"]
        U1 --> U2{"Åtgärd"}
        U2 --> U3["Klicka 'Omboka'<br/>Välj ny tid"]
        U2 --> U4["Klicka 'Avboka'<br/>Om ej aktuellt"]
    end

    subgraph Problem3["Misslyckade SMS"]
        S1["SMS kunde inte<br/>levereras"]
        S1 --> S2{"Åtgärd"}
        S2 --> S3["Klicka 'Försök igen'"]
        S2 --> S4["Redigera hushåll<br/>(fel telefonnummer?)"]
        S2 --> S5["Klicka 'Ignorera'<br/>(om inte aktuellt)"]
    end
```

### Problemtyper i korthet

| Typ | Vad det betyder | Vanlig lösning |
|-----|-----------------|----------------|
| 🟣 Oregistrerad utlämning | En matkasse från igår är inte markerad | Markera som utlämnad eller utebliven |
| 🔵 Utanför öppettider | Matkasse bokad på stängd dag/tid | Omboka till annan tid |
| 🟤 Misslyckat SMS | Meddelandet nådde inte fram | Försök igen eller kontrollera telefonnummer |

---

## Uppgift 4: Mottagarens resa

Så här ser det ut för den som får matkassen.

```mermaid
flowchart TD
    subgraph Mottagarens upplevelse
        R1["📱 Får SMS ca 48h innan<br/>med länk till sin sida"]
        R2["Klickar på länken"]
        R3["Ser sin matpaket-sida"]

        subgraph Sidan visar
            I1["📍 Plats och adress"]
            I2["🕐 Tid för hämtning"]
            I3["📊 QR-kod"]
            I4["🗺️ Knapp: Vägbeskrivning"]
        end

        R1 --> R2 --> R3
        R3 --> I1
        R3 --> I2
        R3 --> I3
        R3 --> I4

        R4["Går till utlämningsstället"]
        R5["Visar QR-koden"]
        R6["Får sin matkasse"]

        I4 --> R4 --> R5 --> R6
    end
```

### Statusar som mottagaren kan se

| Status | Färg | Betydelse |
|--------|------|-----------|
| Planerad | Grå | Väntar på hämtningsdagen |
| Redo för upphämtning | Grön | Dags att hämta! |
| Upphämtad | Blå | Redan hämtad |
| Förfallen | Orange | Tiden har gått ut |
| Inställd | Röd | Avbokad |

### Språkstöd

Mottagaren kan välja bland många språk: svenska, engelska, arabiska, somaliska, ukrainska med flera.

---

## Snabbreferens: Alla sidor

| Sida | Vad du gör där |
|------|----------------|
| **Uppföljning** (Startsida) | Se och åtgärda problem |
| **Schema** | Välj utlämningsställe |
| **Dagens utlämningar** | Lämna ut matkassar, skanna QR |
| **Veckoschema** | Se hela veckans bokningar, omboka |
| **Hushåll** | Sök och visa alla hushåll |
| **Nytt hushåll** | Registrera nytt hushåll |
| **Hushållsdetaljer** | Se all info om ett hushåll |
| **Statistik** | Se diagram och siffror |
| **Inställningar** | Ändra systemkonfiguration |

---

## Tips för vardagen

### Före utdelningen
- [ ] Logga in och gå till "Dagens utlämningar"
- [ ] Kolla om det finns något under "Uppföljning"
- [ ] Ha mobilen redo för QR-skanning

### Under utdelningen
- [ ] Skanna eller klicka på varje matkasse
- [ ] Markera som utlämnad direkt

### Efter utdelningen
- [ ] Hantera eventuella uteblivna
- [ ] Kolla "Uppföljning" nästa dag för missade registreringar

---

*Dokumentet uppdaterat: 2025*
