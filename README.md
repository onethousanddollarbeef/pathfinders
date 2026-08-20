# Nexus — Scholarship Application Command Center

Nexus is a Chrome extension (Manifest V3) paired with [nexusnext.lovable.app](https://nexusnext.lovable.app). Students build one profile, explore suggested scholarships from live databases, track applications through Saved → In progress → Submitted, autofill forms on the sites they visit, and sync everything with the website through Supabase.

The extension works offline with a local cache. Sign in to sync your profile and tracked scholarships with the same account on the website.

## What it does

| Capability | Where | How it works |
| --- | --- | --- |
| Command-center home | **Home** | Snapshot of profile completeness, pipeline stats, deadline watch, and next steps. |
| Explore suggested awards | **Explore** | Loads scholarships from Supabase, scores them against your profile, and links to real application pages and live search sites (Fastweb, Scholarships.com, HSF, UNCF, FAFSA, etc.). |
| Build your profile | **Profile** | Academics, financials, background, activities, essay library, recommenders, and weekly capacity. |
| Track applications | **Applications** | Move awards through Saved, In progress, and Submitted with tasks, notes, and deadline alerts. |
| Account & page tools | **Account** | Sign in or create an account (with password visibility toggle), sync with Supabase, scan/autofill/capture the active tab. |
| Fill forms on sites you visit | Overlay, right-click menu, `Alt+Shift+F` | Detects form fields, previews matches, fills safely — never passwords or SSN. |

## Supabase setup

The extension uses project `zrqfanveghxodzavjrkb` (see `src/core/supabase.ts`). The website and extension share these tables:

| Table | Purpose |
| --- | --- |
| `profiles` | Student profile fields synced between web and extension |
| `scholarships` | Curated catalog shown in Explore (public read) |
| `user_scholarships` | Saved/started/submitted applications per user |
| `application_milestones` | Timeline milestones (website) |
| `student_documents` | Document locker (website) |
| `supplemental_answers` | Per-scholarship profile prompts (website) |

### Auth checklist (instant sign-up + optional verify)

Nexus is designed for **sign up → signed in immediately → verify later**:

1. In Supabase **Authentication → Providers → Email**, turn **Confirm email** **OFF**.
   - When off, signup returns a session right away and email is implicitly confirmed in the database.
   - When on (Supabase hosted default), signup blocks sign-in until the user clicks a confirmation link — and you must rely on email delivery.
2. Add `https://nexusnext.lovable.app/auth` to **Redirect URLs** (for optional verification links).
3. **Where verification emails come from:** Supabase Auth, not the extension.
   - Default sender is typically `noreply@mail.app.supabase.io` (rate-limited; often lands in spam).
   - For reliable delivery, configure **custom SMTP** under Authentication → Email templates / SMTP settings.
4. After sign-in, users who are not verified see an **optional** “Verify your email” prompt on the Account tab (sync is not blocked).

Passwords must be at least 8 characters and not on known breach lists (Supabase rejects weak passwords).

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → select the `dist/` folder. Click the toolbar icon to open the side panel.

```bash
npm test          # unit tests (vitest)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run dev       # rebuild on change; Reload in chrome://extensions
```

### Browser smoke test

```bash
npm run smoke:setup   # once: downloads Chrome for Testing
npm run build
npm run smoke
```

Loads the built extension, renders the side panel, and runs autofill checks against `demo/application-form.html`.

## Architecture

```
src/
  core/               Pure engine + Supabase adapters
    supabase.ts         Auth (sign up, sign in, session)
    nexusSync.ts        profiles + user_scholarships sync
    supabaseScholarships.ts  Fetch/map scholarships table
    matching.ts         Fit scores and eligibility explanations
    tracker.ts          Application status pipeline
    autofill.ts         Safe form filling
    storage.ts          chrome.storage.local cache
  data/
    realScholarshipUrls.ts  Live links to real scholarship sites
  sidepanel/          React UI (Home, Explore, Profile, Applications, Account)
  content/            Content script + overlay
  background/         Service worker
demo/                 Application-form fixture for smoke tests
```

## Privacy

Profile data is cached in `chrome.storage.local`. When signed in, profile and tracked scholarships sync to Supabase under your user id. Row Level Security restricts each row to the authenticated owner. Staying signed out keeps everything on your device.

## Branding

Nexus shares visual design with nexusnext.lovable.app: warm cream background, Fraunces headings, Plus Jakarta Sans body text, and orange primary actions. The header logo is displayed on a soft white surface so the transparent mark reads clearly.
