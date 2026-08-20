/**
 * End-to-end smoke test against real Chrome.
 *
 * Loads the built extension, verifies the service worker starts, renders the
 * side panel as a page, and drives the content script through a full autofill
 * on the demo application form — including the safety check that passwords and
 * SSN fields are left alone.
 *
 * Usage: npm run build && node scripts/smoke-test.mjs [--headful]
 */

import { createServer } from 'node:http';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const headful = process.argv.includes('--headful');

/**
 * Branded Google Chrome builds have ignored `--load-extension` since v137, so
 * this needs Chrome for Testing or Chromium. Install one with:
 *   npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  ...globSync('/tmp/browsers/chrome/*/chrome-linux64/chrome'),
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const failures = [];
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const SAMPLE_SCHOLARSHIPS = [
  {
    id: 'smoke-1',
    name: 'STEM Future Leaders Award',
    sponsor: 'National Science Foundation',
    amountMin: 1000,
    amountMax: 2500,
    renewable: false,
    deadline: '2026-04-15',
    recurring: true,
    url: 'https://example.com/stem-award',
    categories: ['stem'],
    description: 'Award for STEM students with leadership experience.',
    eligibility: [],
    states: [],
    tags: ['stem', 'leadership'],
    requirements: {
      essayCount: 1,
      essayWordCounts: [500],
      essayTopics: ['leadership'],
      recommendationLetters: 1,
      transcriptRequired: true,
      fafsaRequired: false,
      portfolioRequired: false,
      interviewRequired: false,
      videoRequired: false,
      otherRequirements: [],
    },
  },
  {
    id: 'smoke-2',
    name: 'Community Service Scholarship',
    sponsor: 'Rotary Club',
    amountMin: 500,
    amountMax: 1500,
    renewable: false,
    deadline: '2026-05-01',
    recurring: true,
    url: 'https://example.com/service',
    categories: ['community'],
    description: 'Recognizes students who volunteer in their communities.',
    eligibility: [],
    states: [],
    tags: ['community'],
    requirements: {
      essayCount: 0,
      essayWordCounts: [],
      essayTopics: [],
      recommendationLetters: 0,
      transcriptRequired: false,
      fafsaRequired: false,
      portfolioRequired: false,
      interviewRequired: false,
      videoRequired: false,
      otherRequirements: [],
    },
  },
  {
    id: 'smoke-3',
    name: 'First-Gen College Fund',
    sponsor: 'Education Trust',
    amountMin: 2000,
    amountMax: 5000,
    renewable: false,
    deadline: '2026-03-20',
    recurring: true,
    url: 'https://example.com/first-gen',
    categories: ['need-based'],
    description: 'Support for first-generation college students.',
    eligibility: [],
    states: [],
    tags: ['first-gen', 'need-based'],
    requirements: {
      essayCount: 2,
      essayWordCounts: [250, 500],
      essayTopics: ['background', 'goals'],
      recommendationLetters: 2,
      transcriptRequired: true,
      fafsaRequired: true,
      portfolioRequired: false,
      interviewRequired: false,
      videoRequired: false,
      otherRequirements: [],
    },
  },
];

const PROFILE = {
  version: 1,
  updatedAt: Date.now(),
  firstName: 'Maya',
  lastName: 'Okafor',
  email: 'maya.okafor@example.com',
  phone: '555-0142',
  addressLine1: '1420 Elm Street',
  city: 'Fresno',
  state: 'CA',
  postalCode: '93701',
  country: 'United States',
  citizenship: 'us-citizen',
  demographics: { gender: 'Female', firstGeneration: true, ethnicities: [] },
  academics: {
    level: 'high-school-senior',
    gpa: 3.6,
    gpaScale: 4,
    satTotal: 1380,
    intendedMajors: ['Computer Science'],
    currentSchool: 'Fresno High School',
    graduationYear: 2026,
    enrollment: 'full-time',
  },
  financials: { householdIncome: 48000, householdSize: 4, pellEligible: true, fafsaFiled: true },
  interests: ['robotics', 'community service'],
  activities: [{ id: 'act-1', name: 'Robotics Club', category: 'volunteer', role: 'Team Captain', hoursPerWeek: 6 }],
  essays: [
    {
      id: 'essay-1',
      title: 'Leading the robotics team',
      topic: 'leadership',
      wordCount: 28,
      text: 'When our robotics team lost its mentor in October, I took over weekly practice planning, rebuilt the build schedule, and we still qualified for regionals.',
      updatedAt: Date.now(),
    },
  ],
  recommenders: [{ id: 'rec-1', name: 'Ms. Diaz', relationship: 'Physics teacher', email: 'diaz@example.com' }],
  weeklyHoursAvailable: 6,
};

