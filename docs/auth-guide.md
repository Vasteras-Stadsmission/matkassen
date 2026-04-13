# Authentication & Security Guide

## Authentication Requirements

**EVERY page must be protected except `/auth/*` (sign-in/error screens), `/p/*` (public parcel pages), and `/privacy` (privacy policy).** See `middleware.ts` for the authoritative allow-list.

## Protection Patterns

### Server Components

Wrap every staff-facing page in `<AgreementProtection>`. It renders a "please sign in" fallback for unauthenticated requests (defense-in-depth — `middleware.ts` normally redirects them to sign-in before the page renders), redirects users who haven't accepted the current user agreement to `/agreement`, and (optionally) restricts pages to administrators via the `adminOnly` prop (redirects handout staff to `/auth/access-denied?reason=admin_required`).

```typescript
// app/[locale]/example/page.tsx
import { AgreementProtection } from "@/components/AgreementProtection";

export default function ExamplePage() {
    return (
        <AgreementProtection>
            <div>Protected content</div>
        </AgreementProtection>
    );
}
```

For admin-only pages, pass `adminOnly={true}`. Handout staff who visit get redirected to `/auth/access-denied?reason=admin_required` with a role-specific explanation.

```typescript
// app/[locale]/households/page.tsx
import { AgreementProtection } from "@/components/AgreementProtection";

export default function HouseholdsPage() {
    return (
        <AgreementProtection adminOnly>
            <div>Admin-only content</div>
        </AgreementProtection>
    );
}
```

### Client Components

Client components that need to gate UI on auth state read the session directly via `useSession()` from `next-auth/react`. The surrounding page is expected to already be wrapped in `<AgreementProtection>`, so this is for conditional rendering inside an already-protected page, not for adding a new auth boundary.

```typescript
// components/ExampleClient.tsx
"use client";
import { useSession } from "next-auth/react";

export function ExampleClient() {
    const { data: session, status } = useSession();
    if (status === "loading") return null;
    if (!session) return null;
    return <div>Authenticated content for {session.user?.githubUsername}</div>;
}
```

## Server Action Security

All server actions return `ActionResult<T>` (discriminated union) and **MUST** use protection wrappers.

### Basic Protected Action

```typescript
// app/[locale]/example/actions.ts
"use server";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

export const myAction = protectedAction(
    async (session, formData: FormData): Promise<ActionResult<string>> => {
        // session is verified - no manual auth checks needed
        try {
            const result = await doSomething();
            return success(result);
        } catch (error) {
            return failure({ code: "FAILED", message: "Operation failed" });
        }
    },
);
```

### Household-Specific Action

```typescript
import { protectedHouseholdAction } from "@/app/utils/auth/protected-action";

export const updateHousehold = protectedHouseholdAction(
    async (session, householdId, formData: FormData): Promise<ActionResult<void>> => {
        // householdId is validated, session is verified
        const name = formData.get("name") as string;
        await db.update(households).set({ name }).where(eq(households.id, householdId));
        return success(undefined);
    },
);
```

### Build Validation

**Enforcement**: `scripts/validate-server-actions.mjs` runs during `pnpm run validate`.

This script ensures:

- All server actions use `protectedAction()` or `protectedHouseholdAction()`
- No manual session checks (prevents security bypasses)
- Consistent error handling patterns

## API Route Security

All admin API routes under `/api/admin/*` **MUST** use `authenticateAdminRequest()`.

### Protected API Route

```typescript
// app/api/admin/example/route.ts
import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

export async function GET(request: Request) {
    // MANDATORY: Validate session + organization membership
    const authResult = await authenticateAdminRequest();
    if (!authResult.success) {
        return authResult.response!;
    }

    // authResult.session is verified and user is in correct GitHub org
    try {
        const data = await fetchData();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
```

### Build Validation

**Enforcement**: `scripts/validate-api-routes.mjs` runs during `pnpm run validate`.

This script ensures:

- All `/api/admin/*` routes use `authenticateAdminRequest()`
- Public routes are explicitly documented (see below)
- No manual session parsing (prevents CSRF/token replay)

### Public API Routes (Exceptions)

Kept in `middleware.ts` as the `publicApiPatterns` allow-list:

