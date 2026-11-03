const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve('C:/Users/DELL/.gemini/antigravity/scratch/client-document-portal/handoff/video');
const VIDEO_PATH = path.join(OUT_DIR, 'walkthrough.mp4');
const ARTIFACT_VIDEO_PATH = path.resolve('C:/Users/DELL/.gemini/antigravity/brain/c38e69ac-5595-457b-aa92-0467d8bd2942/walkthrough.mp4');
const FFMPEG_PATH = 'C:\\Users\\DELL\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function runWalkthrough() {
  console.log('🎬 Initializing Complete Exploratory Walkthrough Video Recording...');
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

  ffmpeg.stderr.on('data', () => {});
  ffmpeg.on('error', err => {
    console.error('FFmpeg process error:', err);
  });

  let lastFrame = null;
  let isRecording = true;

  await page.goto('about:blank');
  lastFrame = await page.screenshot({ type: 'jpeg', quality: 90 });

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

  const frameInterval = setInterval(() => {
    if (isRecording && lastFrame && ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(lastFrame);
    }
  }, 40);

  try {
    // ══════════════════════════════════════════════════════════
    // ACT 1: FIRST VISIT ONBOARDING & GOOGLE SIGN-IN EXPERIENCE
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 1] Exploring First-Visit Onboarding Experience...');
    await page.goto('http://localhost:4000/', { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2000);

    // Onboarding modal is displayed with "Continue with Google"
    console.log('→ Inspecting Onboarding Welcome Modal with Google button...');
    await wait(2500);

    // Close onboarding modal to explore guest view
    await page.evaluate(() => {
      if (typeof closeNameModal === 'function') closeNameModal();
    });
    await wait(1500);

    // ══════════════════════════════════════════════════════════
    // ACT 2: INSTAGRAM STORIES HIGHLIGHTS CAROUSEL & FULLSCREEN VIEWER
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 2] Exploring Instagram Stories Carousel...');
    await page.goto('http://localhost:4000/?chat=raoprime.music', { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2500);

    // Click Story 1: Raoprime Official
    console.log('→ Opening Raoprime Official Story (Instagram gradient ring)...');
    await page.click('#storyHighlightsBar button:first-child');
    await wait(3000);

    // Navigate to next story
    console.log('→ Navigating to Documents Vault Story...');
    await page.evaluate(() => navigateStory(1));
    await wait(2500);

    // Navigate to Audio Story
    console.log('→ Navigating to Studio Voice Notes Story...');
    await page.evaluate(() => navigateStory(1));
    await wait(2500);

    // Close Story Viewer
    console.log('→ Closing Story Viewer...');
    await page.evaluate(() => closeStoryViewerModal());
    await wait(1500);

    // ══════════════════════════════════════════════════════════
    // ACT 3: CHAT STREAM, DOUBLE-TAP HEART & AMBIENT MEDIA
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 3] Exploring Interactive Chat & Double-Tap Heart...');
    
    // Send a live test message
    const clientInput = await page.$('#messageInput');
    if (clientInput) {
      await clientInput.focus();
      await wait(400);
      await clientInput.type('Raoprime Executive Portal: Instagram & YouTube Vibe Active! 🚀', { delay: 40 });
      await wait(600);
      const sendBtn = await page.$('#sendBtn');
      if (sendBtn) await sendBtn.click();
      await wait(2000);
    }

    // Double-tap the message to trigger floating heart burst
    console.log('→ Triggering Double-Tap to React (❤️) with floating burst...');
    await page.evaluate(() => {
      const rows = document.querySelectorAll('.message-row');
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        handleMessageDoubleTap(last.dataset.msgId);
      }
    });
    await wait(2000);

    // Open universal document previewer
    console.log('→ Opening Universal Document Lightbox Previewer...');
    await page.evaluate(() => {
      if (typeof openDocumentPreview === 'function') {
        openDocumentPreview('/assets/rp-logo.jpg', 'Master_Contract_Raoprime_Signed.pdf', '2.4 MB');
      }
    });
    await wait(2500);
    await page.evaluate(() => {
      if (typeof closeDocumentPreviewModal === 'function') closeDocumentPreviewModal();
    });
    await wait(1200);

    // ══════════════════════════════════════════════════════════
    // ACT 4: CLIENT PROFILE MODAL (APPLE / TELEGRAM GRADE)
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 4] Exploring Client Profile Modal & Locked Username...');
    await page.click('#headerProfileBtn');
    await wait(2500);

    // Toggle inline edit mode
    console.log('→ Toggling Inline Profile Edit Mode (Display Name & WhatsApp)...');
    await page.evaluate(() => toggleProfileInlineEdit());
    await wait(2000);

    // Cancel edit and close profile modal
    console.log('→ Saving/Closing Profile Modal...');
    await page.evaluate(() => {
      cancelProfileInlineEdit();
      closeClientProfileModal();
    });
    await wait(1500);

    // ══════════════════════════════════════════════════════════
    // ACT 5: ADMIN PORTAL EXPLORATION (http://localhost:4000/admin)
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 5] Exploring Admin Portal & Real-Time Inbox...');
    await page.goto('http://localhost:4000/admin', { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(1500);

    // Enter password 'rdmy' and login
    console.log('→ Unlocking Admin Console with "rdmy"...');
    const pwInput = await page.$('#passwordInput, #adminPasswordInput, input[type="password"]');
    if (pwInput) {
      await pwInput.focus();
      await wait(300);
      await pwInput.type('rdmy', { delay: 120 });
      await wait(500);
      await page.evaluate(() => {
        const btn = document.getElementById('adminLoginBtn') || 
                    document.getElementById('unlockBtn') ||
                    document.querySelector('button[type="submit"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('login') || b.textContent.toLowerCase().includes('unlock'));
        if (btn) btn.click();
      });
      await wait(2500);
    }

    // Select raoprime.music conversation in inbox
    console.log('→ Selecting verified client in conversation list...');
    await page.evaluate(() => {
      if (typeof selectChat === 'function') {
        selectChat('raoprime.music', true);
      } else {
        const item = document.querySelector('.chat-item, [data-chat-id="raoprime.music"]');
        if (item) item.click();
      }
    });
    await wait(2500);

    // Inspect Client Intel modal
    console.log('→ Opening Client Intel Modal...');
    await page.evaluate(() => {
      if (typeof openClientIntelModal === 'function') openClientIntelModal();
    });
    await wait(2000);
    await page.evaluate(() => {
      if (typeof closeClientIntelModal === 'function') closeClientIntelModal();
    });
    await wait(1200);

    // ══════════════════════════════════════════════════════════
    // ACT 6: LIVE PRODUCTION RENDER (https://raoprime.onrender.com)
    // ══════════════════════════════════════════════════════════
    console.log('\n[ACT 6] Exploring Live Production Deployment on Render...');
    try {
      await page.goto('https://raoprime.onrender.com/?chat=raoprime.music', { waitUntil: 'networkidle2', timeout: 40000 });
      await wait(3000);
      console.log('→ Live Render Client Portal verified operational!');
    } catch (e) {
      console.log('Render production note:', e.message);
    }

    console.log('\n🎬 Complete Exploratory Walkthrough Video Recording Sequence Completed!');
  } catch (err) {
    console.error('❌ Error during walkthrough sequence:', err);
    throw err;
  } finally {
    console.log('Stopping screencast and finalizing FFmpeg encoding...');
    isRecording = false;
    clearInterval(frameInterval);

    try {
      await client.send('Page.stopScreencast');
    } catch (e) {}

    await browser.close();

    ffmpeg.stdin.end();

    await new Promise((resolve) => {
      ffmpeg.on('close', code => {
        if (code === 0) {
          console.log(`✅ Video file written and finalized: ${VIDEO_PATH}`);
          try {
            fs.copyFileSync(VIDEO_PATH, ARTIFACT_VIDEO_PATH);
            console.log(`✅ Copied video to Artifact Directory: ${ARTIFACT_VIDEO_PATH}`);
          } catch (copyErr) {
            console.warn('Artifact video copy warning:', copyErr.message);
          }
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
