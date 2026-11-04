const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotsDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c38e69ac-5595-457b-aa92-0467d8bd2942\\screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  console.log('Navigating to http://localhost:4000 ...');
  await page.goto('http://localhost:4000', { waitUntil: 'networkidle2' });

  // 1. Capture Hero & Navigation
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_01_hero.png') });
  console.log('📸 Hero & Nav captured: raoprime_01_hero.png');

  // 2. Test Audio Player Interaction
  const playBtn = await page.$('#mainPlayPauseBtn');
  if (playBtn) {
    await playBtn.click();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_02_audio_player_active.png') });
    console.log('📸 Audio Player Active captured: raoprime_02_audio_player_active.png');
  }

  // 3. Scroll to Non-Profit Manifesto
  await page.evaluate(() => {
    const el = document.getElementById('manifesto');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_03_nonprofit_manifesto.png') });
  console.log('📸 Manifesto captured: raoprime_03_nonprofit_manifesto.png');

  // 4. Scroll to YouTube Hub
  await page.evaluate(() => {
    const el = document.getElementById('youtube');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_04_youtube_hub.png') });
  console.log('📸 YouTube Hub captured: raoprime_04_youtube_hub.png');

  // 5. Scroll to Demo Drop Section
  await page.evaluate(() => {
    const el = document.getElementById('demodrop');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_05_demo_drop.png') });
  console.log('📸 Demo Drop captured: raoprime_05_demo_drop.png');

  // 6. Scroll to Live Artist Portal & Community Chat Dock
  await page.evaluate(() => {
    const el = document.getElementById('community');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_06_community_chat_dock.png') });
  console.log('📸 Community Chat Dock captured: raoprime_06_community_chat_dock.png');

  // 7. Test sending a message in the community chat dock
  const msgInput = await page.$('#messageInput');
  const sendBtn = await page.$('#sendBtn');
  if (msgInput && sendBtn) {
    await msgInput.type('Raoprime non-profit music platform verified! Sound for the soul 🎵');
    await sendBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_07_live_message_sent.png') });
    console.log('📸 Live Message Sent captured: raoprime_07_live_message_sent.png');
  }

  // 8. Mobile Viewport (iPhone 14 / 390x844)
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(screenshotsDir, 'raoprime_08_mobile_view.png') });
  console.log('📸 Mobile View captured: raoprime_08_mobile_view.png');

  await browser.close();
  console.log('✅ ALL VERIFICATION SCREENSHOTS AND TESTS COMPLETED!');
  if (errors.length > 0) {
    console.log('Console Errors caught:', errors);
  } else {
    console.log('Zero console errors detected!');
  }
})();
