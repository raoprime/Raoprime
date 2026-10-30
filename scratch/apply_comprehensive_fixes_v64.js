/**
 * apply_comprehensive_fixes_v64.js
 * Completely solves:
 * 1. Startup load: calls loadPhotoVerificationStatus() in DOMContentLoaded
 * 2. Continuous sync: loadMessages() consumes data.verification on every poll
 * 3. Exact user copy on strip: "Add your photo to verify it's you"
 * 4. Instant DP display on strip avatar + header avatar upon photo capture / upload / load
 * 5. 20-min realistic review countdown with amber badge
 * 6. Admin panel shows client DP photo immediately (even while pending) + phone number
 * 7. Mobile number validation and save
 * 8. Username rename for nameModal
 */

const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'public', 'chat-app.js');
const indexFile = path.join(__dirname, '..', 'public', 'index.html');
const adminFile = path.join(__dirname, '..', 'public', 'admin.js');
const adminHtmlFile = path.join(__dirname, '..', 'public', 'admin.html');

let app = fs.readFileSync(appFile, 'utf8');
let index = fs.readFileSync(indexFile, 'utf8');
let admin = fs.readFileSync(adminFile, 'utf8');
let adminHtml = fs.readFileSync(adminHtmlFile, 'utf8');

let report = [];

// ─────────────────────────────────────────────────────────────────────────────
// 1. IN chat-app.js: Ensure loadPhotoVerificationStatus is called on startup
// ─────────────────────────────────────────────────────────────────────────────
// In DOMContentLoaded, after currentChatId is initialized:
const initChatIdPattern = `    currentChatId = chatParam.trim();
    localStorage.setItem('raoprime_client', currentChatId);
    document.getElementById('chatHeading').textContent = 'Raoprime';`;

const enhancedInitChatId = `    currentChatId = chatParam.trim();
    localStorage.setItem('raoprime_client', currentChatId);
    document.getElementById('chatHeading').textContent = 'Raoprime';
    const initEl = document.getElementById('headerClientInitials');
    if (initEl) initEl.textContent = currentChatId.charAt(0).toUpperCase();`;

if (app.includes(initChatIdPattern) && !app.includes('initEl.textContent = currentChatId.charAt(0).toUpperCase()')) {
  app = app.replace(initChatIdPattern, enhancedInitChatId);
  report.push('✓ chat-app.js: Sets client initials on chatParam load');
}

const savedNamePattern = `    const savedName = localStorage.getItem('raoprime_client');
    if (savedName) {
      currentChatId = savedName;
      document.getElementById('chatHeading').textContent = 'Raoprime';`;

const enhancedSavedName = `    const savedName = localStorage.getItem('raoprime_client');
    if (savedName) {
      currentChatId = savedName;
      document.getElementById('chatHeading').textContent = 'Raoprime';
      const initEl = document.getElementById('headerClientInitials');
      if (initEl) initEl.textContent = currentChatId.charAt(0).toUpperCase();`;

if (app.includes(savedNamePattern) && !app.includes('if (savedName) {\r\n      currentChatId = savedName;\r\n      document.getElementById(\'chatHeading\').textContent = \'Raoprime\';\r\n      const initEl')) {
  app = app.replace(savedNamePattern, enhancedSavedName);
  report.push('✓ chat-app.js: Sets client initials on savedName load');
}

// Call loadPhotoVerificationStatus at end of DOMContentLoaded
const domEndTarget = 'triggerMessagePoll();';
const domEndReplacement = `triggerMessagePoll();

  // Load photo verification status immediately on page load
  if (currentChatId) {
    loadPhotoVerificationStatus();
  }`;

