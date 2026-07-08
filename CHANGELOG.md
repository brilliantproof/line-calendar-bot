# Changelog

Every entry is one commit. Convention:

- **Unreleased** = merged into no branch that anything deploys from yet (i.e. only on a feature branch).
- **Deployed (main @ &lt;sha&gt;)** = on `main`. As of `3230259`, `main` is deployed to **two**
  targets — legacy Render (auto-deploys on every push to `main`) and Cloud Run (deployed
  manually via `gcloud run deploy`, see README "Deploy to Cloud Run"). "On main" no longer
  guarantees "live on the service LINE actually talks to" — check which platform the LINE
  webhook URL currently points at before assuming a commit is in production.
  - Render: cross-check the `deploys` tab in the Sheet (written by the app itself on every boot,
    see `calendar.js#recordDeploy`) or the "Verify Deploy" GitHub Action run for that commit.
    Note: that workflow only polls the **Render** URL's `/version` — it does not verify Cloud Run.
  - Cloud Run: `curl https://<cloud-run-url>/version` (commit shows as `unknown` unless
    `RENDER_GIT_COMMIT` is also set as an env var there — it isn't by default), or
    `gcloud run services describe line-calendar-bot --region asia-east1`.

When merging a branch into `main`, move its entries from Unreleased into the
"Deployed (main @ &lt;new tip sha&gt;)" section instead of leaving them under Unreleased.

## Deployed (main @ `3230259`)

- `3230259` (2026-07-08): Add Dockerfile + .dockerignore for Cloud Run migration (build-only; the actual Cloud Run service creation, the dedicated no-billing GCP project for the Gemini key, and env var setup were done manually, not via commit — see README)
- `9d9d2bd` (2026-07-08): Add all-day event support — a message with a clear date but no clock time (e.g. "8/21暑輔結束") now creates an all-day Calendar event instead of being misclassified as a note or silently dropped
- `3dcd166` (2026-07-07): Fix crash when Gemini misclassifies a narrative message as calendar events
- `1206822` (2026-07-07): Add natural-language query for today's notes (`query_notes` intent)
- `b1d65bf` (2026-07-07): Add `/version` endpoint, deploy-verification workflow, and this CHANGELOG
- `c4e3818` (2026-07-07): Add deploy self-reporting (`deploys` sheet tab) and Sheets-backed error logging (`logs` sheet tab)
- `769d4b6` (2026-07-07): Add note capture — 1:1 messages Gemini can't parse as calendar intent get logged to a `notes` sheet tab instead of dropped
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
