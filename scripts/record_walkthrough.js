const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve('C:/Users/DELL/.gemini/antigravity/scratch/client-document-portal/handoff/video');
const VIDEO_PATH = path.join(OUT_DIR, 'walkthrough.mp4');
const FFMPEG_PATH = 'C:\\Users\\DELL\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Helper: sleep
const wait = ms => new Promise(r => setTimeout(r, ms));

async function runWalkthrough() {
  console.log('🎬 Initializing Exploratory Walkthrough Video Recording...');
  console.log(`Target Video: ${VIDEO_PATH}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  // Initialize FFmpeg pipe at 25fps 1920x1080
  console.log('🎥 Spawning FFmpeg video encoder...');
  const ffmpeg = spawn(FFMPEG_PATH, [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', '25',
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    VIDEO_PATH
  ]);

  ffmpeg.stderr.on('data', data => {
    // console.log(`FFmpeg: ${data.toString().trim()}`);
  });

  ffmpeg.on('error', err => {
    console.error('FFmpeg process error:', err);
  });

  let lastFrame = null;
  let isRecording = true;

  // Initial capture to seed lastFrame
  await page.goto('about:blank');
  lastFrame = await page.screenshot({ type: 'jpeg', quality: 90 });

  // Setup CDP screencast
  const client = await page.target().createCDPSession();
  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    if (isRecording) {
      lastFrame = Buffer.from(data, 'base64');
    }
    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch (e) {}
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1
  });

  // 25 fps pump timer
  const frameInterval = setInterval(() => {
    if (isRecording && lastFrame && ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(lastFrame);
    }
  }, 40);

  try {
    console.log('\n======================================================');
    console.log('ACT 1: LOCAL ADMIN CONSOLE EXPLORATION (http://localhost:4000/admin)');
    console.log('======================================================');

    // 1. Navigate to Local Admin Login
    console.log('Step 1: Navigating to Local Admin Login Gateway...');
    await page.goto('http://localhost:4000/admin', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      const gateway = document.getElementById('loginGateway');
      if (gateway) gateway.classList.remove('hidden');
    });
    await wait(1500);

    // 2. Unlock Admin Console with 'rdmy'
    console.log('Step 2: Entering admin password "rdmy" and unlocking...');
    await page.focus('#adminPasswordInput');
    await wait(400);
    await page.type('#adminPasswordInput', 'rdmy', { delay: 180 });
    await wait(600);
    await page.click('#unlockBtn');
    await wait(2200);

    // 3. Search in inbox
    console.log('Step 3: Filtering conversations in sidebar...');
    await page.focus('#searchInput');
    await page.type('#searchInput', 'Dharmesh', { delay: 120 });
    await wait(1200);
    // Clear search
    await page.evaluate(() => {
      const input = document.getElementById('searchInput');
      if (input) {
        input.value = '';
        if (typeof filterChats === 'function') filterChats();
      }
    });
    await wait(800);

    // 4. Select Dharmesh conversation
    console.log('Step 4: Opening Dharmesh active conversation...');
    await page.evaluate(() => {
      if (typeof selectChat === 'function') {
        selectChat('Dharmesh', true);
      } else {
        const item = document.querySelector('.chat-item');
        if (item) item.click();
      }
    });
    await wait(2000);

    // 5. Open Client Intelligence Modal
    console.log('Step 5: Inspecting Client Device & Telemetry Intelligence modal...');
    await page.evaluate(() => {
      if (typeof openClientIntelModal === 'function') openClientIntelModal();
      else {
        const btn = document.getElementById('clientIntelBtn');
        if (btn) btn.click();
      }
    });
    await wait(2500);

    // Close Intel Modal
    await page.evaluate(() => {
      if (typeof closeClientIntelModal === 'function') closeClientIntelModal();
    });
    await wait(800);

    // 6. Inspect Rename Chat Modal
    console.log('Step 6: Opening Rename Chat modal...');
    await page.evaluate(() => {
      if (typeof openRenameModal === 'function') openRenameModal();
    });
    await wait(1500);
    await page.evaluate(() => {
      if (typeof closeRenameModal === 'function') closeRenameModal();
    });
    await wait(800);

    // 7. Inspect Photo Verification Modal
    console.log('Step 7: Inspecting Photo Verification Approval modal...');
    await page.evaluate(() => {
      if (typeof viewClientVerifiedPhoto === 'function') {
        viewClientVerifiedPhoto(
          'https://lh3.googleusercontent.com/a/ACg8ocLM4e9iD7orOAZxXoGqqCeUXWxhFp_Gj-GJ0eW1rYzFlsfpUhE=s96-c',
          'Dharmesh',
          'xraoprime@gmail.com',
          'google'
        );
      }
    });
    await wait(2000);
    await page.evaluate(() => {
      if (typeof closeAdminPhotoModal === 'function') closeAdminPhotoModal();
    });
    await wait(800);

    // 8. Admin sends an interactive reply message
    console.log('Step 8: Admin sending real-time reply message in velvet maroon stream...');
    const adminInput = await page.$('#adminMessageInput');
    if (adminInput) {
      await adminInput.focus();
      await wait(400);
      await adminInput.type('Your identity and cloud files have been verified. Welcome to Raoprime VIP.', { delay: 50 });
      await wait(600);
      const adminSend = await page.$('#adminSendBtn');
      if (adminSend) await adminSend.click();
      await wait(2000);
    } else {
      console.log('Note: Admin message composer not directly present in current layout, continuing...');
    }

    console.log('\n======================================================');
    console.log('ACT 2: LOCAL CLIENT PORTAL EXPLORATION (http://localhost:4000/?chat=Dharmesh)');
    console.log('======================================================');

    // 9. Navigate to Client Portal
    console.log('Step 9: Navigating to Client Portal with Signature Velvet Maroon styling...');
    await page.goto('http://localhost:4000/?chat=Dharmesh', { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2200);

    // 10. Client sends an interactive message
    console.log('Step 10: Client sending interactive message...');
    const clientInput = await page.$('#messageInput');
    if (clientInput) {
      await clientInput.focus();
      await wait(400);
      await clientInput.type('Confirmed received! The Obsidian & Velvet Maroon luxury theme looks exceptional.', { delay: 50 });
      await wait(600);
      const clientSend = await page.$('#sendBtn');
      if (clientSend) await clientSend.click();
      await wait(2000);
    }

    // 11. Open "My Profile" Modal (View Mode)
    console.log('Step 11: Opening "My Profile" Modal (View Mode)...');
    await page.evaluate(() => {
      if (typeof openClientProfileModal === 'function') openClientProfileModal();
      else {
        const btn = document.getElementById('headerProfileBtn');
        if (btn) btn.click();
      }
    });
    await wait(2500);

    // 12. Toggle "My Profile" Modal to Edit Mode
    console.log('Step 12: Toggling "My Profile" Modal into Inline Edit Mode...');
    await page.evaluate(() => {
      if (typeof toggleProfileInlineEdit === 'function') toggleProfileInlineEdit();
    });
    await wait(2000);

    // Cancel edit mode and close profile modal
    await page.evaluate(() => {
      if (typeof cancelProfileInlineEdit === 'function') cancelProfileInlineEdit();
      if (typeof closeClientProfileModal === 'function') closeClientProfileModal();
    });
    await wait(800);

    // 13. Open Raoprime Organization Info Modal
    console.log('Step 13: Opening Raoprime Organization Info modal...');
    await page.evaluate(() => {
      if (typeof openProfileModal === 'function') openProfileModal();
    });
    await wait(2000);
    await page.evaluate(() => {
      if (typeof closeProfileModal === 'function') closeProfileModal();
    });
    await wait(800);

    // 14. Open Photo Lightbox
    console.log('Step 14: Inspecting Photo Lightbox modal...');
    await page.evaluate(() => {
      if (typeof openPhotoLightbox === 'function') openPhotoLightbox('/assets/rp-logo.jpg');
    });
    await wait(1800);
    await page.evaluate(() => {
      if (typeof closePhotoLightbox === 'function') closePhotoLightbox();
    });
    await wait(800);

    console.log('\n======================================================');
    console.log('ACT 3: LIVE RENDER DEPLOYMENT EXPLORATION (https://raoprime.onrender.com)');
    console.log('======================================================');

    // 15. Navigate to Live Admin
    console.log('Step 15: Navigating to Live Admin Console on Render...');
    await page.goto('https://raoprime.onrender.com/admin', { waitUntil: 'networkidle2', timeout: 35000 });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      const gateway = document.getElementById('loginGateway');
      if (gateway) gateway.classList.remove('hidden');
    });
    await wait(1500);

    // 16. Unlock Live Admin Console
    console.log('Step 16: Entering password "rdmy" on Live Admin Console...');
    await page.focus('#adminPasswordInput');
    await wait(400);
    await page.type('#adminPasswordInput', 'rdmy', { delay: 180 });
    await wait(600);
    await page.click('#unlockBtn');
    await wait(2500);

    // 17. Select Dharmesh conversation on Live Admin
    console.log('Step 17: Selecting conversation on Live Admin Console...');
    await page.evaluate(() => {
      if (typeof selectChat === 'function') {
        selectChat('Dharmesh', true);
      } else {
        const item = document.querySelector('.chat-item');
        if (item) item.click();
      }
    });
    await wait(2200);

    // 18. Inspect Client Intel on Live
    console.log('Step 18: Opening Client Intel on Live Admin...');
    await page.evaluate(() => {
      if (typeof openClientIntelModal === 'function') openClientIntelModal();
    });
    await wait(2200);
    await page.evaluate(() => {
      if (typeof closeClientIntelModal === 'function') closeClientIntelModal();
    });
    await wait(800);

    // 19. Navigate to Live Client Portal
    console.log('Step 19: Navigating to Live Client Portal...');
    await page.goto('https://raoprime.onrender.com/?chat=Dharmesh', { waitUntil: 'networkidle2', timeout: 35000 });
    await wait(2200);

    // 20. Open Profile Modal on Live Client
    console.log('Step 20: Opening My Profile Modal on Live Client Portal...');
    await page.evaluate(() => {
      if (typeof openClientProfileModal === 'function') openClientProfileModal();
    });
    await wait(2200);
    await page.evaluate(() => {
      if (typeof closeClientProfileModal === 'function') closeClientProfileModal();
    });
    await wait(1500);

    console.log('\n🎬 Walkthrough Exploration Sequence Completed Successfully!');
  } catch (err) {
    console.error('❌ Error during walkthrough sequence:', err);
    throw err;
  } finally {
    console.log('Stopping screencast and finalizing video encoding...');
    isRecording = false;
    clearInterval(frameInterval);

    try {
      await client.send('Page.stopScreencast');
    } catch (e) {}

    await browser.close();

    ffmpeg.stdin.end();

    await new Promise((resolve, reject) => {
      ffmpeg.on('close', code => {
        if (code === 0) {
          console.log(`✅ Video file written and finalized: ${VIDEO_PATH}`);
          resolve();
        } else {
          console.error(`FFmpeg exited with code ${code}`);
          resolve();
        }
      });
    });
  }
}

runWalkthrough().catch(err => {
  console.error('Fatal walkthrough failure:', err);
  process.exit(1);
});