- `/api/auth/*` — NextAuth routes (public by design)
- `/api/health` — Health check endpoint
- `/api/csp-report` — CSP violation reporting (browser-initiated)
- `/api/pickup-locations` — Public pickup locations lookup
- `/api/webhooks/*` — Webhook endpoints (authenticated via URL secret, not session)

## GitHub OAuth Configuration

The app uses **NextAuth v5** with two separate GitHub integrations:

- **GitHub OAuth app** — used at sign-in. The user's OAuth access token is what we call against `GET /user/memberships/orgs/{org}` in `app/utils/auth/org-eligibility.ts` to gate the session. Driven by `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.
- **GitHub App** — used by the daily org-sync scheduler (`app/utils/scheduler.ts`), which walks every active user and deactivates anyone who has left the org. The App's installation token lets us read org membership without a specific user's OAuth token. Driven by `AUTH_GITHUB_APP_ID` / `AUTH_GITHUB_APP_INSTALLATION_ID` / `AUTH_GITHUB_APP_PRIVATE_KEY`. The login path does **not** use the GitHub App.

### Required GitHub permissions

- **OAuth app** — scopes `read:user`, `user:email`, `read:org` (declared in `auth.ts`).
- **GitHub App** — organization permission `Members: Read-only` (used by the scheduler).

### Session validation flow

Sessions are **JWT-based** (`strategy: "jwt"` in `auth.ts`), so validation is stateless — there is no server-side session store to match against.

1. User signs in via GitHub OAuth.
2. `signIn` callback in `auth.ts` calls `checkGitHubOrgEligibility()` with the user's OAuth access token; result is cached in the JWT alongside the user's role (refreshed every 10 min for eligibility, every 5 min for role).
3. On every request, `auth()` decodes the JWT cookie.
4. `authenticateAdminRequest()` in `app/utils/auth/api-auth.ts` reads `auth()` and asserts: session present, `orgEligibility.ok === true`, and (when `adminOnly`) `user.role === "admin"`.

### Environment variables

The actual variable names — see `.env.example` for the full list:

```bash
# GitHub OAuth (sign-in path)
AUTH_GITHUB_ID=your_github_oauth_app_id
AUTH_GITHUB_SECRET=your_github_oauth_app_secret
AUTH_SECRET=generate_with_npx_auth_secret
AUTH_TRUST_HOST=true

# GitHub organization access control
GITHUB_ORG=vasteras-stadsmission

# GitHub App (scheduled org-sync path)
AUTH_GITHUB_APP_ID=your_github_app_id
AUTH_GITHUB_APP_INSTALLATION_ID=your_installation_id
AUTH_GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

## Security Checklist

Before deploying any feature:

- [ ] All staff pages wrapped in `<AgreementProtection>` (with `adminOnly` where appropriate)
- [ ] All server actions use `protectedAction()` wrapper
- [ ] All `/api/admin/*` routes use `authenticateAdminRequest()`
- [ ] `pnpm run validate` passes (enforces security patterns)
- [ ] No hardcoded credentials in code
- [ ] Environment variables added to all 5 required places (see deployment guide)

## Common Mistakes

### ❌ Manual Session Checks

```typescript
// DON'T DO THIS
"use server";
import { auth } from "@/auth";

export async function myAction() {
    const session = await auth();
    if (!session) throw new Error("Unauthorized");
    // ...
}
```

### ✅ Use Protection Wrappers

```typescript
// DO THIS
"use server";
import { protectedAction } from "@/app/utils/auth/protected-action";

export const myAction = protectedAction(async session => {
    // session is guaranteed to exist
});
```

### ❌ Unprotected API Routes

```typescript
// DON'T DO THIS
export async function GET(request: Request) {
    const data = await fetchSensitiveData();
    return NextResponse.json(data);
}
```

### ✅ Use authenticateAdminRequest

```typescript
// DO THIS
export async function GET(request: Request) {
    const authResult = await authenticateAdminRequest();
    if (!authResult.success) return authResult.response!;

    const data = await fetchSensitiveData();
    return NextResponse.json(data);
}
```

## Related Documentation

- **Testing**: See `docs/testing-guide.md` for E2E auth setup
- **Deployment**: See `docs/deployment-guide.md` for environment variable configuration
