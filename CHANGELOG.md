# Changelog

Every entry is one commit. Convention:

- **Unreleased** = merged into no branch that Render deploys from yet (i.e. only on a feature branch).
- **Deployed (main @ &lt;sha&gt;)** = on `main`. Render deploys from `main`, so these are live —
  cross-check against the `deploys` tab in the Sheet (written by the app itself on every boot,
  see `calendar.js#recordDeploy`) or the "Verify Deploy" GitHub Action run for that commit to
  confirm it's actually the running version, not just merged.

When merging a branch into `main`, move its entries from Unreleased into a new
"Deployed (main @ &lt;new tip sha&gt;)" section instead of leaving them under Unreleased.

## [Unreleased] — on `claude/note-taking-bot-design-jp9nam`, not yet merged to `main`

- `c4e3818` (2026-07-07): Add deploy self-reporting (`deploys` sheet tab) and Sheets-backed error logging (`logs` sheet tab)
- `769d4b6` (2026-07-07): Add note capture — 1:1 messages Gemini can't parse as calendar intent get logged to a `notes` sheet tab instead of dropped

## Deployed (main @ `dc632a2`)

- `dc632a2` (2026-07-04): Structured error logging with context for easier debugging
- `3fc7773` (2026-07-04): Reply with guidance when user asks to create event without details
- `613ac9c` (2026-07-03): Use concrete null examples in prompt, guard against string-null endTime/location
- `84904dc` (2026-06-30): Allow Gemini to return 3+ events in array (not capped at 2)
- `8b151e9` (2026-06-29): Add README (bilingual EN/ZH)
- `4a69dbb` (2026-06-28): Handle multiple events in one message, add endTime fallback
- `dfeadc9` (2026-06-28): Restore member system, add follow/join onboarding
- `966e7b7` (2026-06-28): Refactor: per-context calendar, auto onboarding on follow/join, remove register system
- `a3d525f` (2026-06-28): Add query and cancel event features
- `b7bbe64` (2026-06-28): Remove calendar link from reply, prompt to open app instead
- `ee41d58` (2026-06-28): Use Google Sheets as persistent storage for user emails
- `fdbbec1` (2026-06-28): Read member emails from MEMBER_EMAILS env var
- `547662b` (2026-06-27): Remove attendees invite, write emails to description instead
- `1a1eaa8` (2026-06-27): Add GitHub Actions keep-alive ping
- `2d9d97f` (2026-06-27): Add health endpoint and better logging
- `7c8775f` (2026-06-27): Support GOOGLE_SERVICE_ACCOUNT_KEY env var
- `2d7feb0` (2026-06-27): Initial commit: LINE calendar bot
