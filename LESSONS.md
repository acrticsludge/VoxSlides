# Lessons Learned

Project-level lessons, mistakes, fixes, and non-obvious gotchas. AI and human entries.
Auto-logged by the build agent after significant fixes — no manual prompting needed.

## 2026-05-12: [Bug] msedge-tts `toStream` wraps SSML input in another SSML template

**What happened:** Passing raw SSML to `toStream()` resulted in malformed double-wrapped SSML, producing no audio.

**Root cause:** `toStream(input, options)` calls `_SSMLTemplate(input, options)` which wraps the input in `<speak><voice><prosody>...</prosody></voice></speak>`. Passing pre-built SSML as `input` resulted in nested `<speak>` tags.

**Fix:** Use `rawToStream(ssml)` instead — it sends the SSML directly without wrapping.

**Prevention:** Always check the library source for `raw*` methods when sending pre-formatted SSML. `toStream` is for plain text + prosody options; `rawToStream` is for raw SSML.

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

## 2026-05-11: [Process] LESSONS.md created

**What happened:** No system existed for tracking project-level mistakes and lessons.

**Root cause:** Knowledge lived in commit messages and conversation history — not searchable, not referenceable.

**Fix:** Created this file with a structured per-entry format (date, category, what happened, root cause, fix, prevention).

**Prevention:** Agents auto-log lesson-worthy events here. No manual prompting needed.
