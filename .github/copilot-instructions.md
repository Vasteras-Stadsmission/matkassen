# GitHub Copilot Instructions

This project uses the standard **AGENTS.md** format for AI coding agent instructions.

**⚠️ CRITICAL: Read AGENTS.md checklist BEFORE making changes!**

**Main documentation:** [`/AGENTS.md`](../AGENTS.md) - Start here for critical rules and quick commands

---

## Domain-Specific Guides

For detailed information on specific topics:

- **Authentication & Security**: [`docs/auth-guide.md`](../docs/auth-guide.md)
- **Development Workflows**: [`docs/dev-guide.md`](../docs/dev-guide.md)
- **Testing**: [`docs/testing-guide.md`](../docs/testing-guide.md)
- **Database**: [`docs/database-guide.md`](../docs/database-guide.md)
- **Deployment**: [`docs/deployment-guide.md`](../docs/deployment-guide.md)
- **Internationalization**: [`docs/i18n-guide.md`](../docs/i18n-guide.md)
- **Business Logic**: [`docs/business-logic.md`](../docs/business-logic.md)

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
