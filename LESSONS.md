# Lessons Learned

Project-level lessons, mistakes, fixes, and non-obvious gotchas. AI and human entries.
Auto-logged by the build agent after significant fixes — no manual prompting needed.

---

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
