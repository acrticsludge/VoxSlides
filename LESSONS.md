# Lessons Learned

Project-level lessons, mistakes, fixes, and non-obvious gotchas. AI and human entries.
Auto-logged by the build agent after significant fixes — no manual prompting needed.

---

## 2026-05-31: [Process] AI-generated design output (Figma via Stitch) must be audited against actual codebase before implementation

**What happened:** Google Stitch (a Figma alternative) generated a UI that looked correct visually but invented non-existent labels ("Preview" → should be "Latest Render"), removed features (only Upload, no Record), renamed presets, and dropped sidebar navigation items.

**Root cause:** AI design tools hallucinate UI content — they generate plausible-looking interfaces without understanding the actual feature set, data model, or labels used in the codebase.

**Fix:** Conducted a two-pass audit: first, cross-referenced every element in the generated HTML against the existing components and data; second, created a spec document preserving original features while applying the new visual layout (colors, spacing, typography, panel structure).

**Prevention:** Before implementing any AI-generated design, create a discrepancy table mapping each generated element to its actual counterpart. Preserve original feature logic and labels — only apply the new styling/layout. Never trust AI design output verbatim.

## 2026-05-28: [Architecture] Shared tag processing utility extracted for page-level toolbar use

**What happened:** Toolbar tag buttons in the three-panel layout needed to insert `[condition]` tags into the textarea, but the `processTags` logic was private inside `SlotEditor.tsx`, making it unreachable from `page.tsx`.

**Root cause:** The tag-to-slot processing function was defined as a local helper inside the `SlotEditor` component, not exported from a shared location.

**Fix:** Moved `processTags` from `SlotEditor.tsx` to `compileScript.ts` (which already had the sister function `compileScript`), exported it, and updated both `SlotEditor.tsx` and `page.tsx` to import from there.

**Prevention:** When implementing text-processing utilities shared across components, put them in a separate library file (like `compileScript.ts`) from the start rather than defining them inside a single component.

## 2026-05-28: [Process] Full UI theme replacement can break Playwright test selectors

**What happened:** Replacing the frontend from a dark-themed two-column layout to a light-themed three-panel layout removed several `data-testid` attributes that existing Playwright tests relied on (`compiled-preview`, `history-btn`, `history-item` inline).

**Root cause:** Tests were written against specific DOM elements and testid attributes that no longer existed after the layout rewrite.

**Fix:** Restored `data-testid="generate-btn"` and `data-testid="audio-player"` on their new equivalents. The removed testids (`compiled-preview`, `history-btn`) require test updates.

**Prevention:** When doing a full UI replacement, audit all `data-testid` attributes against the test suite first. Add them to new equivalents during the rewrite, or update tests in the same PR.

<!--
Template for new entries:

## YYYY-MM-DD: [Category] Brief title

**What happened:** One sentence describing the issue.

**Root cause:** Why it happened — wrong assumption, missed edge case, etc.

**Fix:** What was done to resolve it.

**Prevention:** How to avoid this in the future. Specific and actionable.

Categories: Bug, Architecture, Security, Deployment, DX, Process
-->

## 2026-05-15: [Deployment] Dead ffmpeg-static imports crash Next.js on Vercel (Linux)

**What happened:** Build succeeded locally (Windows) but `require("ffmpeg-static")` and `ffmpeg.exe` fallback path would crash on Vercel's Linux serverless runtime. The variable was never used.

**Root cause:** Dead code left from development — `spawnSync`, `ffmpeg-static` require, `writeFileSync`, and other unused imports accumulated without being cleaned up. The `ffmpeg.exe` path is Windows-only.

**Fix:** Removed all dead imports (`spawnSync`, `fs` functions, `tmpdir`, `join`, `resolve`, `NGROK_HEADERS`, `applyModifiers`) and the entire `FFMPEG_PATH` resolution block.

**Prevention:** Before Vercel deployment, audit API routes for OS-specific code (`.exe`, `child_process`), dead imports, and missing `package.json` dependencies that work locally by accident.

## 2026-05-14: [DX] @gradio/client `predict()` returns `unknown` data — must specify generic type

**What happened:** Accessing `result.data[0]` on a Gradio predict result caused "Type 'unknown' is not indexable" TypeScript error.

**Root cause:** `Client.predict()` defaults its generic parameter to `T = unknown`, so `result.data` is typed as `unknown`. You can't index `unknown` without a cast or type parameter.

**Fix:** Call `client.predict<unknown[]>("/endpoint", {...})` to get `data` typed as `unknown[]`, then cast individual elements.

**Prevention:** Always pass the expected return shape as a generic to `client.predict<T>()`, typically `unknown[]` for endpoints returning multiple values.

## 2026-05-11: [Process] LESSONS.md created

**What happened:** No system existed for tracking project-level mistakes and lessons.

**Root cause:** Knowledge lived in commit messages and conversation history — not searchable, not referenceable.

**Fix:** Created this file with a structured per-entry format (date, category, what happened, root cause, fix, prevention).

**Prevention:** Agents auto-log lesson-worthy events here. No manual prompting needed.
