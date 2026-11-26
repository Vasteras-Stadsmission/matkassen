import { describe, expect, it } from "vitest";
import { parseParcelIdFromQr } from "@/components/QrScanner/parse-parcel-qr";
import { generateAdminUrl } from "@/app/utils/public-parcel-data";

describe("parseParcelIdFromQr", () => {
    it("reads the id from the URL the recipient's QR code holds", () => {
        expect(parseParcelIdFromQr(generateAdminUrl("Ab3dE5gH9kLm"))).toBe("Ab3dE5gH9kLm");
    });

    it("accepts any host, since only the id is used", () => {
        expect(parseParcelIdFromQr("http://localhost:3000/schedule?parcel=abc12345")).toBe(
            "abc12345",
        );
    });

    it.each([
        ["plain text", "hello world"],
        ["another site", "https://example.com/menu"],
        ["schedule without a parcel", "https://matcentralen.com/schedule"],
        ["another page with a parcel param", "https://matcentralen.com/households?parcel=abc12345"],
        ["an id with odd characters", "https://matcentralen.com/schedule?parcel=abc%2F..%2F"],
        ["a non-http scheme", "javascript:alert(1)//schedule?parcel=abc12345"],
    ])("rejects %s", (_label, text) => {
        expect(parseParcelIdFromQr(text)).toBeNull();
    });
});
