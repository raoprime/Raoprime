/**
 * update_server_verification_v63.js
 * Updates server.js with:
 * 1. 20-minute auto-verification delay engine
 * 2. Mobile number support in /api/chat/verify-photo
 * 3. /api/admin/verify-client endpoint for admin instant approval
 * 4. Verification metadata injection into /api/admin/chats and /api/chat/messages
 */

const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'server.js');
let code = fs.readFileSync(serverFile, 'utf8');

// 1. Add VERIFICATION_DELAY_MS and checkAutoVerifications interval
const autoVerifyLogic = `
const VERIFICATION_DELAY_MS = 20 * 60 * 1000; // Exactly 20 minutes delay

function checkAutoVerifications() {
  try {
    const now = Date.now();
    let modified = false;
    for (const [chatId, ver] of Object.entries(verificationsStore)) {
      if (ver && ver.status === 'pending' && ver.submittedAt) {
        if (now - ver.submittedAt >= VERIFICATION_DELAY_MS) {
          ver.verified = true;
          ver.status = 'verified';
          ver.verifiedAt = new Date().toISOString();
          modified = true;
          broadcastToRoom(chatId, 'chat:verification-updated', {
            chatId,
            verified: true,
            status: 'verified',
            photoUrl: ver.photoUrl,
            phoneNumber: ver.phoneNumber || null,
            verifiedAt: ver.verifiedAt
          });
          console.log(\`[Auto-Verify] Client \${chatId} auto-verified after 20 minutes\`);
        }
      }
    }
    if (modified) {
      saveVerifications(verificationsStore);
    }
  } catch (e) {
    console.warn('checkAutoVerifications error:', e.message);
  }
}
setInterval(checkAutoVerifications, 10000); // Check every 10 seconds
`;

// Insert autoVerifyLogic right after `let verificationsStore = loadVerifications();`
if (!code.includes('const VERIFICATION_DELAY_MS')) {
  code = code.replace(
    'let verificationsStore = loadVerifications();',
    'let verificationsStore = loadVerifications();\n' + autoVerifyLogic
  );
  console.log('✓ Added auto-verification 20-min engine and interval');
}

// 2. Replace /api/chat/verification and /api/chat/verify-photo implementations
const verificationEndpoints = `// ──────────────────────────────────────────────────────────────
// Client Photo Identity Verification Endpoints (Google Trust & 20-Min Auto Review)
// ──────────────────────────────────────────────────────────────

app.get('/api/chat/verification', (req, res) => {
  try {
    const rawChatId = req.query.chatId || 'default';
    const chatId = normalizeChatId(rawChatId);
    let ver = verificationsStore[chatId] || { verified: false, status: 'none', photoUrl: null };

    const now = Date.now();
    if (ver.status === 'pending' && ver.submittedAt && (now - ver.submittedAt >= VERIFICATION_DELAY_MS)) {
      ver.verified = true;
      ver.status = 'verified';
      ver.verifiedAt = new Date().toISOString();
      saveVerifications(verificationsStore);
    }

    const remainingMs = ver.status === 'pending' && ver.submittedAt ? Math.max(0, VERIFICATION_DELAY_MS - (now - ver.submittedAt)) : 0;
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    res.json({
      success: true,
      chatId,
      verified: Boolean(ver.verified),
      status: ver.status || (ver.verified ? 'verified' : (ver.photoUrl ? 'pending' : 'none')),
      photoUrl: ver.photoUrl || null,
      phoneNumber: ver.phoneNumber || null,
      submittedAt: ver.submittedAt || null,
      remainingMs,
      remainingMinutes,
      verifiedAt: ver.verifiedAt || null,
      isRequested: Boolean(ver.isRequested)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/chat/verify-photo', (req, res) => {
  try {
    const { chatId: rawChatId = 'default', photoData, phoneNumber, enabled } = req.body;
    const chatId = normalizeChatId(rawChatId);

    if (typeof enabled !== 'undefined' && !enabled) {
      verificationsStore[chatId] = {
        verified: false,
        status: 'none',
        photoUrl: null,
        phoneNumber: null,
        updatedAt: new Date().toISOString()
      };
      saveVerifications(verificationsStore);
      broadcastToRoom(chatId, 'chat:verification-updated', {
        chatId,
        verified: false,
        status: 'none',
        photoUrl: null,
        phoneNumber: null
      });
      return res.json({ success: true, verified: false, status: 'none', photoUrl: null });
    }

    if (!photoData || typeof photoData !== 'string') {
      return res.status(400).json({ success: false, error: 'Photo data is required' });
    }

    let buffer;
    let ext = 'jpg';
    const matches = photoData.match(/^data:image\\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(photoData, 'base64');
    }

    const cleanName = chatId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const storedFileName = \`verify_\${cleanName}_\${Date.now()}.\${ext}\`;
    const filePath = path.join(VAULT_DIR, storedFileName);
    fs.writeFileSync(filePath, buffer);

    const photoUrl = \`/api/download/\${storedFileName}\`;
    const cleanPhone = (phoneNumber || '').toString().trim();
    const now = Date.now();

    // Set as pending for 20 minutes (simulated realistic security review)
    verificationsStore[chatId] = {
      verified: false,
      status: 'pending',
      photoUrl,
      phoneNumber: cleanPhone,
      submittedAt: now,
      verifiedAt: null,
      isRequested: false
    };
    saveVerifications(verificationsStore);

    // Broadcast update so admin & client see photo DP immediately and review status
    broadcastToRoom(chatId, 'chat:verification-updated', {
      chatId,
      verified: false,
      status: 'pending',
      photoUrl,
      phoneNumber: cleanPhone,
      submittedAt: now,
      remainingMs: VERIFICATION_DELAY_MS,
      remainingMinutes: 20
    });

    res.json({
      success: true,
      verified: false,
      status: 'pending',
      photoUrl,
      phoneNumber: cleanPhone,
      submittedAt: now,
      remainingMinutes: 20
    });
  } catch (err) {
    console.error('verify-photo error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/verify-client', requireAdminAuth, (req, res) => {
  try {
    const { chatId: rawChatId, approve } = req.body;
    if (!rawChatId) return res.status(400).json({ success: false, error: 'chatId required' });
    const chatId = normalizeChatId(rawChatId);
    let ver = verificationsStore[chatId] || { verified: false, status: 'none', photoUrl: null };

    if (approve) {
      ver.verified = true;
      ver.status = 'verified';
      ver.verifiedAt = new Date().toISOString();
    } else {
      ver.verified = false;
      ver.status = 'none';
    }
    verificationsStore[chatId] = ver;
    saveVerifications(verificationsStore);

    broadcastToRoom(chatId, 'chat:verification-updated', {
      chatId,
      verified: ver.verified,
      status: ver.status,
      photoUrl: ver.photoUrl || null,
      phoneNumber: ver.phoneNumber || null,
      verifiedAt: ver.verifiedAt || null
    });

    res.json({ success: true, verified: ver.verified, status: ver.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});`;

