-- Seed initial privacy policy content for Swedish and English
-- This provides a starting template that organizations can customize

INSERT INTO privacy_policies (language, content, created_at, created_by)
VALUES
('sv', '# Integritetspolicy

## Insamling av personuppgifter

Vi samlar in följande personuppgifter för att kunna tillhandahålla våra tjänster:

- Namn och kontaktuppgifter
- Hushållssammansättning (antal medlemmar, åldrar)
- Kostpreferenser och allergier
- Information om husdjur
- Postnummer

## Ändamål med behandlingen

Dina personuppgifter behandlas för att:

- Anpassa matkassens innehåll efter hushållets behov
- Kontakta dig angående uthämtning
- Förbättra våra tjänster

## Rättslig grund

Behandlingen grundar sig på vårt berättigade intresse att tillhandahålla mathjälp till hushåll i behov.

## Dina rättigheter

Du har rätt att:

- Få tillgång till dina uppgifter
- Begära rättelse av felaktiga uppgifter
- Begära radering av dina uppgifter
- Invända mot behandlingen

## Kontakt

Kontakta din registrerande kontaktperson om du har frågor eller vill utöva dina rättigheter.',
NOW(), 'system'),

('en', '# Privacy Policy

## Collection of Personal Data

We collect the following personal data to provide our services:

- Name and contact details
- Household composition (number of members, ages)
- Dietary preferences and allergies
- Pet information
- Postal code

## Purpose of Processing

Your personal data is processed to:

- Customize food parcel contents to your household needs
- Contact you regarding pickup
- Improve our services

## Legal Basis

Processing is based on our legitimate interest to provide food assistance to households in need.

## Your Rights

You have the right to:

- Access your data
- Request correction of inaccurate data
- Request deletion of your data
- Object to processing

## Contact

Contact your enrollment contact person if you have questions or wish to exercise your rights.',
NOW(), 'system')
ON CONFLICT DO NOTHING;
