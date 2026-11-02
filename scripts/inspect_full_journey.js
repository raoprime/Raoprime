const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function testFullJourney() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const outDir = path.join(__dirname, '..', 'scratch_inspection_journey');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Testing Journey 1: Clean visitor landing on root / ...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Clear all cookies / storage for clean slate
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');

  await page.goto('http://localhost:4000/', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(outDir, '01_landing_modal_with_google.png') });

  // Verify Google button exists on landing modal
  const hasGoogleBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#nameModal button'));
    return btns.some(b => b.textContent && b.textContent.includes('Continue with Google'));
  });
  console.log('Landing has "Continue with Google" button:', hasGoogleBtn);

  // Close modal to see guest chat
  console.log('Testing Journey 2: Continuing into guest chat ...');
  await page.evaluate(() => {
    if (typeof closeNameModal === 'function') closeNameModal();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '02_guest_chat_view.png') });

  // Open profile modal
  console.log('Testing Journey 3: Opening Profile Drawer ...');
  await page.click('#headerProfileBtn');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '03_profile_drawer_clean.png') });

  // Test Journey 4: Verified User Landing (e.g. from Google callback)
  console.log('Testing Journey 4: Google Callback Return Simulation ...');
  const verifiedPage = await browser.newPage();
  await verifiedPage.setViewport({ width: 1440, height: 900 });
  await verifiedPage.goto('http://localhost:4000/?chat=dharmesh&google_verified=1', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  await verifiedPage.screenshot({ path: path.join(outDir, '04_verified_chat_view.png') });

  // Open profile drawer for verified user
  await verifiedPage.click('#headerProfileBtn');
  await new Promise(r => setTimeout(r, 600));
  await verifiedPage.screenshot({ path: path.join(outDir, '05_verified_profile_drawer.png') });

  // Test Journey 5: Admin Panel
  console.log('Testing Journey 5: Admin Panel ...');
  const adminPage = await browser.newPage();
  await adminPage.setViewport({ width: 1440, height: 900 });
  await adminPage.goto('http://localhost:4000/admin.html', { waitUntil: 'networkidle2' });
  await adminPage.type('#adminPasswordInput', 'rdmy');
  await adminPage.click('#adminLoginBtn');
  await new Promise(r => setTimeout(r, 1200));
  await adminPage.screenshot({ path: path.join(outDir, '06_admin_clean_dashboard.png') });

  await browser.close();
  console.log('All journeys tested! Screenshots saved in:', outDir);
}

testFullJourney().catch(err => {
  console.error('Journey test error:', err);
  process.exit(1);
});
