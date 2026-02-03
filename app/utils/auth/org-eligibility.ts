import { logger, logError } from "@/app/utils/logger";

export type OrgEligibilityStatus =
    | "ok"
    | "unauthenticated"
    | "not_member"
    | "membership_inactive"
    | "org_resource_forbidden"
    | "rate_limited"
    | "github_error"
    | "configuration_error";

export interface OrgEligibility {
    ok: boolean;
    status: OrgEligibilityStatus;
    checkedAt: number;
    nextCheckAt: number;
    httpStatus?: number;
    message?: string;
}

const DEFAULT_RECHECK_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_ERROR_RETRY_MS = 2 * 60 * 1000; // 2 minutes
const CACHE_MAX_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_MAX_ENTRIES = 2000;

const eligibilityCache = new Map<string, { value: OrgEligibility; expiresAt: number }>();

function getCacheKey(organization: string, accessToken: string) {
    return `${organization}:${accessToken.slice(0, 12)}`;
}

function cacheGet(cacheKey: string): OrgEligibility | null {
    const cached = eligibilityCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
        eligibilityCache.delete(cacheKey);
        return null;
    }
    return cached.value;
}

function cacheSet(cacheKey: string, value: OrgEligibility) {
    if (eligibilityCache.size > CACHE_MAX_ENTRIES) {
        eligibilityCache.clear();
    }
    const ttlMs = Math.max(5_000, Math.min(CACHE_MAX_TTL_MS, value.nextCheckAt - Date.now()));
    eligibilityCache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
}

async function fetchGitHubJson(accessToken: string, path: string) {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    let json: unknown = null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        try {
            json = await response.json();
        } catch {
            json = null;
        }
    }

    return { response, json };
}

export async function checkGitHubOrgEligibility({
    accessToken,
    organization,
    context,
    recheckMs = DEFAULT_RECHECK_MS,
    errorRetryMs = DEFAULT_ERROR_RETRY_MS,
}: {
    accessToken: string;
    organization: string;
    context: string;
    recheckMs?: number;
    errorRetryMs?: number;
}): Promise<OrgEligibility> {
    const now = Date.now();

    if (!organization) {
        return {
            ok: false,
            status: "configuration_error",
            checkedAt: now,
            nextCheckAt: now + errorRetryMs,
            message: "Missing organization configuration",
        };
    }

    if (!accessToken) {
        return {
            ok: false,
            status: "unauthenticated",
            checkedAt: now,
            nextCheckAt: now + errorRetryMs,
            message: "Missing GitHub OAuth access token",
        };
    }

    const cacheKey = getCacheKey(organization, accessToken);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        logger.info({ organization, context }, "Checking GitHub organization eligibility");

        const membership = await fetchGitHubJson(
            accessToken,
            `/user/memberships/orgs/${organization}`,
        );

        if (membership.response.status === 401) {
            const result: OrgEligibility = {
                ok: false,
                status: "unauthenticated",
                checkedAt: now,
                nextCheckAt: now + errorRetryMs,
                httpStatus: 401,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (membership.response.status === 404) {
            const result: OrgEligibility = {
                ok: false,
                status: "not_member",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 404,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (membership.response.status === 403) {
            const result: OrgEligibility = {
                ok: false,
                status: "org_resource_forbidden",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 403,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (membership.response.status === 429) {
            const result: OrgEligibility = {
                ok: false,
                status: "rate_limited",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 429,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (!membership.response.ok) {
            const result: OrgEligibility = {
                ok: false,
                status: "github_error",
                checkedAt: now,
                nextCheckAt: now + errorRetryMs,
                httpStatus: membership.response.status,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        const state = (() => {
            if (!membership.json || typeof membership.json !== "object") return undefined;
            const record = membership.json as Record<string, unknown>;
            return typeof record.state === "string" ? record.state : undefined;
        })();

        if (state !== "active") {
            const result: OrgEligibility = {
                ok: false,
                status: "membership_inactive",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: membership.response.status,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        const orgResource = await fetchGitHubJson(
            accessToken,
            `/orgs/${organization}/teams?per_page=1`,
        );

        if (orgResource.response.status === 401) {
            const result: OrgEligibility = {
                ok: false,
                status: "unauthenticated",
                checkedAt: now,
                nextCheckAt: now + errorRetryMs,
                httpStatus: 401,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (orgResource.response.status === 403) {
            const result: OrgEligibility = {
                ok: false,
                status: "org_resource_forbidden",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 403,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (orgResource.response.status === 404) {
            const result: OrgEligibility = {
                ok: false,
                status: "not_member",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 404,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (orgResource.response.status === 429) {
            const result: OrgEligibility = {
                ok: false,
                status: "rate_limited",
                checkedAt: now,
                nextCheckAt: now + recheckMs,
                httpStatus: 429,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        if (!orgResource.response.ok) {
            const result: OrgEligibility = {
                ok: false,
                status: "github_error",
                checkedAt: now,
                nextCheckAt: now + errorRetryMs,
                httpStatus: orgResource.response.status,
            };
            cacheSet(cacheKey, result);
            return result;
        }

        const result: OrgEligibility = {
            ok: true,
            status: "ok",
            checkedAt: now,
            nextCheckAt: now + recheckMs,
            httpStatus: 200,
        };
        cacheSet(cacheKey, result);
        return result;
    } catch (error) {
        logError("Failed to check GitHub organization eligibility", error, {
            organization,
            context,
        });
        const result: OrgEligibility = {
            ok: false,
            status: "github_error",
            checkedAt: now,
            nextCheckAt: now + errorRetryMs,
        };
        cacheSet(getCacheKey(organization, accessToken), result);
        return result;
    }
}
