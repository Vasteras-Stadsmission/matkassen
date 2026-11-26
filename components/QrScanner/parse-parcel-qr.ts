const PARCEL_ID = /^[0-9A-Za-z]{1,32}$/;

/**
 * The QR code on a recipient's parcel page holds the admin URL
 * `<base>/schedule?parcel=<id>` (see generateAdminUrl). Returns the id, or
 * null for any other code. The host is ignored: the app only navigates
 * internally with the id, so a foreign host can't send staff anywhere.
 */
export function parseParcelIdFromQr(text: string): string | null {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.pathname !== "/schedule") return null;

    const parcelId = url.searchParams.get("parcel");
    return parcelId && PARCEL_ID.test(parcelId) ? parcelId : null;
}
