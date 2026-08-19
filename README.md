# ScholarPath — Scholarship Strategy Extension

A Chrome extension (Manifest V3) that treats scholarship hunting as a strategy problem rather than a search problem.
Students build one profile, get matches with the reasoning shown, follow a prioritized plan, track every application,
and autofill the forms they land on.

The extension works offline with a local cache. Users can also create an account or sign in to synchronize that cache
through Supabase, allowing the companion website to use the same profile and application data.

## Supabase setup

The extension is configured for project `zrqfanveghxodzavjrkb` in `src/core/supabase.ts`. Before using account sync,
open that project's **SQL Editor** and run `supabase/schema.sql`. It creates the `scholarpath_states` table and Row
Level Security policies that only allow an authenticated user to access their own document.

The website should authenticate against the same Supabase project and read/write the same row:

```ts
const { data } = await supabase
  .from('scholarpath_states')
  .select('state, updated_at')
  .single();
```

The publishable key is intentionally bundled in the extension; Supabase publishable keys identify a project but do
not bypass authorization. The RLS policies in `supabase/schema.sql` are what protect each student's data. Never put a
Supabase secret/service-role key in the extension.

## What it does

| Capability | Where | How it works |
| --- | --- | --- |
| Create a student profile | **Profile** tab | Academics, financials, background, activities, essay library, recommenders, and weekly capacity. A completeness meter ranks what to answer next by the award dollars each blank field is gating. |
| Find and prioritize relevant scholarships | **Discover** tab | Every scholarship carries declarative eligibility rules; the engine evaluates them against the profile, supports detailed filters, and combines the results with a plan ranked by expected dollars per hour. |
| Understand why you qualify | "Why this match?" on every card | Each requirement is listed as met, failed, or unanswered with a sentence naming both the requirement and your value — for example, "Your 3.6 GPA meets the minimum of 3.0." |
| Track saved / started / submitted | **Tracker** tab | Status pipeline with a generated task checklist, back-dated due dates, notes, hours invested and remaining, plus overdue and due-soon alerts. |
| Fill out forms on sites you visit | **Account** tab, overlay, right-click menu, `Alt+Shift+F` | Current-page tools read autocomplete attributes, field names, labels, placeholders and surrounding text, preview exactly what would be written, then fill. |

## Why value-per-hour instead of award size

A $20,000 award requiring three essays, two letters and an interview can be worth less than a $1,000 award with a
short form, because the odds differ by orders of magnitude and so does the work. The engine computes:

- **Effort** — hours derived from the actual requirements, discounted when an essay in your library already answers
  the prompt (`src/core/effort.ts`).
- **Odds** — awards divided by applicant pool, scaled by how well you fit relative to a typical applicant, and
  discounted when eligibility is still unconfirmed (`src/core/matching.ts`).
- **Expected value** — total award value (including renewals) times odds.
- **Value per hour** — expected value divided by estimated hours. This is what the planner ranks on.

The planner then applies deadline urgency, drops anything that cannot be finished in the remaining time at your stated
pace, and warns when the urgent pile exceeds the hours you actually have.

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.
Click the toolbar icon to open the side panel.

Other commands:

```bash
npm test          # 128 unit tests (vitest)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run dev       # rebuild on change; use Reload in chrome://extensions to pick up changes
node scripts/generate-icons.mjs  # regenerate the PNG icons
```

### Browser smoke test

`scripts/smoke-test.mjs` loads the built extension into a real browser and runs 45 end-to-end checks: the service
worker starts, the side panel renders every tab with computed numbers, matches carry explanations, the comparison
table highlights winners, the plan ranks and explains its ordering, and the content script fills
`demo/application-form.html` — including asserting that the password and SSN fields stay empty.

```bash
npm run smoke:setup   # once: downloads Chrome for Testing to /tmp/browsers
npm run build
npm run smoke                       # or: SMOKE_SCREENSHOTS=1 npm run smoke
```

It needs Chrome for Testing or Chromium rather than branded Google Chrome: since Chrome 137, branded builds ignore
`--load-extension` entirely (`--load-extension is not allowed in Google Chrome, ignoring.`), so an extension loaded that
way silently never appears. For interactive testing in branded Chrome, load `dist/` through
`chrome://extensions` → **Load unpacked** instead.

## Architecture

```
src/
  core/           Pure, dependency-free engine — all of it unit tested
    types.ts        Domain model (profile, scholarship, rules, matches, plan, tracking)
    eligibility.ts  Rule evaluation and the plain-language explanations
    effort.ts       Requirements → hours, with essay-reuse credit
    matching.ts     Odds, expected value, filtering, sorting, comparison rows
    planner.ts      Prioritized plan, buckets, task generation with due dates
    tracker.ts      Status transitions and pipeline statistics
    profile.ts      Profile creation, completeness, highest-leverage gaps
    autofill.ts     Field detection, confidence scoring, safe value application
    pageCapture.ts  Reads a listing page into an editable catalog entry
    storage.ts      chrome.storage.local cache with migration + memory fallback
    supabase.ts     authentication and per-user cloud state synchronization
  data/           Seed scholarship catalog with declarative rules
  sidepanel/      React UI (Home, Profile, Discover + Plan, Tracker, Account + current-page tools)
  content/        Content script + shadow-DOM overlay
  background/     Service worker: side panel, context menus, deadline notifications
demo/           Application-form fixture used by the browser smoke test
scripts/        Icon generation and the browser smoke test
```

The engine is deliberately separated from Chrome APIs: `src/core` imports nothing from `chrome.*` except in
`storage.ts`, which falls back to an in-memory store when the extension APIs are absent. That is what makes the
matching, planning and autofill logic testable in plain Node.

## Autofill safety

- Passwords, SSN, payment, and CAPTCHA-adjacent fields are never filled, at any confidence.
- Answers you already typed are never overwritten.
- Low-confidence guesses are reported for review instead of being written; strict mode raises the bar further.
- Nothing is ever submitted for you — the overlay says so after every fill.
- Values are written through the native setter with `input`/`change` events so React-controlled forms accept them
  rather than silently reverting.

## About the seeded catalog

`src/data/scholarships.ts` contains 26 **illustrative** scholarships with plausible award sizes, deadlines,
requirements and applicant pools. They are examples that exercise the engine across categories (merit, need, identity,
field of study, local, service, military, employer), not scraped listings, and they should not be treated as live
program data. Real programs get in via **Capture scholarship** under the **Account** tab, which reads award amounts,
deadlines, GPA minimums and requirements out of the page you are viewing and hands you an editable draft with the
supporting text snippets attached.

## Privacy

The profile — including optional demographic answers used only for eligibility rules — is cached in
`chrome.storage.local` on your machine. If you create an account or sign in, the complete app state is also sent to the
configured Supabase project so it can be shared with the companion website. Row Level Security restricts each record
to its authenticated owner. If you stay signed out, nothing is transmitted to Supabase.
