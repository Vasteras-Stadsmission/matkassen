import type { SupportedLocale } from "../locale-detection";

/**
 * SMS template data interface
 * All fields are guaranteed to be non-null by database schema constraints:
 * - pickupDate: from foodParcels.pickup_date_time_earliest (NOT NULL)
 * - publicUrl: constructed from environment variables and parcel ID
 */
export interface SmsTemplateData {
    pickupDate: Date;
    publicUrl: string;
}

/**
 * Format date and time for SMS in the appropriate locale with compact formatting for SMS length limits
 */
export function formatDateTimeForSms(
    date: Date,
    locale: SupportedLocale,
): { date: string; time: string } {
    try {
        let dateStr: string;
        let timeStr: string;

        // Get locale-specific formatting
        switch (locale) {
            case "sv":
                // Swedish: "mån 16 sep"
                dateStr = date.toLocaleDateString("sv-SE", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("sv-SE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "en":
                // English: "Mon 16 Sep"
                dateStr = date.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "ar":
                // Arabic: compact format to save space
                dateStr = date.toLocaleDateString("ar-SA", {
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "fa":
                // Persian: compact format to save space
                dateStr = date.toLocaleDateString("fa-IR", {
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("fa-IR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "es":
                // Spanish: "lun 16 sep"
                dateStr = date.toLocaleDateString("es-ES", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "fr":
                // French: "lun 16 sept"
                dateStr = date.toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "de":
                // German: "Mo 16 Sep"
                dateStr = date.toLocaleDateString("de-DE", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "ru":
                // Russian: compact format
                dateStr = date.toLocaleDateString("ru-RU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "fi":
                // Finnish: "ma 16 syys"
                dateStr = date.toLocaleDateString("fi-FI", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("fi-FI", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "it":
                // Italian: "lun 16 set"
                dateStr = date.toLocaleDateString("it-IT", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            case "pl":
                // Polish: compact format to save space
                dateStr = date.toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("pl-PL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;

            default:
                // For all other locales including ku, el, sw, so, so_so, uk, ka, th, vi, hy
                // Use English format as fallback
                dateStr = date.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                timeStr = date.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                break;
        }

        return { date: dateStr, time: timeStr };
    } catch {
        // Fallback if locale formatting fails - use locale-neutral format
        const time = date.toISOString().substring(11, 16);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const dateStr = `${day}/${month}`;
        return { date: dateStr, time };
    }
}

/**
 * Generate fully localized SMS messages with appropriate sentence structure for each language
 * Considers RTL languages, word order, and cultural conventions
 */
export function formatPickupSms(data: SmsTemplateData, locale: SupportedLocale): string {
    const { date, time } = formatDateTimeForSms(data.pickupDate, locale);

    switch (locale) {
        case "sv":
            return `Matpaket ${date} ${time}: ${data.publicUrl}`;
        case "en":
            return `Food pickup ${date} ${time}: ${data.publicUrl}`;
        case "ar":
            return `استلام الطعام ${date} ${time}: ${data.publicUrl}`;
        case "fa":
            return `دریافت غذا ${date} ${time}: ${data.publicUrl}`;
        case "ku":
            return `Xwarin ${date} ${time}: ${data.publicUrl}`;
        case "es":
            return `Comida ${date} ${time}: ${data.publicUrl}`;
        case "fr":
            return `Collecte ${date} ${time}: ${data.publicUrl}`;
        case "de":
            return `Essen ${date} ${time}: ${data.publicUrl}`;
        case "el":
            return `Φαγητό ${date} ${time}: ${data.publicUrl}`;
        case "sw":
            return `Chakula ${date} ${time}: ${data.publicUrl}`;
        case "so":
        case "so_so":
            return `Cunto ${date} ${time}: ${data.publicUrl}`;
        case "uk":
            return `Їжа ${date} ${time}: ${data.publicUrl}`;
        case "ru":
            return `Еда ${date} ${time}: ${data.publicUrl}`;
        case "ka":
            return `საკვები ${date} ${time}: ${data.publicUrl}`;
        case "fi":
            return `Ruoka ${date} ${time}: ${data.publicUrl}`;
        case "it":
            return `Cibo ${date} ${time}: ${data.publicUrl}`;
        case "th":
            return `อาหาร ${date} ${time}: ${data.publicUrl}`;
        case "vi":
            return `Thức ăn ${date} ${time}: ${data.publicUrl}`;
        case "pl":
            return `Jedzenie ${date} ${time}: ${data.publicUrl}`;
        case "hy":
            return `Սնունդ ${date} ${time}: ${data.publicUrl}`;
        default:
            return `Food pickup ${date} ${time}: ${data.publicUrl}`;
    }
}
