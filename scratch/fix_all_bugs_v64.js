/**
 * fix_all_bugs_v64.js
 * Fixes all 5 confirmed bugs found in audit:
 *
 * BUG 1: data.verification NOT consumed in loadMessages (client side)
 * BUG 2: loadPhotoVerificationStatus NOT called at DOMContentLoaded
 * BUG 3: validateVerificationForm NOT called in captureModalPhoto
 * BUG 4: validateVerificationForm NOT called in handlePhotoFileSelected
 * BUG 5: Admin chats sig does NOT include verification status -> re-render skipped
 */

const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'public', 'chat-app.js');
const admFile = path.join(__dirname, '..', 'public', 'admin.js');

let app = fs.readFileSync(appFile, 'utf8');
let adm = fs.readFileSync(admFile, 'utf8');
let changes = [];

// ──────────────────────────────────────────────────────────────────────────────
// FIX 1: Inject data.verification handling into loadMessages (client)
// After the typing check inside the success branch of loadMessages
// ──────────────────────────────────────────────────────────────────────────────
const targetTypingCheck = `      // Check if other party (Raoprime Admin) is typing or online
      const otherSender = currentRole === 'Client' ? 'Raoprime' : 'Client';`;

const fixedTypingCheck = `      // Update verification state from every poll response (catches 20-min auto-verify)
      if (data.verification) {
        const prevStatus = currentClientVerification.status;
        const newVerified = Boolean(data.verification.verified);
        const newStatus = data.verification.status || (newVerified ? 'verified' : (data.verification.photoUrl ? 'pending' : 'none'));

        if (prevStatus !== newStatus || currentClientVerification.verified !== newVerified) {
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
      }

      // Check if other party (Raoprime Admin) is typing or online
      const otherSender = currentRole === 'Client' ? 'Raoprime' : 'Client';`;

if (app.includes(targetTypingCheck)) {
  app = app.replace(targetTypingCheck, fixedTypingCheck);
  changes.push('✓ FIX 1: data.verification consumed in loadMessages - auto-verify now works!');
} else {
  changes.push('⚠ FIX 1: target for loadMessages verification injection not found');
}

// ──────────────────────────────────────────────────────────────────────────────
// FIX 2: Call loadPhotoVerificationStatus at DOMContentLoaded startup
// ──────────────────────────────────────────────────────────────────────────────
const domTarget = `  // Sequential non-blocking message polling (100% immune to request pile-up and freezes)
  triggerMessagePoll();`;

const fixedDom = `  // Sequential non-blocking message polling (100% immune to request pile-up and freezes)
  triggerMessagePoll();

  // Load photo verification status on startup (restores DP and badge state)
  if (currentChatId) {
    loadPhotoVerificationStatus();
  }`;

if (app.includes(domTarget)) {
  app = app.replace(domTarget, fixedDom);
  changes.push('✓ FIX 2: loadPhotoVerificationStatus called at DOMContentLoaded');
} else {
  changes.push('⚠ FIX 2: DOMContentLoaded target not found for verification startup call');
}

// ──────────────────────────────────────────────────────────────────────────────
// FIX 3: validateVerificationForm after captureModalPhoto
// ──────────────────────────────────────────────────────────────────────────────
const captureTarget = `  if (preview) {
    preview.src = base64;
    preview.classList.remove('hidden');
  }
  if (placeholder) placeholder.classList.add('hidden');

  validateVerificationForm();
}

function handlePhotoFileSelected`;

// If it's missing the call, fix it — but first check current state
if (!app.includes('if (placeholder) placeholder.classList.add(\'hidden\');\n\n  validateVerificationForm();\n}\n\nfunction handlePhotoFileSelected')) {
  // The captureModalPhoto function - find and patch
  const captureFnStart = app.indexOf('function captureModalPhoto()');
  const captureFnEnd = app.indexOf('function handlePhotoFileSelected', captureFnStart);
  const captureFn = app.substring(captureFnStart, captureFnEnd);
  
  const oldCaptureTail = `  if (preview) {
    preview.src = base64;
    preview.classList.remove('hidden');
  }
  if (placeholder) placeholder.classList.add('hidden');
}`;

  const newCaptureTail = `  if (preview) {
    preview.src = base64;
    preview.classList.remove('hidden');
  }
  if (placeholder) placeholder.classList.add('hidden');

  validateVerificationForm();
}`;

  if (captureFn.includes(oldCaptureTail)) {
    const newCaptureFn = captureFn.replace(oldCaptureTail, newCaptureTail);
    app = app.substring(0, captureFnStart) + newCaptureFn + app.substring(captureFnEnd);
    changes.push('✓ FIX 3: validateVerificationForm called in captureModalPhoto');
  } else {
    changes.push('⚠ FIX 3: captureModalPhoto tail pattern not matched');
  }
} else {
  changes.push('✓ FIX 3: captureModalPhoto already has validateVerificationForm');
}

