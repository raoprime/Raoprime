/**
 * Full Website Check + Screenshots
 * Captures every key page/state of the Raoprime portal
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4000';
const OUT = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c38e69ac-5595-457b-aa92-0467d8bd2942\\screenshots';
const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c38e69ac-5595-457b-aa92-0467d8bd2942';

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];

function log(label, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
  console.log(`${icon} [${status}] ${label}${detail ? ' — ' + detail : ''}`);
  results.push({ label, status, detail });
}

async function saveScreenshot(page, name, label) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  // Also copy directly to artifact directory for markdown embedding
  const artifactFile = path.join(ARTIFACT_DIR, `${name}.png`);
  fs.copyFileSync(file, artifactFile);
  log(label, 'PASS', `saved: ${name}.png`);
  return file;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 }
  });

  try {
    // ─── 1. Onboarding Modal (fresh visit, no chat param) ───────────────────
    console.log('\n═══ TEST 1: Onboarding Modal ═══');
    const p1 = await browser.newPage();
    p1.on('console', msg => { if (msg.type() === 'error') log('Console Error (onboarding)', 'FAIL', msg.text()); });
    await p1.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    // Check onboarding modal
    const hasModal = await p1.$('#nameModal, #onboardingModal, [id*="Modal"]');
    log('Onboarding modal present', hasModal ? 'PASS' : 'FAIL');
    
    const hasGoogleBtn = await p1.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.some(b => b.textContent.includes('Google') || b.textContent.includes('Continue'));
    });
    log('Google/Continue button visible', hasGoogleBtn ? 'PASS' : 'FAIL');
    await saveScreenshot(p1, '01_onboarding_modal', 'Screenshot: Onboarding Modal');
    await p1.close();

    // ─── 2. Verified User Landing (raoprime.music) ──────────────────────────
    console.log('\n═══ TEST 2: Verified User Landing ═══');
    const p2 = await browser.newPage();
    p2.on('console', msg => { if (msg.type() === 'error') log('Console Error (verified landing)', 'FAIL', msg.text().substring(0, 100)); });
    await p2.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    
    // Check stories carousel
    const hasStories = await p2.$('.stories-container, .story-ring, [class*="story"]');
    log('Instagram Stories carousel present', hasStories ? 'PASS' : 'FAIL');
    
    // Check verified header
    const verifiedBadge = await p2.evaluate(() => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent && el.textContent.includes('Verified') && el.className && el.className.includes) {
          return true;
        }
      }
      return document.body.innerHTML.includes('Verified') || document.body.innerHTML.includes('verified');
    });
    log('Verified badge/text visible', verifiedBadge ? 'PASS' : 'FAIL');
    
    await saveScreenshot(p2, '02_verified_user_landing', 'Screenshot: Verified User Landing');
    await p2.close();

    // ─── 3. Mobile View (375px) ─────────────────────────────────────────────
    console.log('\n═══ TEST 3: Mobile View ═══');
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 375, height: 812 });
    await p3.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    await saveScreenshot(p3, '03_mobile_view', 'Screenshot: Mobile View (375px)');
    await p3.close();

    // ─── 4. Profile Modal ───────────────────────────────────────────────────
    console.log('\n═══ TEST 4: Profile Modal ═══');
    const p4 = await browser.newPage();
    await p4.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    
    // Try clicking profile avatar/button
    const clicked = await p4.evaluate(() => {
      const selectors = ['#profileAvatar', '.profile-avatar', '[onclick*="profile"]', '[onclick*="Profile"]', '#clientProfileAvatar'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return sel; }
      }
      // Try any avatar-like element
      const avatars = document.querySelectorAll('img[class*="avatar"], img[id*="avatar"], .avatar');
      if (avatars.length) { avatars[0].click(); return 'img.avatar'; }
      return null;
    });
    log('Profile avatar click', clicked ? 'PASS' : 'FAIL', clicked || 'no selector found');
    await sleep(1500);
    
    // Check if profile modal opened
    const profileModalOpen = await p4.evaluate(() => {
      const modals = document.querySelectorAll('[class*="modal"], [id*="profile"], [id*="Profile"]');
      for (const m of modals) {
        const style = window.getComputedStyle(m);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          return m.id || m.className;
        }
      }
      return null;
    });
    log('Profile modal opened', profileModalOpen ? 'PASS' : 'FAIL', profileModalOpen || '');
    await saveScreenshot(p4, '04_profile_modal', 'Screenshot: Profile Modal');
    await p4.close();

    // ─── 5. Story Viewer ────────────────────────────────────────────────────
    console.log('\n═══ TEST 5: Story Viewer ═══');
    const p5 = await browser.newPage();
    await p5.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    
    const storyClicked = await p5.evaluate(() => {
      const story = document.querySelector('.story-ring, .story-item, [class*="story-ring"], [onclick*="story"], [onclick*="Story"]');
      if (story) { story.click(); return true; }
      return false;
    });
    log('Story ring click', storyClicked ? 'PASS' : 'FAIL');
    await sleep(1500);
    
    const storyViewerOpen = await p5.evaluate(() => {
      const viewer = document.querySelector('#storyViewerModal, [id*="storyViewer"], [class*="story-viewer"]');
      if (!viewer) return false;
      const style = window.getComputedStyle(viewer);
      return style.display !== 'none';
    });
    log('Story viewer modal opened', storyViewerOpen ? 'PASS' : 'FAIL');
    await saveScreenshot(p5, '05_story_viewer', 'Screenshot: Story Viewer');
    await p5.close();

    // ─── 6. Admin Login Page ────────────────────────────────────────────────
    console.log('\n═══ TEST 6: Admin Login ═══');
    const p6 = await browser.newPage();
    await p6.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    const adminPageLoaded = await p6.evaluate(() => {
      return document.title.toLowerCase().includes('admin') || 
             document.body.innerHTML.includes('admin') ||
             document.body.innerHTML.includes('Admin') ||
             !!document.querySelector('input[type="password"]');
    });
    log('Admin page loaded', adminPageLoaded ? 'PASS' : 'FAIL');
    await saveScreenshot(p6, '06_admin_login', 'Screenshot: Admin Login');
    
    // Try logging in
    const pwInput = await p6.$('input[type="password"]');
    if (pwInput) {
      await pwInput.type('rdmy');
      log('Admin password typed', 'PASS', 'rdmy');
      
      // Find submit button
      const submitted = await p6.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const loginBtn = btns.find(b => b.textContent.toLowerCase().includes('login') || b.textContent.toLowerCase().includes('enter') || b.type === 'submit');
        if (loginBtn) { loginBtn.click(); return true; }
        const inputs = [...document.querySelectorAll('input[type="submit"], input[type="button"]')];
        if (inputs.length) { inputs[0].click(); return true; }
        return false;
      });
      log('Admin login submit clicked', submitted ? 'PASS' : 'FAIL');
      await sleep(2000);
      await saveScreenshot(p6, '07_admin_dashboard', 'Screenshot: Admin Dashboard');
      
      // Check if dashboard loaded
      const dashboardLoaded = await p6.evaluate(() => {
        return document.body.innerHTML.includes('client') || 
               document.body.innerHTML.includes('Client') ||
               document.body.innerHTML.includes('dashboard') ||
               document.body.innerHTML.includes('Dashboard');
      });
      log('Admin dashboard loaded after login', dashboardLoaded ? 'PASS' : 'FAIL');
    } else {
      log('Password input not found', 'FAIL');
    }
    await p6.close();

    // ─── 7. API Endpoints Check ─────────────────────────────────────────────
    console.log('\n═══ TEST 7: API Endpoints ═══');
    const p7 = await browser.newPage();
    
    const apis = [
      { url: '/api/health', label: 'Health API', expect: 'ok' },
      { url: '/api/chat/verification?chatId=raoprime.music', label: 'Verification API', expect: 'verified' },
      { url: '/api/chat/verification?chatId=RAOPRIME.MUSIC', label: 'Verification API (uppercase)', expect: 'verified' },
    ];
    
    for (const api of apis) {
      try {
        const resp = await p7.goto(`${BASE}${api.url}`, { waitUntil: 'load' });
        const body = await p7.evaluate(() => document.body.innerText);
        const data = JSON.parse(body);
        const pass = JSON.stringify(data).includes(api.expect);
        log(api.label, pass ? 'PASS' : 'FAIL', JSON.stringify(data).substring(0, 100));
      } catch (e) {
        log(api.label, 'FAIL', e.message.substring(0, 80));
      }
    }
    await p7.close();

    // ─── 8. Live Render Check ───────────────────────────────────────────────
    console.log('\n═══ TEST 8: Live Render Site ═══');
    try {
      const fetchRes = await fetch('https://raoprime.onrender.com/api/health');
      const data = await fetchRes.json();
      log('Live Render health', data.status === 'ok' ? 'PASS' : 'FAIL', JSON.stringify(data));
    } catch (e) {
      log('Live Render health', 'FAIL', e.message.substring(0, 80));
    }
    
    const p8 = await browser.newPage();
    p8.setDefaultTimeout(30000);
    try {
      await p8.goto('https://raoprime.onrender.com/?chat=raoprime.music', { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
      await saveScreenshot(p8, '08_live_render_site', 'Screenshot: Live Render Site');
      log('Live Render site screenshot', 'PASS');
    } catch (e) {
      log('Live Render site screenshot', 'FAIL', e.message.substring(0, 80));
    }
    await p8.close();

    // ─── 9. Double-Tap Heart Test ───────────────────────────────────────────
    console.log('\n═══ TEST 9: Double-Tap Heart ═══');
    const p9 = await browser.newPage();
    await p9.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    
    const heartFnExists = await p9.evaluate(() => {
      return typeof window.handleMessageDoubleTap === 'function' ||
             typeof handleMessageDoubleTap === 'function';
    });
    log('Double-tap heart function exists', heartFnExists ? 'PASS' : 'FAIL');
    await p9.close();

    // ─── 10. Console Errors Check ───────────────────────────────────────────
    console.log('\n═══ TEST 10: Zero Console Errors ═══');
    const p10 = await browser.newPage();
    const errors = [];
    p10.on('console', msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // Ignore known benign errors
        if (!txt.includes('favicon') && !txt.includes('net::ERR_ABORTED') && !txt.includes('Non-Error promise rejection')) {
          errors.push(txt.substring(0, 100));
        }
      }
    });
    p10.on('pageerror', err => errors.push(`JS ERROR: ${err.message.substring(0, 100)}`));
    await p10.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    
    if (errors.length === 0) {
      log('Zero console errors', 'PASS', 'No errors detected');
    } else {
      log('Zero console errors', 'FAIL', `${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
    }
    await p10.close();

  } catch (err) {
    console.error('Fatal error:', err.message);
    results.push({ label: 'Fatal error', status: 'FAIL', detail: err.message });
  } finally {
    await browser.close();
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║          FULL CHECK RESULTS SUMMARY        ║');
  console.log('╚════════════════════════════════════════════╝');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`${icon} ${r.label}${r.detail ? ': ' + r.detail.substring(0, 80) : ''}`);
  });
  console.log(`\n🎯 TOTAL: ${passed} PASSED, ${failed} FAILED out of ${results.length} checks`);
  
  if (failed === 0) {
    console.log('🌟 ALL CHECKS PASSED — WEBSITE IS FULLY WORKING!');
  } else {
    console.log('⚠️  Some checks failed — see details above');
  }

  // Write JSON report
  const report = { timestamp: new Date().toISOString(), passed, failed, total: results.length, results };
  fs.writeFileSync(path.join(OUT, 'check_report.json'), JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${OUT}\\check_report.json`);
  console.log(`📸 Screenshots saved to: ${OUT}`);
})();
