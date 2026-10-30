/**
 * update_server_google_v65.js
 * Adds /api/chat/verify-google endpoint to server.js
 * Updates /api/chat/verification and /api/admin/chats with email & provider
 */

const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'server.js');
let code = fs.readFileSync(serverFile, 'utf8');

// 1. Add /api/chat/verify-google endpoint
const googleVerifyEndpoint = `
// Original Google Identity Verification (Auto-fetches Profile Picture & Verified Email)
app.post('/api/chat/verify-google', (req, res) => {
  try {
    const { chatId: rawChatId = 'default', profile } = req.body;
    if (!profile || !profile.email) {
      return res.status(400).json({ success: false, error: 'Valid Google profile is required' });
    }

    const chatId = normalizeChatId(rawChatId);
    const photoUrl = profile.picture || null;
    const email = profile.email;
    const name = profile.name || chatId;
    const now = new Date().toISOString();

    verificationsStore[chatId] = {
      verified: true,
      status: 'verified',
      provider: 'google',
      photoUrl,
      email,
      name,
      phoneNumber: profile.phoneNumber || verificationsStore[chatId]?.phoneNumber || null,
      verifiedAt: now,
      updatedAt: now,
      isRequested: false
    };
    saveVerifications(verificationsStore);

    broadcastToRoom(chatId, 'chat:verification-updated', {
      chatId,
      verified: true,
      status: 'verified',
      provider: 'google',
      photoUrl,
      email,
      name,
      verifiedAt: now
    });

    console.log(\`[Google Auth] Client \${chatId} verified with Google (\${email})\`);

    res.json({
      success: true,
      verified: true,
      status: 'verified',
      provider: 'google',
      photoUrl,
      email,
      name,
      verifiedAt: now
    });
  } catch (err) {
    console.error('verify-google error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

if (!code.includes("app.post('/api/chat/verify-google'")) {
  const insertMarker = "app.post('/api/chat/verify-photo'";
  if (code.includes(insertMarker)) {
    code = code.replace(insertMarker, googleVerifyEndpoint + '\n' + insertMarker);
    console.log('✓ Added /api/chat/verify-google endpoint to server.js');
  } else {
    console.log('⚠ Could not find insertMarker in server.js');
  }
}

// 2. In /api/chat/verification, include email & provider in response
const verRespTarget = `photoUrl: ver.photoUrl || null,
      phoneNumber: ver.phoneNumber || null,`;

const verRespReplacement = `photoUrl: ver.photoUrl || null,
      email: ver.email || null,
      provider: ver.provider || 'custom',
      name: ver.name || null,
      phoneNumber: ver.phoneNumber || null,`;

if (code.includes(verRespTarget) && !code.includes('provider: ver.provider')) {
  code = code.replace(verRespTarget, verRespReplacement);
  console.log('✓ Included email & provider in /api/chat/verification response');
}

// 3. In /api/admin/chats, include email & provider in chatList
const adminChatsTarget = `verifiedPhoto: ver.photoUrl || null,
        phoneNumber: ver.phoneNumber || null,`;

const adminChatsReplacement = `verifiedPhoto: ver.photoUrl || null,
        verifiedEmail: ver.email || null,
        provider: ver.provider || 'custom',
        phoneNumber: ver.phoneNumber || null,`;

if (code.includes(adminChatsTarget) && !code.includes('verifiedEmail: ver.email')) {
  code = code.replace(adminChatsTarget, adminChatsReplacement);
  console.log('✓ Included verifiedEmail & provider in /api/admin/chats');
}

fs.writeFileSync(serverFile, code, 'utf8');
console.log('server.js updated successfully!');