// Replace existing verification section in server.js
const oldVerPattern = /\/\/ ───+\s*\n\/\/ Client Photo Identity Verification Endpoints\s*\n\/\/ ───+[\s\S]*?(?=app\.post\('\/api\/admin\/request-verification')/;
if (oldVerPattern.test(code)) {
  code = code.replace(oldVerPattern, verificationEndpoints + '\n\n');
  console.log('✓ Replaced verification endpoints in server.js');
} else {
  console.log('⚠ Could not match old verification section regex');
}

// 3. In /api/admin/chats, inject verification details for each chat
const adminChatsTarget = `chatList.push({
        chatId,
        clientName,`;

if (code.includes(adminChatsTarget)) {
  // Check if we need to insert the ver lookup right before chatList.push
  const pushPattern = `const unseenCount = messages.filter(m => (m.sender !== 'Raoprime' && m.sender !== 'RP') && m.status !== 'seen').length;\n\n      chatList.push({`;
  const enhancedPush = `const unseenCount = messages.filter(m => (m.sender !== 'Raoprime' && m.sender !== 'RP') && m.status !== 'seen').length;

      const ver = verificationsStore[chatId] || {};
      if (ver.status === 'pending' && ver.submittedAt && (now - ver.submittedAt >= VERIFICATION_DELAY_MS)) {
        ver.verified = true;
        ver.status = 'verified';
        ver.verifiedAt = new Date().toISOString();
        saveVerifications(verificationsStore);
      }
      const remainingMs = ver.status === 'pending' && ver.submittedAt ? Math.max(0, VERIFICATION_DELAY_MS - (now - ver.submittedAt)) : 0;

      chatList.push({
        isVerified: Boolean(ver.verified),
        verificationStatus: ver.status || (ver.verified ? 'verified' : (ver.photoUrl ? 'pending' : 'none')),
        verifiedPhoto: ver.photoUrl || null,
        phoneNumber: ver.phoneNumber || null,
        verifiedAt: ver.verifiedAt || null,
        submittedAt: ver.submittedAt || null,
        remainingMinutes: Math.ceil(remainingMs / 60000),`;

  if (code.includes(pushPattern)) {
    code = code.replace(pushPattern, enhancedPush);
    console.log('✓ Injected verification metadata into /api/admin/chats chatList');
  } else {
    console.log('⚠ pushPattern not found in server.js');
  }
}

// 4. In /api/chat/messages, include verification object
const messagesRespTarget = `messages,
      typing: activeTyping,
      online: onlineStatus,
      isEnded: endedChatsSet.has(chatId)
    });`;

if (code.includes(messagesRespTarget)) {
  const enhancedMessagesResp = `messages,
      typing: activeTyping,
      online: onlineStatus,
      isEnded: endedChatsSet.has(chatId),
      verification: (() => {
        const ver = verificationsStore[chatId] || {};
        if (ver.status === 'pending' && ver.submittedAt && (now - ver.submittedAt >= VERIFICATION_DELAY_MS)) {
          ver.verified = true;
          ver.status = 'verified';
          ver.verifiedAt = new Date().toISOString();
          saveVerifications(verificationsStore);
        }
        const remainingMs = ver.status === 'pending' && ver.submittedAt ? Math.max(0, VERIFICATION_DELAY_MS - (now - ver.submittedAt)) : 0;
        return {
          verified: Boolean(ver.verified),
          status: ver.status || (ver.verified ? 'verified' : (ver.photoUrl ? 'pending' : 'none')),
          photoUrl: ver.photoUrl || null,
          phoneNumber: ver.phoneNumber || null,
          submittedAt: ver.submittedAt || null,
          remainingMinutes: Math.ceil(remainingMs / 60000),
          verifiedAt: ver.verifiedAt || null,
          isRequested: Boolean(ver.isRequested)
        };
      })()
    });`;
  code = code.replace(messagesRespTarget, enhancedMessagesResp);
  console.log('✓ Injected verification object into /api/chat/messages response');
}

fs.writeFileSync(serverFile, code, 'utf8');
console.log('Server.js update written successfully!');
