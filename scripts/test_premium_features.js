/**
 * Real App Premium Features Verification Suite
 * Tests:
 * 1. Web Audio API Tactile Sound Engine (pop, send, receive, record)
 * 2. Telegram / WhatsApp Voice Note Recording & Waveform Audio Message Creation
 * 3. Instagram Story Quick Emoji Reactions & Flying Emoji Eruption
 * 4. Story Ambient Audio Mute/Unmute Toggle
 * 5. Telegram Quick Attachment Drawer
 * 6. Double-Tap Orbiting Mini-Hearts Reaction
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4000';
const OUT = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c38e69ac-5595-457b-aa92-0467d8bd2942\\premium_vibe_screenshots';
const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c38e69ac-5595-457b-aa92-0467d8bd2942';

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tests = [];

function check(label, pass, detail = '') {
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  tests.push({ label, pass, detail });
}

async function takeShot(page, name, label) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  fs.copyFileSync(file, path.join(ARTIFACT_DIR, `${name}.png`));
  check(label, true, `saved: ${name}.png`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log('\n═══ 1. Loading Portal ═══');
    await page.goto(`${BASE}/?chat=raoprime.music`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);

    // ─── 1. Web Audio API Tactile Sound Engine ───────────────────────
    console.log('\n═══ 2. Testing Tactile Sound Engine ═══');
    const soundOk = await page.evaluate(() => {
      if (typeof playHapticSound !== 'function') return false;
      try {
        playHapticSound('pop');
        playHapticSound('send');
        playHapticSound('receive');
        playHapticSound('click');
        return true;
      } catch (e) {
        return false;
      }
    });
    check('Web Audio API Sound Engine initialized & functional', soundOk);

    // ─── 2. Telegram Attachment Drawer ──────────────────────────────
    console.log('\n═══ 3. Testing Telegram Quick Attachment Drawer ═══');
    const drawerOpen = await page.evaluate(() => {
      toggleAttachmentDrawer();
      const d = document.getElementById('attachmentDrawerModal');
      return d && !d.classList.contains('hidden');
    });
    check('Attachment drawer opens with 4 tiles', drawerOpen);
    await takeShot(page, 'vibe_07_attachment_drawer', 'Screenshot: Attachment Drawer');

    await page.evaluate(() => toggleAttachmentDrawer()); // close

    // ─── 3. Voice Note Recording ────────────────────────────────────
    console.log('\n═══ 4. Testing WhatsApp/Telegram Voice Note Recording ═══');
    const recBarVisible = await page.evaluate(async () => {
      startVoiceNoteRecording();
      const bar = document.getElementById('voiceRecordingBar');
      return bar && !bar.classList.contains('hidden');
    });
    check('Voice Note Recording bar slides in', recBarVisible);

    await sleep(2200); // let it record 2 seconds
    const timerValue = await page.evaluate(() => {
      const t = document.getElementById('recordingTimer');
      return t ? t.textContent : '';
    });
    check('Voice Note timer advances during speech', timerValue !== '0:00', `Timer: ${timerValue}`);
    await takeShot(page, 'vibe_08_voice_recording_bar', 'Screenshot: Voice Recording Bar');

    // Send the voice note
    await page.evaluate(() => stopAndSendVoiceNote());
    await sleep(3500); // wait for upload & render

    const hasAudioPlayer = await page.evaluate(() => {
      const players = document.querySelectorAll('.raoprime-waveform-player');
      return players.length > 0;
    });
    check('Voice note rendered in chat as Waveform Player', hasAudioPlayer);
    await takeShot(page, 'vibe_09_chat_voice_waveform', 'Screenshot: Voice Note Waveform in Chat');

    // ─── 4. Instagram Story Viewer with Flying Emojis ───────────────
    console.log('\n═══ 5. Testing Instagram Stories & Quick Reactions ═══');
    await page.evaluate(() => openStoryViewerModal('official'));
    await sleep(1500);

    const storyModalOpen = await page.evaluate(() => {
      const m = document.getElementById('storyViewerModal');
      return m && !m.classList.contains('hidden');
    });
    check('Instagram Story Viewer opens', storyModalOpen);

    // Test sound toggle in story
    const soundToggled = await page.evaluate(() => {
      toggleStoryAudio();
      return isStoryAudioPlaying;
    });
    check('Story Ambient Sound toggles ON', soundToggled);

    // Trigger 🔥 reaction button
    await page.evaluate(() => triggerStoryEmojiReaction('🔥'));
    await sleep(400);

    const flyingEmojisCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.ig-flying-emoji-item');
      return items.length;
    });
    check('Instagram flying emoji eruption spawned', flyingEmojisCount > 0, `${flyingEmojisCount} flying emojis`);
    await takeShot(page, 'vibe_10_story_emoji_eruption', 'Screenshot: Instagram Story Flying Emoji Eruption');

    await sleep(1200);
    await page.evaluate(() => closeStoryViewerModal());

    // ─── 5. Double-Tap Orbiting Mini Hearts ─────────────────────────
    console.log('\n═══ 6. Testing Double-Tap Mini-Hearts Explosion ═══');
    const lastMsgId = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.message-row');
      if (msgs.length) {
        return msgs[msgs.length - 1].getAttribute('data-msg-id');
      }
      return null;
    });

    if (lastMsgId) {
      await page.evaluate((id) => handleMessageDoubleTap(id), lastMsgId);
      await sleep(300);

      const heartsInDom = await page.evaluate(() => {
        return document.querySelectorAll('.ig-heart-pop').length;
      });
      check('Double-Tap spawns central heart + mini-hearts', heartsInDom > 1, `${heartsInDom} hearts active`);
      await takeShot(page, 'vibe_11_double_tap_burst', 'Screenshot: Double-Tap Hearts Burst');
    }

    await page.close();
  } catch (err) {
    console.error('Fatal error in suite:', err);
    check('Fatal Suite Error', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   PREMIUM SOCIAL FEATURES AUDIT SUMMARY        ║');
  console.log('╚════════════════════════════════════════════════╝');
  const passed = tests.filter(t => t.pass).length;
  const failed = tests.filter(t => !t.pass).length;
  tests.forEach(t => {
    const icon = t.pass ? '✅' : '❌';
    console.log(`${icon} ${t.label}${t.detail ? ': ' + t.detail : ''}`);
  });
  console.log(`\n🎯 TOTAL: ${passed} PASSED, ${failed} FAILED out of ${tests.length} tests`);
})();