// ──────────────────────────────────────────────────────────────────────────────
// FIX 4: validateVerificationForm after handlePhotoFileSelected
// ──────────────────────────────────────────────────────────────────────────────
const fileStart = app.indexOf('function handlePhotoFileSelected(e)');
const fileEnd = app.indexOf('async function submitPhotoVerification', fileStart);
const fileFn = app.substring(fileStart, fileEnd);

if (!fileFn.includes('validateVerificationForm()')) {
  // Find the ending of img.onload where we set placeholder
  const oldFileTail = `      if (placeholder) placeholder.classList.add('hidden');
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}`;

  const newFileTail = `      if (placeholder) placeholder.classList.add('hidden');

      validateVerificationForm();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}`;

  if (fileFn.includes(oldFileTail)) {
    const newFileFn = fileFn.replace(oldFileTail, newFileTail);
    app = app.substring(0, fileStart) + newFileFn + app.substring(fileEnd);
    changes.push('✓ FIX 4: validateVerificationForm called in handlePhotoFileSelected');
  } else {
    changes.push('⚠ FIX 4: handlePhotoFileSelected tail pattern not matched exactly');
  }
} else {
  changes.push('✓ FIX 4: handlePhotoFileSelected already has validateVerificationForm');
}

// ──────────────────────────────────────────────────────────────────────────────
// FIX 5: Admin chats sig - include verification status so sidebar re-renders
// ──────────────────────────────────────────────────────────────────────────────
const oldSig = `const currentSig = data.chats.map(c =>
        \`\${c.chatId}:\${c.totalMessages}:\${c.unseenCount}:\${c.isOnline ? 1 : 0}:\${c.isTyping ? 1 : 0}:\${c.lastMessage?.status || ''}:\${c.lastMessage?.timestamp || ''}\`
      ).join('|');`;

const newSig = `const currentSig = data.chats.map(c =>
        \`\${c.chatId}:\${c.totalMessages}:\${c.unseenCount}:\${c.isOnline ? 1 : 0}:\${c.isTyping ? 1 : 0}:\${c.lastMessage?.status || ''}:\${c.lastMessage?.timestamp || ''}:\${c.isVerified ? 1 : 0}:\${c.verificationStatus || ''}:\${c.verifiedPhoto ? '1' : '0'}\`
      ).join('|');`;

if (adm.includes(oldSig.replace(/\r\n/g, '\n'))) {
  adm = adm.replace(oldSig.replace(/\r\n/g, '\n'), newSig);
  changes.push('✓ FIX 5: Admin chats sig now includes verification status - sidebar re-renders on photo/status change');
} else {
  // Try with CRLF
  const oldSigCRLF = oldSig.replace(/\n/g, '\r\n');
  if (adm.includes(oldSigCRLF)) {
    adm = adm.replace(oldSigCRLF, newSig);
    changes.push('✓ FIX 5 (CRLF): Admin chats sig now includes verification status');
  } else {
    // Try direct regex approach
    const sigPattern = /const currentSig = data\.chats\.map\(c =>[\s\S]*?\)\.join\('\|'\);/;
    if (sigPattern.test(adm)) {
      adm = adm.replace(sigPattern, newSig);
      changes.push('✓ FIX 5 (regex): Admin chats sig updated with verification status');
    } else {
      changes.push('⚠ FIX 5: admin chats sig pattern not matched');
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Also fix: When saveClientName is called, call loadPhotoVerificationStatus AFTER load
// ──────────────────────────────────────────────────────────────────────────────
// Check if saveClientName calls loadPhotoVerificationStatus
const snIdx = app.indexOf('function saveClientName()');
const snChunk = app.substring(snIdx, snIdx + 700);
if (!snChunk.includes('loadPhotoVerificationStatus')) {
  // Fix: it should already be there from update_chat_app_v63.js — check
  changes.push('⚠ saveClientName missing loadPhotoVerificationStatus call - check manually');
} else {
  changes.push('✓ saveClientName already calls loadPhotoVerificationStatus');
}

// Write files
fs.writeFileSync(appFile, app, 'utf8');
fs.writeFileSync(admFile, adm, 'utf8');

console.log('\n=== BUG FIX REPORT ===');
changes.forEach(c => console.log(c));
console.log('\nDone! Run node -c to verify syntax.');
