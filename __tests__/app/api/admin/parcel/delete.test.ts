/**
 * DELETE /api/admin/parcel/[parcelId] maps softDeleteParcel's refusals to
 * 4xx statuses: the request can't succeed as sent, nothing failed on our side.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: async () => ({ success: true }),
}));

const softDeleteParcel = vi.fn();
vi.mock("@/app/[locale]/parcels/actions", () => ({
    softDeleteParcel: (parcelId: string) => softDeleteParcel(parcelId),
}));

vi.mock("@/app/utils/logger", () => ({
    logError: vi.fn(),
}));

describe("DELETE /api/admin/parcel/[parcelId]", () => {
    it("answers 403 when the user hasn't accepted the current agreement", async () => {
        softDeleteParcel.mockResolvedValue({
            success: false,
            error: { code: "AGREEMENT_REQUIRED", message: "Agreement acceptance required" },
        });
        const { DELETE } = await import("@/app/api/admin/parcel/[parcelId]/route");

        const response = await DELETE(
            new NextRequest("http://localhost/api/admin/parcel/parcel123", { method: "DELETE" }),
            { params: Promise.resolve({ parcelId: "parcel123" }) },
        );

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ code: "AGREEMENT_REQUIRED" });
    });
});
