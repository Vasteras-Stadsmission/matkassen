/**
 * Tests for the GitHub org eligibility check.
 *
 * Focus: the 403 logging path added in the onboarding-friction PR.
 * When GitHub returns 403, we (a) collapse to `org_resource_forbidden`,
 * (b) log the body message + relevant headers so we can later distinguish
 * SSO/SAML, rate-limit and 2FA causes, and (c) pass the body message
 * through on the OrgEligibility result.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLoggerWarn, mockLoggerInfo, mockLoggerError } = vi.hoisted(() => ({
    mockLoggerWarn: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerError: vi.fn(),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: {
        warn: mockLoggerWarn,
        info: mockLoggerInfo,
        error: mockLoggerError,
    },
    logError: vi.fn(),
}));

import { checkGitHubOrgEligibility } from "@/app/utils/auth/org-eligibility";

function makeResponse(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
): Response {
    const json = body === null ? "" : JSON.stringify(body);
    return new Response(json, {
        status,
        headers: {
            "content-type": "application/json",
            ...headers,
        },
    });
}

describe("checkGitHubOrgEligibility - 403 handling", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    beforeEach(() => {
        vi.clearAllMocks();
        fetchSpy.mockReset();
    });

    it("returns org_resource_forbidden and passes through GitHub's body message on 403", async () => {
        fetchSpy.mockResolvedValueOnce(
            makeResponse(
                403,
                {
                    message: "You must have two-factor authentication enabled to access this org.",
                    documentation_url:
                        "https://docs.github.com/articles/about-two-factor-authentication",
                },
                {
                    "x-ratelimit-remaining": "59",
                    "x-ratelimit-limit": "60",
                },
            ),
        );

        const result = await checkGitHubOrgEligibility({
            // Use a unique token per test to avoid the in-memory cache leaking state.
            accessToken: `tok-2fa-${Math.random()}`,
            organization: "vasteras-stadsmission",
            context: "test",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe("org_resource_forbidden");
        expect(result.httpStatus).toBe(403);
        expect(result.message).toBe(
            "You must have two-factor authentication enabled to access this org.",
        );
    });

    it("logs structured 403 details including SSO and rate-limit headers", async () => {
        fetchSpy.mockResolvedValueOnce(
            makeResponse(
                403,
                { message: "Resource protected by organization SAML enforcement." },
                {
                    "x-github-sso":
                        "required; url=https://github.com/orgs/vasteras-stadsmission/sso",
                    "x-github-request-id": "ABCD:1234:DEADBEEF:0001:65000000",
                    "x-ratelimit-limit": "5000",
                    "x-ratelimit-remaining": "4998",
                    "x-ratelimit-reset": "1700000000",
                    "x-ratelimit-resource": "core",
                },
            ),
        );

        await checkGitHubOrgEligibility({
            accessToken: `tok-sso-${Math.random()}`,
            organization: "vasteras-stadsmission",
            context: "signin",
        });

        expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
        const [logFields, logMessage] = mockLoggerWarn.mock.calls[0];
        expect(logMessage).toBe("GitHub returned 403 during org eligibility check");
        expect(logFields).toMatchObject({
            organization: "vasteras-stadsmission",
            context: "signin",
            path: "/user/memberships/orgs/vasteras-stadsmission",
            httpStatus: 403,
            githubMessage: "Resource protected by organization SAML enforcement.",
            xGithubSso: "required; url=https://github.com/orgs/vasteras-stadsmission/sso",
            xGithubRequestId: "ABCD:1234:DEADBEEF:0001:65000000",
            xRatelimitLimit: "5000",
            xRatelimitRemaining: "4998",
            xRatelimitReset: "1700000000",
            xRatelimitResource: "core",
        });
    });

    it("handles a 403 with no body and no helpful headers gracefully", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response("not json", {
                status: 403,
                headers: { "content-type": "text/plain" },
            }),
        );

        const result = await checkGitHubOrgEligibility({
            accessToken: `tok-empty-${Math.random()}`,
            organization: "vasteras-stadsmission",
            context: "test",
        });

        expect(result.status).toBe("org_resource_forbidden");
        expect(result.message).toBeUndefined();
        expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
        const [logFields] = mockLoggerWarn.mock.calls[0];
        expect(logFields.githubMessage).toBeUndefined();
        expect(logFields.xGithubSso).toBeUndefined();
    });

    it("does not log a 403 warning for 404 (not_member)", async () => {
        fetchSpy.mockResolvedValueOnce(makeResponse(404, { message: "Not Found" }));

        const result = await checkGitHubOrgEligibility({
            accessToken: `tok-404-${Math.random()}`,
            organization: "vasteras-stadsmission",
            context: "test",
        });

        expect(result.status).toBe("not_member");
        expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
});