/** Content scripts only run on http(s), so the fixture is served, not opened as a file. */
function serveDemo() {
  const html = readFileSync(resolve(root, 'demo/application-form.html'));
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

async function main() {
  if (!existsSync(resolve(distDir, 'manifest.json'))) {
    throw new Error('dist/manifest.json is missing — run `npm run build` first.');
  }
  const executablePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error(`No Chrome binary found. Tried: ${CHROME_CANDIDATES.join(', ')}`);

  const { server, port } = await serveDemo();
  const formUrl = `http://127.0.0.1:${port}/application-form.html`;

  const browser = await puppeteer.launch({
    executablePath,
    headless: headful ? false : 'new',
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      // Chrome 137+ ignores --load-extension unless this kill switch is disabled.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--no-sandbox',
      '--no-first-run',
      '--allow-file-access-from-files',
      '--window-size=1400,1000',
    ],
  });

  try {
    const worker = await browser.waitForTarget((target) => target.type() === 'service_worker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    check('service worker started', Boolean(extensionId), `extension id ${extensionId}`);

    const workerHandle = await worker.worker();
    const manifest = await workerHandle.evaluate(() => chrome.runtime.getManifest());
    check('manifest is readable from the worker', manifest.name.startsWith('Nexus'), manifest.name);
    check(
      'side panel is registered',
      manifest.side_panel?.default_path === 'sidepanel/index.html',
      manifest.side_panel?.default_path,
    );

    // Seed the profile the way the side panel would.
    await workerHandle.evaluate(async (profile, scholarships) => {
      const now = Date.now();
      const current = (await chrome.storage.local.get('scholarpath.state.v1'))['scholarpath.state.v1'] ?? {};
      const applications = scholarships.map((scholarship) => ({
        scholarshipId: scholarship.id,
        status: 'saved',
        savedAt: now,
        notes: '',
        tasks: [],
      }));
      await chrome.storage.local.set({
        'scholarpath.state.v1': {
          ...current,
          profile,
          applications,
          customScholarships: scholarships,
          settings: {
            autofillEnabled: true,
            confirmBeforeFill: true,
            strictAutofill: false,
            dismissedScholarshipIds: [],
            comparisonIds: [],
            onboardingComplete: true,
          },
        },
      });
    }, PROFILE, SAMPLE_SCHOLARSHIPS);

    // --- Side panel renders as an extension page -------------------------------
    const panel = await browser.newPage();
    const panelErrors = [];
    panel.on('pageerror', (error) => panelErrors.push(String(error)));
    panel.on('console', (message) => {
      if (message.type() === 'error') panelErrors.push(message.text());
    });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`, { waitUntil: 'networkidle2' });
    await panel.setViewport({ width: 420, height: 900 });
    await panel.waitForSelector('.app-header h1', { timeout: 10000 });

    const tabs = await panel.$$eval('.tabs .tab', (nodes) => nodes.map((node) => node.textContent.trim()));
    check('side panel renders all tabs', tabs.length === 5, tabs.join(', '));
    check('side panel has no page errors', panelErrors.length === 0, panelErrors.join(' | '));

    const headerTitle = await panel.$eval('.app-header h1', (node) => node.textContent.trim());
    check('header shows Nexus branding', headerTitle === 'Nexus', headerTitle);

    const scholarshipLink = await panel.$eval('.scholarship-sites', (node) => node.href);
    check('header links to nexusnext.lovable.app', scholarshipLink.includes('nexusnext.lovable.app'), scholarshipLink);

    const homeStats = await panel.$$eval('.metric .value', (nodes) => nodes.map((node) => node.textContent.trim()));
    check('home shows computed metrics', homeStats.length >= 3, homeStats.slice(0, 3).join(' / '));

    await clickTab(panel, 'Explore');
    await panel.waitForFunction(
      () => document.querySelectorAll('.match-card').length > 0 || document.querySelector('.banner.warn'),
      { timeout: 12000 },
    );
    const exploreCards = await panel.$$eval('.match-card', (nodes) => nodes.length);
    check('explore lists suggested scholarships', exploreCards > 0, `${exploreCards} cards`);

    await clickTab(panel, 'Applications');
    const tracked = await panel.$$eval('.match-card', (nodes) => nodes.length);
    check('applications tab shows saved applications', tracked >= 3, `${tracked} tracked`);

    await clickTab(panel, 'Account');
    const accountHeading = await panel.$eval('.auth-title', (node) => node.textContent.trim());
    check(
      'account tab renders sign-in section',
      accountHeading.includes('Welcome back') || accountHeading.includes('Create'),
      accountHeading,
    );
    const forgotPassword = await panel.$eval('.auth-forgot', (node) => node.textContent?.trim() ?? '');
    check('account tab offers password reset', forgotPassword.includes('Forgot password'), forgotPassword);
    await panel.click('.auth-forgot');
    const resetHeading = await panel.$eval('.auth-title', (node) => node.textContent.trim());
    check('password reset view opens', resetHeading.includes('Reset your password'), resetHeading);
    const pageTools = await panel.$eval('.section-heading', (node) => node.textContent.trim());
    check('account tab embeds current page tools', pageTools.includes('Current page'), pageTools);

    // --- Autofill on a real form ----------------------------------------------
    const form = await browser.newPage();
    await form.goto(formUrl, { waitUntil: 'domcontentloaded' });
    await new Promise((done) => setTimeout(done, 1500));

    const offer = await form.evaluate(() => {
      const host = document.getElementById('scholarpath-overlay-host');
      return host?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    });
    check('overlay offers to fill the form', offer.includes('application form'), offer.slice(0, 90));

    // The panel talks to the content script over tab messaging, so drive it the
    // same way rather than from the page's own JavaScript context.
    const sendToForm = (message) =>
      workerHandle.evaluate(async (payload, url) => {
        const [tab] = await chrome.tabs.query({ url });
        return chrome.tabs.sendMessage(tab.id, payload);
      }, message, formUrl);

    const scan = await sendToForm({ type: 'sp:scan-page' });
    check('scan recognizes an application form', scan?.scan?.looksLikeApplication === true, JSON.stringify(scan?.scan));

    const preview = await sendToForm({ type: 'sp:preview-fill' });
    check('preview lists fields before writing them', (preview?.fields?.length ?? 0) >= 10, `${preview?.fields?.length} previewed`);

    const report = await sendToForm({ type: 'sp:autofill', overwriteExisting: false, minConfidence: 0.6 });
    check('autofill reports what it filled', report?.ok && report.report.filled.length >= 10, `${report?.report?.filled?.length} fields`);

    const values = await form.evaluate(() => {
      const byName = (name) => document.querySelector(`[name="${name}"]`)?.value ?? null;
      return {
        firstName: byName('applicant_first_name'),
        lastName: byName('applicant_last_name'),
        email: byName('email'),
        phone: byName('phone'),
        address: byName('address1'),
        city: byName('city'),
        state: byName('state'),
        zip: byName('q_88'),
        school: byName('school'),
        gradYear: byName('grad_year'),
        gpa: byName('gpa'),
        sat: byName('sat'),
        major: byName('intendedMajor'),
        activities: byName('activities'),
        essay: byName('essay_1'),
        citizenshipChecked: document.querySelector('input[name="citizenship"]:checked')?.value ?? null,
        genderChecked: document.querySelector('input[name="gender"]:checked')?.value ?? null,
        password: byName('password'),
        ssn: byName('ssn'),
        income: byName('household_income'),
      };
    });

    check('fills first name', values.firstName === 'Maya', values.firstName);
    check('fills last name', values.lastName === 'Okafor', values.lastName);
    check('fills email', values.email === 'maya.okafor@example.com', values.email);
    check('fills phone', values.phone === '555-0142', values.phone);
    check('fills street address', values.address === '1420 Elm Street', values.address);
    check('fills city', values.city === 'Fresno', values.city);
    check('selects the state option', values.state === 'CA', values.state);
    check('fills a placeholder-only ZIP field', values.zip === '93701', values.zip);
    check('fills school', values.school === 'Fresno High School', values.school);
    check('fills graduation year', values.gradYear === '2026', values.gradYear);
    check('fills GPA', values.gpa === '3.6', values.gpa);
    check('fills SAT', values.sat === '1380', values.sat);
    check('fills intended major', values.major === 'Computer Science', values.major);
    check('fills household income', values.income === '48000', values.income);
    check('fills the activities textarea', (values.activities ?? '').includes('Robotics Club'), values.activities);
    check('drops the saved essay into the essay prompt', (values.essay ?? '').includes('robotics team'), (values.essay ?? '').slice(0, 60));
    check('checks the citizenship radio', values.citizenshipChecked === 'citizen', values.citizenshipChecked);
    check('checks the gender radio', values.genderChecked === 'female', values.genderChecked);
    check('NEVER fills the password field', values.password === '', JSON.stringify(values.password));
    check('NEVER fills the SSN field', values.ssn === '', JSON.stringify(values.ssn));

    const postFillOverlay = await form.evaluate(() => {
      const host = document.getElementById('scholarpath-overlay-host');
      return host?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    });
    check('overlay reports the result', postFillOverlay.includes('Filled'), postFillOverlay.slice(0, 120));

    // --- Page capture ----------------------------------------------------------
    const capture = await sendToForm({ type: 'sp:capture-scholarship' });
    const draft = capture?.captured?.draft;
    check('captures the award amount from the page', draft?.amountMax === 2500, String(draft?.amountMax));
    check('captures the deadline from the page', draft?.deadline === '2026-03-15', draft?.deadline);
    check('captures the essay requirement', draft?.requirements?.essayCount === 1, String(draft?.requirements?.essayCount));
    check('captures the recommendation requirement', draft?.requirements?.recommendationLetters === 2, String(draft?.requirements?.recommendationLetters));
    check(
      'captures the stated GPA minimum as a rule',
      draft?.eligibility?.some((rule) => rule.field === 'academics.gpa' && rule.value === 3.25),
      JSON.stringify(draft?.eligibility?.map((rule) => rule.label)),
    );

    if (process.env.SMOKE_SCREENSHOTS) {
      // Viewport-sized, not full page: it matches what the side panel actually
      // looks like, and a full-page capture of the plan can be tall enough to
      // hang the screenshot protocol call.
      try {
        for (const tab of ['Home', 'Profile', 'Applications', 'Account']) {
          await clickTab(panel, tab);
          await panel.evaluate(() => document.querySelector('.view')?.scrollTo(0, 0));
          // Headless Chrome stalls when screenshotting a backgrounded tab.
          await panel.bringToFront();
          await panel.screenshot({
            path: resolve(root, `artifacts/panel-${tab.toLowerCase().replace(/\s+/g, '-')}.png`),
          });
        }
        await form.bringToFront();
        await form.screenshot({ path: resolve(root, 'artifacts/filled-form.png'), fullPage: true });
      } catch (error) {
        console.warn(`screenshots incomplete: ${error}`);
      }
    }

    const workerErrors = await workerHandle.evaluate(() => globalThis.__scholarpathErrors ?? []);
    check('service worker recorded no errors', workerErrors.length === 0, workerErrors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('All smoke checks passed.');
  }
}

async function clickTab(page, label) {
  await page.evaluate((name) => {
    const tab = [...document.querySelectorAll('.tabs .tab')].find((node) => node.textContent.trim().startsWith(name));
    tab?.click();
  }, label);
  await new Promise((done) => setTimeout(done, 350));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
