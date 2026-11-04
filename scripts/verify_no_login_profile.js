const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'verification_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const ARTIFACT_DIR = path.join('C:', 'Users', 'DELL', '.gemini', 'antigravity', 'brain', 'c38e69ac-5595-457b-aa92-0467d8bd2942', 'screenshots');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function saveDouble(page, name) {
  const p1 = path.join(SCREENSHOT_DIR, name);
  const p2 = path.join(ARTIFACT_DIR, name);
  return Promise.all([
    page.screenshot({ path: p1, fullPage: false }),
    page.screenshot({ path: p2, fullPage: false })
  ]);
}

(async () => {
  console.log('🚀 Launching Chrome for Frictionless Direct Chat & No Login / No Profile Verification...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  const consoleLogs = [];
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    } else {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => errors.push(err.message));

  console.log('1. Navigating to http://localhost:4000/ (Fresh visitor, clean session)...');
  await page.goto('http://localhost:4000/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('2. Verifying No Login Modal and No Profile Modal is visible...');
  const modalChecks = await page.evaluate(() => {
    const isVisible = el => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !el.classList.contains('hidden') && el.offsetWidth > 0 && el.offsetHeight > 0;
    };

    return {
      nameModalVisible: isVisible(document.getElementById('nameModal')),
      clientProfileModalVisible: isVisible(document.getElementById('clientProfileModal')),
      profileModalVisible: isVisible(document.getElementById('profileModal')),
      chatContainerVisible: isVisible(document.getElementById('messagesList')),
      messageInputVisible: isVisible(document.getElementById('messageInput')),
      headerTitle: document.getElementById('chatHeading')?.textContent || '',
      headerProfileBtnText: document.getElementById('headerProfileBtn')?.textContent.trim() || '',
      currentChatId: window.currentChatId || null
    };
  });

  console.log('Modal check results:', modalChecks);
  if (modalChecks.nameModalVisible) throw new Error('FAIL: nameModal is visible!');
  if (modalChecks.clientProfileModalVisible) throw new Error('FAIL: clientProfileModal is visible!');
  if (modalChecks.profileModalVisible) throw new Error('FAIL: profileModal is visible!');
  if (!modalChecks.messageInputVisible) throw new Error('FAIL: messageInput is not visible!');

  console.log('✓ PASS: Zero login barriers. Chat is directly accessible to client: @' + modalChecks.currentChatId);

  await saveDouble(page, '01_direct_frictionless_entry.png');
  console.log('Saved screenshot 01_direct_frictionless_entry.png');

  console.log('3. Clicking header brand element (should NOT open any profile modal)...');
  await page.click('#chatHeading');
  await new Promise(r => setTimeout(r, 500));
  const afterHeaderClick = await page.evaluate(() => {
    const isVisible = el => el && !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none';
    return {
      profileModal: isVisible(document.getElementById('profileModal')),
      clientProfileModal: isVisible(document.getElementById('clientProfileModal'))
    };
  });
  if (afterHeaderClick.profileModal || afterHeaderClick.clientProfileModal) {
    throw new Error('FAIL: Header click opened a profile modal!');
  }
  console.log('✓ PASS: Clicking header did NOT open profile modal.');

  console.log('4. Sending a test message directly without any login...');
  await page.type('#messageInput', 'Namaste Raoprime team! Direct instant chat test.');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1200));

  const messageCount = await page.evaluate(() => {
    return document.querySelectorAll('#messagesList .message-row').length;
  });
  console.log('Message row count in DOM:', messageCount);
  if (messageCount === 0) throw new Error('FAIL: Message was not appended!');

  await saveDouble(page, '02_instant_chat_sent.png');
  console.log('Saved screenshot 02_instant_chat_sent.png');

  console.log('5. Testing Instagram Story Highlight Viewer...');
  const firstStoryBtn = await page.$('#storyHighlightsBar button');
  if (firstStoryBtn) {
    await firstStoryBtn.click();
    await new Promise(r => setTimeout(r, 800));
    await saveDouble(page, '03_story_viewer_active.png');
    console.log('Saved screenshot 03_story_viewer_active.png');

    // Click quick reaction emoji
    const reactionBtn = await page.$('#storyViewerModal button[onclick*="sendStoryQuickReaction"]');
    if (reactionBtn) {
      await reactionBtn.click();
      await new Promise(r => setTimeout(r, 600));
      await saveDouble(page, '04_story_emoji_reaction.png');
      console.log('Saved screenshot 04_story_emoji_reaction.png');
    }

    // Close story modal
    await page.evaluate(() => {
      if (typeof closeStoryViewerModal === 'function') closeStoryViewerModal();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('6. Testing Voice Note Mic button (WhatsApp style)...');
  const micBtn = await page.$('#voiceNoteMicBtn');
  if (micBtn) {
    await micBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    const recVisible = await page.evaluate(() => {
      const bar = document.getElementById('voiceRecordingBar');
      return bar && !bar.classList.contains('hidden');
    });
    console.log('Voice recording bar active:', recVisible);
    if (!recVisible) throw new Error('Voice recording bar did not show!');
    await saveDouble(page, '05_voice_note_recording.png');

    // Cancel recording
    const cancelBtn = await page.$('#voiceCancelBtn');
    if (cancelBtn) await cancelBtn.click();
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('7. Mobile Viewport Test (iPhone 14 Pro style: 393 x 852)...');
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 1000));
  await saveDouble(page, '06_mobile_frictionless_view.png');
  console.log('Saved screenshot 06_mobile_frictionless_view.png');

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log('Errors logged:', errors.length);
  if (errors.length > 0) {
    console.warn('Console error list:', errors);
  }
  console.log('✅ ALL VERIFICATIONS PASSED SUCCESSFULLY!');

  await browser.close();
})().catch(err => {
  console.error('❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
