Use TypeScript strict mode in a Next.js App Router project.
Use React function components with hooks; avoid class components.
Favor server components; add `"use client"` only when using browser APIs.
Respect `.gitignore`: never edit or reference ignored files (e.g. `.next`, `node_modules`).
Style with Mantine and Tailwind CSS; avoid other UI libraries.
Internationalize all user strings with `next-intl` message IDs.
Use Drizzle ORM for Postgres with migrations via `drizzle-kit`.
Run validations and tests via Bun scripts (`bun run validate` for lint/type-check/format-check, and `bun run test`).
Develop locally with `bun dev`.
Load secrets from `.env`; never commit credentials.
Annotate non-obvious logic in comments for Copilot to learn.
