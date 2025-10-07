# GitHub Copilot Instructions

This project uses the standard **AGENTS.md** format for AI coding agent instructions.

**⚠️ CRITICAL: Read AGENTS.md checklist BEFORE making changes!**

**All project documentation for AI agents is now in:** [`/AGENTS.md`](../AGENTS.md)

This includes:

- **⚠️ AI Agent Checklist** (READ FIRST!)
- Project overview and architecture
- Setup commands and workflows
- Security patterns and conventions
- Testing instructions (unit tests and E2E with Playwright)
- Code quality guidelines
- Deployment information

---

## Quick Reference

```bash
# Development
pnpm run dev              # Start dev server
pnpm test                 # Run unit tests
pnpm run test:e2e         # Run E2E tests (requires auth setup)

# E2E Testing Setup (first time only)
pnpm run test:e2e:auth    # Copy/paste session cookie from DevTools
                          # Takes 10 seconds

# Validation
pnpm run validate         # Lint, typecheck, format-check, security

# Database
pnpm run db:generate      # Generate migration from schema changes
pnpm run db:migrate       # Apply migrations
```

---

**For complete instructions, see [AGENTS.md](../AGENTS.md)**
