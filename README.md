# VantageQuant

Client onboarding + portal platform for **VantageQuant** — a premium, higher-ticket
algorithmic trading offer. This codebase is a rebranded fork of the prior platform,
restyled around the VantageQuant **blue → silver** brand.

It is a static front-end (HTML + vanilla JS) backed by **Supabase** for auth, data,
and storage.

## Structure

| Path | Purpose |
|------|---------|
| `index.html` | Client dashboard / landing |
| `auth/` | Login / signup |
| `onboarding/` | New-client onboarding questionnaire |
| `portal/` | Member area — performance, content, video, chat, announcements, account |
| `admin/` | Internal admin console — customers, conversations, content, workflows, settings |
| `whopadmin/` | Whop-integration admin |
| `booking/` | Call booking page |
| `trial/`, `quanttrial/`, `summit/`, `summittrial/` | Trial / partner landing variants |
| `copytradingconfig/` | Copy-trading configuration |
| `accountrecovery/` | Account recovery flow |
| `refund/`, `refreq/` | Refund request + portal |
| `legal/` | Contract page |
| `sql/` | Supabase schema, migrations, RLS policies |
| `supabase-client.js` | Shared Supabase client + UI helpers (sidebar, etc.) |
| `activity-tracker.js` | Client-side activity tracking |

## Branding

The accent palette is driven by CSS variables (`--accent`, `--accent-light`,
`--accent-glow`, `--accent-dim`) in each page's `<style>`:

| Token | Value | Role |
|-------|-------|------|
| `--accent` | `#4d8df0` | primary brand blue |
| `--accent-light` | `#c9d6e8` | silver (gradient light end) |
| accent gradients | `linear-gradient(135deg, var(--accent-light), var(--accent))` | signature blue→silver |

Status colors (green = success, red = error, amber = warning) are intentionally
left unchanged.

**Brand assets** (white, transparent — generated from the source art in `brand-assets/`):

| File | Use |
|------|-----|
| `logo.png` | Monogram icon — sidebar / app headers (512×512) |
| `logo-lockup.png` | Vertical monogram + wordmark lockup |
| `logo-wordmark.png` | "VANTAGE QUANT" wordmark only |
| `favicon.png` / `apple-touch-icon.png` | Browser tab + iOS icon |
| `brand-assets/VANTAGE-QUANT_*.jpg` | Original 6000×6000 source files |

## Configuration to update before launch

These were carried over / set to placeholders during the rebrand:

- **Supabase backend** — `supabase-client.js` still points at the existing project
  (`vnhrwcerlaoipycsbigi.supabase.co`). It is currently **shared** with the prior brand
  (same customer base). To run VantageQuant on its own database, create a new Supabase
  project, apply everything in `sql/`, and update `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
- **Domain / emails** — placeholders set to `vantagequant.com`
  (`info@`, `support@`, `clientsupport@`, `scheduling.`, `dash.`). Point these at the
  real VantageQuant domain + inboxes.
- **Embeds** — Loom / Wistia / YouTube video IDs and any third-party widget URLs are
  inherited from the prior site; swap for VantageQuant content.

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
