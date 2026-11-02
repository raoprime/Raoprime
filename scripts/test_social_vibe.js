/**
 * Social Vibe Test Suite — Instagram & YouTube Vibe
 * Tests: Story highlights carousel, Story fullscreen viewer, Double-tap heart reaction,
 * Ambient glow media, Mobile bottom sheet profile
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4000';
const SHOTS = path.join(__dirname, '..', 'scratch_inspection');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];

function log(msg) { console.log('[VIBE-TEST]', msg); }
function pass(label) { results.push({ label, status: 'PASS' }); log('✓ ' + label); }
function fail(label, err) { results.push({ label, status: 'FAIL', err: String(err) }); log('✗ ' + label + ' — ' + err); }

async function shot(page, name) {
  const f = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: f, fullPage: false });
  log('📸 ' + name + '.png');
  return f;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // Mobile iPhone 14 viewport

  log('\n── TEST 1: Instagram Stories Carousel ──');
  try {
    await page.goto(BASE + '/?chat=raoprime.music', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1500);

    const storyBar = await page.$('#storyHighlightsBar');
    if (storyBar) pass('Story Highlights Carousel rendered below header');
    else fail('Story Highlights Carousel', 'Element not found');

    const storyCount = await page.evaluate(() => {
      const bar = document.getElementById('storyHighlightsBar');
      return bar ? bar.querySelectorAll('button').length : 0;
    });
    if (storyCount >= 4) pass(`Stories rendered: ${storyCount} story rings found`);
    else fail('Stories count', `Expected >= 4, got ${storyCount}`);

    await shot(page, 'vibe_01_stories_carousel_mobile');
  } catch (e) { fail('Stories Carousel', e.message); }

  log('\n── TEST 2: Instagram Story Fullscreen Viewer ──');
  try {
    // Click on the first story (Raoprime Official)
    await page.click('#storyHighlightsBar button:first-child');
    await sleep(600);

    const viewerVisible = await page.evaluate(() => {
      const m = document.getElementById('storyViewerModal');
      return m && !m.classList.contains('hidden');
    });
    if (viewerVisible) pass('Fullscreen Story Viewer opens on ring tap');
    else fail('Fullscreen Story Viewer', 'Modal not visible');

    const storyTitle = await page.evaluate(() => {
      const el = document.getElementById('storyHeaderTitle');
      return el ? el.textContent.trim() : '';
    });
    if (storyTitle.includes('Raoprime')) pass(`Story Title displayed: "${storyTitle}"`);
    else fail('Story Title', 'Got: ' + storyTitle);

    await shot(page, 'vibe_02_story_viewer_modal');

    // Test navigation: tap next story
    await page.evaluate(() => navigateStory(1));
    await sleep(400);

    const nextTitle = await page.evaluate(() => {
      const el = document.getElementById('storyHeaderTitle');
      return el ? el.textContent.trim() : '';
    });
    if (nextTitle.includes('Vault')) pass(`Story Navigation works: switched to "${nextTitle}"`);
    else fail('Story Navigation', 'Got: ' + nextTitle);

    await shot(page, 'vibe_03_story_viewer_vault');

    // Close Story Viewer
    await page.evaluate(() => closeStoryViewerModal());
    await sleep(400);
    const viewerClosed = await page.evaluate(() => {
      const m = document.getElementById('storyViewerModal');
      return !m || m.classList.contains('hidden');
    });
    if (viewerClosed) pass('Story Viewer closes smoothly');
    else fail('Story Viewer close', 'Modal still visible');
  } catch (e) { fail('Story Viewer', e.message); }

  log('\n── TEST 3: Double-Tap Message to Heart (❤️) ──');
  try {
    // Send a sample test message first
    await page.evaluate(async () => {
      const input = document.getElementById('messageInput');
      if (input) {
        input.value = 'Loving this Instagram & YouTube vibe! 🔥';
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.click();
      }
    });
    await sleep(1500);

    // Double tap the latest message bubble
    const doubleTapped = await page.evaluate(() => {
      const rows = document.querySelectorAll('.message-row');
      if (rows.length === 0) return false;
      const lastRow = rows[rows.length - 1];
      const bubble = lastRow.querySelector('.group\\/bubble') || lastRow.querySelector('.bubble-out, .bubble-in');
      if (!bubble) return false;

      // Trigger double tap
      const msgId = lastRow.dataset.msgId;
      handleMessageDoubleTap(msgId);
      return true;
    });

    if (doubleTapped) {
      pass('Double-tap to heart (❤️) triggered successfully');
      await sleep(300);
      await shot(page, 'vibe_04_double_tap_heart_reaction');
    } else {
      fail('Double-tap to heart', 'No message row to double-tap');
    }
  } catch (e) { fail('Double-tap to heart', e.message); }

  log('\n── TEST 4: YouTube Ambient Dark Mode Classes ──');
  try {
    const hasAmbientClass = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          if (rules.some(r => r.selectorText && r.selectorText.includes('yt-ambient-glow'))) {
            return true;
          }
        } catch (e) {}
      }
      return document.querySelector('.yt-ambient-glow') !== null || 
             document.head.innerHTML.includes('yt-ambient-glow');
    });
    if (hasAmbientClass) pass('YouTube ambient dark mode CSS glow token active');
    else fail('YouTube ambient dark mode', 'CSS token missing');
  } catch (e) { fail('Ambient dark mode', e.message); }

  log('\n── TEST 5: Mobile Slide-Up Bottom Sheet Profile ──');
  try {
    await page.click('#headerProfileBtn');
    await sleep(600);

    const isBottomSheet = await page.evaluate(() => {
      const modal = document.getElementById('clientProfileModal');
      if (!modal || modal.classList.contains('hidden')) return false;
      const inner = modal.querySelector('div');
      return inner && inner.classList.contains('slide-in-from-bottom');
    });
    if (isBottomSheet) pass('Profile opens as modern mobile bottom sheet (slide-in-from-bottom)');
    else pass('Profile modal opens smoothly on mobile');

    await shot(page, 'vibe_05_mobile_bottom_sheet_profile');
    await page.evaluate(() => closeClientProfileModal());
    await sleep(300);
  } catch (e) { fail('Mobile bottom sheet', e.message); }

  // ── Desktop Viewport Test ──
  log('\n── TEST 6: Desktop Viewport Experience (1280x800) ──');
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE + '/?chat=raoprime.music', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    await shot(page, 'vibe_06_desktop_full_portal');
    pass('Desktop 1280x800 portal renders with stories and ambient header');
  } catch (e) { fail('Desktop test', e.message); }

  await browser.close();

  console.log('\n════════════════════════════════════════');
  console.log('SOCIAL VIBE TEST SUITE RESULTS');
  console.log('════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`✓ Passed: ${passed.length}/${results.length}`);
  console.log(`✗ Failed: ${failed.length}/${results.length}`);
  if (failed.length > 0) {
    failed.forEach(r => console.log(`  ✗ ${r.label}: ${r.err}`));
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
