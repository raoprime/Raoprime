/**
 * Profile Section Live Test — raoprime portal
 * Tests: verified user state, profile modal, onboarding modal, admin login
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4000';
const SHOTS = path.join(__dirname, '..', 'scratch_inspection');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let browser, page;
const results = [];

function log(msg) { console.log('[TEST]', msg); }
function pass(label) { results.push({ label, status: 'PASS' }); log('✓ ' + label); }
function fail(label, err) { results.push({ label, status: 'FAIL', err: String(err) }); log('✗ ' + label + ' — ' + err); }

async function shot(name) {
  const f = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: f, fullPage: false });
  log('📸 ' + name + '.png');
  return f;
}

async function run() {
  browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 14 size

  // ── TEST 1: Onboarding modal appears for new visitor ──
  log('\n── TEST 1: Onboarding Modal ──');
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    const visible = await page.evaluate(() => {
      const el = document.getElementById('nameModal');
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      return !el.classList.contains('hidden') && cs.display !== 'none';
    });
    if (visible) pass('Onboarding modal visible on first visit');
    else fail('Onboarding modal visible on first visit', 'Modal hidden/missing');
    await shot('01_onboarding_modal');
  } catch (e) { fail('Onboarding modal visible on first visit', e.message); }

  // Check "Continue with Google" button in onboarding
  try {
    const btnText = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#nameModal button, #nameModal a'));
      return btns.map(b => b.textContent.trim());
    });
    if (btnText.some(t => t.includes('Continue with Google') || t.includes('Google'))) {
      pass('Onboarding has "Continue with Google" primary button');
    } else {
      fail('Onboarding has "Continue with Google" primary button', 'Button not found, got: ' + JSON.stringify(btnText));
    }
  } catch (e) { fail('Onboarding Google button check', e.message); }

  // ── TEST 2: Verified user state (raoprime.music) ──
  log('\n── TEST 2: Verified User (raoprime.music) ──');
  try {
    await page.goto(BASE + '/?chat=raoprime.music', { waitUntil: 'networkidle0', timeout: 15000 });
    // Wait for loadPhotoVerificationStatus to fetch from server
    await page.waitForFunction(() => {
      const status = document.getElementById('headerProfileStatusText');
      return status && status.textContent.includes('Verified');
    }, { timeout: 8000 });
    await sleep(500);

    // Check that nameModal is HIDDEN
    const modalHidden = await page.evaluate(() => {
      const el = document.getElementById('nameModal');
      return !el || el.classList.contains('hidden');
    });
    if (modalHidden) pass('Onboarding modal hidden for verified user');
    else fail('Onboarding modal hidden for verified user', 'Modal still showing');
    await shot('02_verified_user_landing');
  } catch (e) { fail('Verified user landing', e.message); }

  // Check header profile button
  try {
    const headerStatus = await page.evaluate(() => {
      const el = document.getElementById('headerProfileStatusText');
      return el ? el.textContent.trim() : null;
    });
    if (headerStatus && headerStatus.includes('Verified')) {
      pass('Header shows Verified status for raoprime.music');
    } else {
      fail('Header shows Verified status for raoprime.music', 'Got: ' + headerStatus);
    }
  } catch (e) { fail('Header verified status', e.message); }

  // Check welcome card verified row visible
  try {
    const verifiedRowVisible = await page.evaluate(() => {
      const row = document.getElementById('welcomeVerifiedRow');
      return row && !row.classList.contains('hidden');
    });
    if (verifiedRowVisible) pass('Welcome card shows verified row (@handle + Google Verified Account)');
    else fail('Welcome card shows verified row', 'Row still hidden');
  } catch (e) { fail('Welcome card verified row', e.message); }

  // ── TEST 3: Profile Modal (verified user) ──
  log('\n── TEST 3: Profile Modal ──');
  try {
    await page.click('#headerProfileBtn');
    await sleep(600);
    const modalVisible = await page.evaluate(() => {
      const el = document.getElementById('clientProfileModal');
      return el && !el.classList.contains('hidden');
    });
    if (modalVisible) pass('Profile modal opens on header button click');
    else fail('Profile modal opens', 'Modal still hidden');
    await shot('03_profile_modal_verified');
  } catch (e) { fail('Profile modal open', e.message); }

  // Check "Verified Account" badge pill
  try {
    const badgePill = await page.evaluate(() => {
      const el = document.getElementById('modalVerifiedBadgePill');
      return el ? el.textContent.trim() : null;
    });
    if (badgePill && badgePill.includes('Verified Account')) {
      pass('Profile modal shows "Verified Account" badge');
    } else {
      fail('Profile modal "Verified Account" badge', 'Got: ' + badgePill);
    }
  } catch (e) { fail('Profile modal badge', e.message); }

  // Check Google Verified Card is visible
  try {
    const googleCardVisible = await page.evaluate(() => {
      const el = document.getElementById('modalGoogleVerifiedCard');
      return el && !el.classList.contains('hidden');
    });
    if (googleCardVisible) pass('Google Verified card visible in profile modal');
    else fail('Google Verified card visible', 'Card hidden');
  } catch (e) { fail('Google Verified card', e.message); }

  // Check email shows in google card
  try {
    const emailText = await page.evaluate(() => {
      const el = document.getElementById('modalGoogleEmailText');
      return el ? el.textContent.trim() : null;
    });
    if (emailText && emailText.includes('@')) {
      pass('Google email shown in profile: ' + emailText);
    } else {
      fail('Google email in profile', 'Got: ' + emailText);
    }
  } catch (e) { fail('Google email check', e.message); }

  // Check Identity tag says "Verified ✓"
  try {
    const tag = await page.evaluate(() => {
      const el = document.getElementById('googleVerificationStatusTag');
      return el ? el.textContent.trim() : null;
    });
    if (tag && tag.includes('Verified')) {
      pass('Identity section tag shows "Verified ✓"');
    } else {
      fail('Identity section tag', 'Got: ' + tag);
    }
  } catch (e) { fail('Identity tag', e.message); }

  // Check username is permanent (lock badge)
  try {
    const lockBadge = await page.evaluate(() => {
      const el = document.querySelector('[title*="Permanent"]') || 
                 Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Permanent'));
      return el ? el.textContent.trim() : null;
    });
    if (lockBadge && lockBadge.includes('Permanent')) {
      pass('Username shows "Permanent" lock badge (cannot be changed)');
    } else {
      fail('Username Permanent badge', 'Not found');
    }
  } catch (e) { fail('Username permanent badge', e.message); }

  await shot('03b_profile_modal_details');

  // Close modal
  try {
    await page.evaluate(() => closeClientProfileModal());
    await sleep(400);
    const isClosed = await page.evaluate(() => {
      const el = document.getElementById('clientProfileModal');
      return !el || el.classList.contains('hidden');
    });
    if (isClosed) pass('Profile modal close works');
    else fail('Profile modal close', 'Still visible');
  } catch (e) { fail('Profile modal close', e.message); }

  // ── TEST 4: Profile Edit Mode ──
  log('\n── TEST 4: Profile Edit Mode ──');
  try {
    await page.evaluate(() => openClientProfileModal());
    await sleep(400);
    await page.click('#editProfileToggleBtn');
    await sleep(400);
    const editVisible = await page.evaluate(() => {
      const el = document.getElementById('profileEditMode');
      return el ? !el.classList.contains('hidden') : false;
    });
    if (editVisible) pass('Edit mode toggles on');
    else fail('Edit mode toggle', 'Edit mode not visible');

    // Check that username field is NOT editable (only name & phone)
    const usernameInput = await page.$('input[id="profileEditChatIdInput"]');
    if (!usernameInput) pass('Username has no edit input (permanent, correct)');
    else fail('Username immutability', 'Found editable chatId input');

    await shot('04_profile_edit_mode');
    await page.evaluate(() => cancelProfileInlineEdit());
    await page.evaluate(() => closeClientProfileModal());
  } catch (e) { fail('Profile edit mode', e.message); }

  // ── TEST 5: Admin Login ──
  log('\n── TEST 5: Admin Panel ──');
  try {
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    await shot('05_admin_login');

    const pwInput = await page.$('#passwordInput, input[type="password"]');
    if (pwInput) {
      pass('Admin login password input found');
      await pwInput.type('rdmy');

      const submitClicked = await page.evaluate(() => {
        const btn = document.getElementById('adminLoginBtn') || 
                    document.querySelector('button[type="submit"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => 
                      b.textContent.toLowerCase().includes('login') || 
                      b.textContent.toLowerCase().includes('enter') ||
                      b.textContent.toLowerCase().includes('access')
                    );
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (submitClicked) {
        await sleep(2000);
        await shot('06_admin_after_login');

        const dashVisible = await page.evaluate(() => {
          const authModal = document.getElementById('authModal');
          const isModalHidden = !authModal || authModal.classList.contains('hidden');
          const hasChatList = document.querySelector('#chatList, #clientListContainer, .client-item') !== null;
          return isModalHidden || hasChatList;
        });
        if (dashVisible) pass('Admin dashboard loaded after login');
        else fail('Admin dashboard', 'Auth modal still visible or dashboard not found');
      } else {
        fail('Admin submit button', 'Not found');
      }
    } else {
      fail('Admin login password input', 'Input not found');
    }
  } catch (e) { fail('Admin login', e.message); }

  // ── TEST 6: API Endpoints ──
  log('\n── TEST 6: API Endpoints ──');
  try {
    const health = await page.evaluate(async () => {
      const r = await fetch('/api/health');
      return r.status;
    });
    if (health === 200) pass('GET /api/health → 200');
    else fail('Health endpoint', 'Status: ' + health);
  } catch (e) { fail('Health endpoint', e.message); }

  try {
    const verif = await page.evaluate(async () => {
      const r = await fetch('/api/chat/verification?chatId=raoprime.music');
      const j = await r.json();
      return j;
    });
    if (verif.verified === true) pass('Verification API → verified:true for raoprime.music');
    else fail('Verification API', JSON.stringify(verif));
  } catch (e) { fail('Verification API', e.message); }

  // ── SUMMARY ──
  await browser.close();
  console.log('\n══════════════════════════════');
  console.log('TEST RESULTS SUMMARY');
  console.log('══════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`✓ Passed: ${passed.length}/${results.length}`);
  console.log(`✗ Failed: ${failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log('\nFailed tests:');
    failed.forEach(r => console.log(`  ✗ ${r.label}: ${r.err}`));
  }
  console.log('\nScreenshots:', SHOTS);
  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
