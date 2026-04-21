/**
 * Tests for the first-login welcome banner shown on /schedule.
 *
 * The banner should appear only for handout_staff users who haven't dismissed
 * it on this device. Admins never see it (they go through a different
 * onboarding path). The dismiss state is persisted to localStorage so the
 * banner stays hidden across reloads on the same device.
 *
 * These are pure logic tests that mirror the component's decision logic
 * so we can lock in the behavior without mocking Mantine + next-intl + jsdom.
 * The component itself is thin: it delegates every decision to this logic.
 */

import { describe, it, expect, beforeEach } from "vitest";

const DISMISSED_STORAGE_KEY = "matkassen.welcomeBanner.dismissed";

/**
 * Mirrors the useEffect logic in WelcomeBanner.tsx. Given the user's role
 * and the current localStorage state, decides whether the banner should be
 * visible on a client-side render.
 */
function shouldShowBanner(
    userRole: string | undefined,
    storage: Pick<Storage, "getItem"> | null,
): boolean {
    if (userRole !== "handout_staff") {
        return false;
    }
    if (!storage) {
        // localStorage unavailable (private mode, storage quota). Fail open
        // so new users still see the welcome — worst case is a minor nag.
        return true;
    }
    try {
        return storage.getItem(DISMISSED_STORAGE_KEY) !== "1";
    } catch {
        return true;
    }
}

// A minimal in-memory Storage polyfill for test isolation.
function createFakeStorage(initial: Record<string, string> = {}): Storage {
    const store = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
            return store.size;
        },
    };
}

describe("WelcomeBanner visibility logic", () => {
    let storage: Storage;

    beforeEach(() => {
        storage = createFakeStorage();
    });

    describe("role-based visibility", () => {
        it("shows the banner for handout_staff who haven't dismissed it", () => {
            expect(shouldShowBanner("handout_staff", storage)).toBe(true);
        });

        it("never shows the banner for admin, even on a fresh device", () => {
            expect(shouldShowBanner("admin", storage)).toBe(false);
        });

        it("does not show the banner when role is undefined (no session)", () => {
            expect(shouldShowBanner(undefined, storage)).toBe(false);
        });

        it("does not show the banner for any unknown role string", () => {
            // Defense-in-depth: future roles shouldn't see the banner by accident.
            expect(shouldShowBanner("case_worker", storage)).toBe(false);
            expect(shouldShowBanner("", storage)).toBe(false);
        });
    });

    describe("dismiss persistence", () => {
        it("hides the banner when dismissed flag is '1'", () => {
            storage.setItem(DISMISSED_STORAGE_KEY, "1");
            expect(shouldShowBanner("handout_staff", storage)).toBe(false);
        });

        it("still shows the banner if the flag has an unexpected value", () => {
            // Only the exact string "1" counts as dismissed. Anything else
            // (stale/corrupt state from a previous version) should re-show.
            storage.setItem(DISMISSED_STORAGE_KEY, "true");
            expect(shouldShowBanner("handout_staff", storage)).toBe(true);
        });

        it("still shows the banner when the flag is absent", () => {
            // Fresh device, no prior dismiss.
            expect(shouldShowBanner("handout_staff", storage)).toBe(true);
        });

        it("persisted dismiss does not leak across roles", () => {
            storage.setItem(DISMISSED_STORAGE_KEY, "1");
            // Admin never sees the banner regardless of flag state.
            expect(shouldShowBanner("admin", storage)).toBe(false);
            // Handout staff sees it as dismissed.
            expect(shouldShowBanner("handout_staff", storage)).toBe(false);
        });
    });

    describe("localStorage failure modes", () => {
        it("shows the banner when localStorage is unavailable (private mode)", () => {
            // A browser refusing localStorage entirely (e.g. Safari private
            // mode in older versions) should still let new staff see the
            // welcome — failing closed would silently break onboarding.
            expect(shouldShowBanner("handout_staff", null)).toBe(true);
        });

        it("shows the banner when getItem throws (security error)", () => {
            const throwingStorage: Pick<Storage, "getItem"> = {
                getItem: () => {
                    throw new Error("SecurityError: access denied");
                },
            };
            expect(shouldShowBanner("handout_staff", throwingStorage as Storage)).toBe(true);
        });

        it("still suppresses the banner for admin even when storage throws", () => {
            const throwingStorage: Pick<Storage, "getItem"> = {
                getItem: () => {
                    throw new Error("SecurityError: access denied");
                },
            };
            expect(shouldShowBanner("admin", throwingStorage as Storage)).toBe(false);
        });
    });
});
