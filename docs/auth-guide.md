# Authentication & Security Guide

## Authentication Requirements

**EVERY page must be protected except `/auth/*` and `/p/*` (public parcel pages).**

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

- `/api/auth/*` - NextAuth routes (public by design)
- `/api/health` - Health check endpoint
- `/api/csp-report` - CSP violation reporting (browser-initiated)

## GitHub OAuth Configuration

The app uses **NextAuth v5** with:

- **GitHub OAuth** for user authentication
- **GitHub App** for organization membership verification

### Required GitHub Permissions

Organization must have the GitHub App installed with:

- `members:read` - Check organization membership
- `user:email` - Get user email (for admin audit logs)

### Session Validation Flow

1. User signs in via GitHub OAuth
2. NextAuth creates session cookie
3. `authenticateAdminRequest()` validates:
    - Session is valid and not expired
    - User is member of configured GitHub organization
    - Session token matches server-side state

### Environment Variables

```bash
# .env
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=random-string-min-32-chars

GITHUB_ID=your-oauth-app-client-id
GITHUB_SECRET=your-oauth-app-client-secret

GITHUB_APP_ID=your-github-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_ORG_NAME=your-organization-name
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
