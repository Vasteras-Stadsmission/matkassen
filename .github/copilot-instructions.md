Never create intermediate files. Alter the original file directly.
Never run `pnpm dev`, I will do that myself, and expect the local dev environment to be running on http://localhost:3000.
Never create additional README files unless I explicitly say so.
Use TypeScript strict mode in a Next.js App Router project.
Use React function components with hooks; avoid class components.
Favor server components; add `"use client"` only when using browser APIs.
Respect `.gitignore`: never edit or reference ignored files (e.g. `.next`, `node_modules`).
Style with Mantine and Tailwind CSS; avoid other UI libraries.
Internationalize all user strings with `next-intl` message IDs.
Use Drizzle ORM for Postgres with migrations via `drizzle-kit`.
Run validations and tests via pnpm scripts (`pnpm run validate` for lint/type-check/format-check, and `pnpm test` for Vitest).
Develop locally with `pnpm dev`.
Load secrets from `.env`; never commit credentials.
Annotate non-obvious logic in comments for Copilot to learn.
CRITICAL: This is an admin tool - ALL pages must be protected with authentication. Wrap server components with `<AuthProtection>` and client components with `<AuthProtectionClient>`. Only `/auth/*` pages should be public.