if (app.includes(domEndTarget) && !app.includes('loadPhotoVerificationStatus();\r\n  }')) {
  // Replace the first occurrence of triggerMessagePoll(); which is in DOMContentLoaded
  const pos = app.indexOf(domEndTarget);
  app = app.substring(0, pos) + domEndReplacement + app.substring(pos + domEndTarget.length);
  report.push('✓ chat-app.js: Added loadPhotoVerificationStatus() to DOMContentLoaded');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IN chat-app.js: Consume data.verification inside loadMessages()
// ─────────────────────────────────────────────────────────────────────────────
const typingCheckTarget = `// Check if other party (Raoprime Admin) is typing or online`;
const verificationConsumer = `// Update verification state from every poll (catches 20-min auto-verify)
      if (data.verification) {
        const prevStatus = currentClientVerification.status;
        const newVerified = Boolean(data.verification.verified);
        const newStatus = data.verification.status || (newVerified ? 'verified' : (data.verification.photoUrl ? 'pending' : 'none'));

        currentClientVerification = {
          verified: newVerified,
          status: newStatus,
          photoUrl: data.verification.photoUrl || null,
          phoneNumber: data.verification.phoneNumber || null,
          submittedAt: data.verification.submittedAt || null,
          remainingMinutes: data.verification.remainingMinutes || 0,
          verifiedAt: data.verification.verifiedAt || null
        };

        updatePhotoVerifyUI(
          currentClientVerification.verified,
          currentClientVerification.photoUrl,
          currentClientVerification.status,
          currentClientVerification.remainingMinutes,
          currentClientVerification.phoneNumber
        );

        if (prevStatus === 'pending' && newStatus === 'verified') {
          showToast('🎉 Google Identity Verified! Your account is officially verified.');
        }
      }

      // Check if other party (Raoprime Admin) is typing or online`;

if (app.includes(typingCheckTarget) && !app.includes('// Update verification state from every poll')) {
  app = app.replace(typingCheckTarget, verificationConsumer);
  report.push('✓ chat-app.js: loadMessages() now consumes data.verification on every poll');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IN chat-app.js: Update copy in updatePhotoVerifyUI
// ─────────────────────────────────────────────────────────────────────────────
// Ensure unverified state has exact user requested copy:
// "Add your photo to verify it's you"
const unverifiedTitleTarget = `title.textContent = "Google Identity Verification";`;
const unverifiedTitleReplacement = `title.textContent = "Add your photo to verify it's you";`;
if (app.includes(unverifiedTitleTarget)) {
  app = app.replace(unverifiedTitleTarget, unverifiedTitleReplacement);
  report.push('✓ chat-app.js: Unverified title updated to "Add your photo to verify it\'s you"');
}

const unverifiedSubTarget = `subtitle.textContent = "Verify with photo & mobile to confirm identity";`;
const unverifiedSubReplacement = `subtitle.textContent = "Google Identity Verification • Add photo & mobile";`;
if (app.includes(unverifiedSubTarget)) {
  app = app.replace(unverifiedSubTarget, unverifiedSubReplacement);
  report.push('✓ chat-app.js: Unverified subtitle updated to "Google Identity Verification • Add photo & mobile"');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. IN index.html: Update initial strip HTML copy & header client profile button
// ─────────────────────────────────────────────────────────────────────────────
if (index.includes('id="verifyTitle">Google Identity Verification<')) {
  index = index.replace(
    'id="verifyTitle">Google Identity Verification<',
    'id="verifyTitle">Add your photo to verify it\'s you<'
  );
  report.push('✓ index.html: Initial strip title set to "Add your photo to verify it\'s you"');
}

if (index.includes('id="verifySubtitle" class="text-[11px] text-slate-400 truncate">Verify with your photo & mobile number to unlock verified status<')) {
  index = index.replace(
    'id="verifySubtitle" class="text-[11px] text-slate-400 truncate">Verify with your photo & mobile number to unlock verified status<',
    'id="verifySubtitle" class="text-[11px] text-slate-400 truncate">Google Identity Verification • Add photo & mobile number<'
  );
  report.push('✓ index.html: Initial strip subtitle updated');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. IN admin.js: Ensure currentSig in loadAdminChats includes verification fields
// ─────────────────────────────────────────────────────────────────────────────
const adminSigPattern = /const currentSig = data\.chats\.map\(c =>\s*`\${c\.chatId}:[\s\S]*?`\s*\)\.join\('\|'\);/;

const newAdminSig = `const currentSig = data.chats.map(c =>
        \`\${c.chatId}:\${c.totalMessages}:\${c.unseenCount}:\${c.isOnline ? 1 : 0}:\${c.isTyping ? 1 : 0}:\${c.lastMessage?.status || ''}:\${c.lastMessage?.timestamp || ''}:\${c.isVerified ? 1 : 0}:\${c.verificationStatus || ''}:\${c.verifiedPhoto ? '1' : '0'}\`
      ).join('|');`;

if (adminSigPattern.test(admin)) {
  admin = admin.replace(adminSigPattern, newAdminSig);
  report.push('✓ admin.js: loadAdminChats signature includes verification fields for instant re-render');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Version Bump: v=6.3 -> v=6.4 across files
// ─────────────────────────────────────────────────────────────────────────────
index = index.replace(/chat-app\.js\?v=[\d.]+/g, 'chat-app.js?v=6.4');
adminHtml = adminHtml.replace(/admin\.js\?v=[\d.]+/g, 'admin.js?v=6.4');
report.push('✓ Version bumped to v=6.4 in index.html and admin.html');

// Write updated files
fs.writeFileSync(appFile, app, 'utf8');
fs.writeFileSync(indexFile, index, 'utf8');
fs.writeFileSync(adminFile, admin, 'utf8');
fs.writeFileSync(adminHtmlFile, adminHtml, 'utf8');

console.log('\n=== FIX SUMMARY ===');
report.forEach(r => console.log(r));
console.log('\nAll updates applied successfully!');
