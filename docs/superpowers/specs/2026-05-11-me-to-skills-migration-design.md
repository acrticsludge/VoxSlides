# Design: Migrate `me/` Knowledge Base into `.opencode/skills/`

**Date:** 2026-05-11
**Status:** Approved

## Goal

Migrate all AI-relevant content from the `me/` knowledge base folder into `.opencode/skills/` as loadable skill files. Update CLAUDE.md and AGENTS.md to reference skills by name rather than `me/` paths. The `me/` folder stays as-is (gitignored personal backup).

## Architecture

### Current State

```
me/                  → gitignored source of truth
  practices/ (8)     → partially mirrored in .opencode/skills/practices.md
  stack/ (5)         → partially mirrored in .opencode/skills/stack.md
  audits/ (9)        → NOT in .opencode/skills/ at all
  tools/ (4)         → partially in CLAUDE.md
  templates/ (3)     → skipped (user has better ones)

CLAUDE.md            → references me/ paths, says "Full details: .opencode/skills/X.md"
.opencode/
  AGENTS.md          → comprehensive, mirrors CLAUDE.md content
  skills/
    stack.md         → existing skill (needs audit)
    practices.md     → existing skill (needs audit)
```

### Target State

```
me/                  → unchanged, gitignored backup

CLAUDE.md            → references skill names, no me/ paths
.opencode/
  AGENTS.md          → synced with CLAUDE.md
  skills/
    stack.md         → UPDATED — add any gaps from me/stack/
    practices.md     → UPDATED — add any gaps from me/practices/
    tools.md         → NEW — graphify + code review MCP + AI collab
    api-security-checklist.md    → NEW
    api-design-checklist.md      → NEW
    performance-checklist.md     → NEW
    mobile-checklist.md          → NEW
    error-handling-checklist.md  → NEW
    billing-checklist.md         → NEW
    onboarding-ux-checklist.md   → NEW
    seo-checklist.md             → NEW
    pre-launch-checklist.md      → NEW
```

## Files to Create/Modify

### Phase 1: Audit & Update Existing Skills (2 files)

| File | Action | Gap(s) to Fill |
|---|---|---|
| `.opencode/skills/stack.md` | Update | Missing "Payments UI Patterns" from `me/stack/dodo-payments.md` |
| `.opencode/skills/practices.md` | Update | Missing frontend-design skill workflow + resources from `me/practices/frontend-design.md` |

### Phase 2: Create New Skills (10 files)

All new files follow the same format:
- YAML frontmatter with `name` and `description`
- Content adapted from `me/` originals, reformatted for skill context

### Phase 3: Update CLAUDE.md (1 file)

Replace:
- `me/` paths → skill name references
- `.opencode/skills/practices.md` → "Load the `practices` skill"
- Audit trigger table → each triggers loading the corresponding audit skill
- Add "Available Skills" reference section

### Phase 4: Sync AGENTS.md (1 file)

Mirror CLAUDE.md changes into `.opencode/AGENTS.md`.

## Skills Description Table

| Skill Name | Description | Auto-trigger When |
|---|---|---|
| `stack` | SaaS tech stack, project structure, payments, docs framework | Architecture, tech decisions, project setup |
| `practices` | Coding standards, security, API design, error handling, styling | Writing code, security review, API changes |
| `tools` | Graphify workflow, code review MCP, AI collaboration | Knowledge graph, code review, multi-AI sync |
| `api-security-checklist` | OWASP API Top 10 — Critical/High/Medium items | API changes, security audit |
| `api-design-checklist` | HTTP semantics, naming, pagination, status codes | New API endpoints, API review |
| `performance-checklist` | Core Web Vitals, images, fonts, JS bundles | UI/frontend changes |
| `mobile-checklist` | Touch targets, viewport, breakpoints, Safari | UI/frontend changes |
| `error-handling-checklist` | Error boundaries, monitoring, user messages | Error handling changes |
| `billing-checklist` | PCI compliance, webhooks, subscriptions | Billing/payment changes |
| `onboarding-ux-checklist` | Signup flow, first-run, activation | Onboarding changes |
| `seo-checklist` | Structured data, crawlability, E-E-A-T, OG tags | SEO/content changes |
| `pre-launch-checklist` | Infrastructure, security, legal, QA, polish | Before any launch |

## Non-Goals

- Delete or modify `me/` folder
- Modify templates/ content
- Modify `.cursorrules`, `.windsurfrules`, or `GEMINI.md` directly (they reference CLAUDE.md)
- Change any application code (routes, components, API handlers)
