const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function inspect() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const outDir = path.join(__dirname, '..', 'scratch_inspection');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Desktop Client
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }));

  await page.goto('http://localhost:4000/?chat=client', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(outDir, '01_desktop_main.png') });

  // Try opening profile
  try {
    const profileBtn = await page.$('#profileTriggerBtn, button[onclick*="openProfileDrawer"], [onclick*="toggleProfileDrawer"]');
    if (profileBtn) {
      await profileBtn.click();
      await new Promise(r => setTimeout(r, 800));
      await page.screenshot({ path: path.join(outDir, '02_desktop_profile_drawer.png') });
    } else {
      console.log('Profile button not found with selector');
    }
  } catch (e) {
    console.error('Failed to open profile drawer:', e.message);
  }

  // Check header or settings or other interactive buttons
  try {
    const attachBtn = await page.$('#attachBtn, button[title*="Attach"]');
    if (attachBtn) {
      await attachBtn.click();
      await new Promise(r => setTimeout(r, 400));
      await page.screenshot({ path: path.join(outDir, '03_desktop_attach_menu.png') });
    }
  } catch (e) {
    console.error('Attach btn error:', e.message);
  }

  // 2. Mobile View
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobilePage.goto('http://localhost:4000/?chat=client', { waitUntil: 'networkidle2' });
  await mobilePage.screenshot({ path: path.join(outDir, '04_mobile_main.png') });

  // 3. Admin View
  const adminPage = await browser.newPage();
  await adminPage.setViewport({ width: 1440, height: 900 });
  await adminPage.goto('http://localhost:4000/admin.html', { waitUntil: 'networkidle2' });
  await adminPage.screenshot({ path: path.join(outDir, '05_admin_login.png') });

  // Try admin login with password "rdmy"
  try {
    const passInput = await adminPage.$('#adminPasswordInput, input[type="password"]');
    if (passInput) {
      await passInput.type('rdmy');
      const submitBtn = await adminPage.$('#adminLoginBtn, button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await new Promise(r => setTimeout(r, 1200));
      await adminPage.screenshot({ path: path.join(outDir, '06_admin_dashboard.png') });
    }
  } catch (e) {
    console.error('Admin login error:', e.message);
  }

  // 4. Live Render Check
  const livePage = await browser.newPage();
  await livePage.setViewport({ width: 1440, height: 900 });
  try {
    await livePage.goto('https://raoprime.onrender.com/?chat=client', { waitUntil: 'networkidle2', timeout: 30000 });
    await livePage.screenshot({ path: path.join(outDir, '07_live_render_main.png') });
  } catch (e) {
    console.error('Live Render navigation error:', e.message);
  }

  await browser.close();

  fs.writeFileSync(path.join(outDir, 'logs.json'), JSON.stringify(consoleLogs, null, 2));
  console.log('Inspection completed successfully. Screenshots in:', outDir);
}

inspect().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
