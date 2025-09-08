/**
 * SMS message templates for different locales and intents
 */

export interface SmsTemplateData {
    householdName: string;
    pickupDate: string;
    pickupTime: string;
    locationName: string;
    locationAddress: string;
    publicUrl: string;
}

export function formatPickupReminderSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Hej ${householdName}! Du har ett matpaket att hämta ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `مرحبا ${householdName}! لديك طرد طعام للاستلام في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        default:
            // Fallback to English
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}
// TODO: Have pickup SMS templates in translation files
export function formatInitialPickupSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Hej ${householdName}! Du har ett matpaket att hämta ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `مرحبا ${householdName}! لديك طرد طعام للاستلام في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        default:
            // Fallback to English
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}

export function formatReminderPickupSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Påminnelse! Hej ${householdName}! Glöm inte att hämta ditt matpaket ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Reminder! Hello ${householdName}! Don't forget to pick up your food parcel on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `تذكير! مرحبا ${householdName}! لا تنس استلام طرد الطعام الخاص بك في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "so":
            return `Xusuusin! Haye ${householdName}! Ha ilaawin inaad ka qaadatid xirmada cuntada ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        default:
            // Fallback to English
            return `Reminder! Hello ${householdName}! Don't forget to pick up your food parcel on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}

// Format date and time for SMS according to locale
export function formatDateTimeForSms(date: Date, locale: string): { date: string; time: string } {
    // Convert to Stockholm timezone for display
    const stockholmDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));

    switch (locale) {
        case "sv":
            return {
                date: stockholmDate.toLocaleDateString("sv-SE", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("sv-SE", {
                    hour: "2-digit",
                    minute: "2-digit",
                }),
            };

        case "en":
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "ar":
            return {
                date: stockholmDate.toLocaleDateString("ar-SA", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "so":
            // Somali uses a similar format to English but we'll keep it simple
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        default:
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };
    }
}
