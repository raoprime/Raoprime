const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'server.js');
let code = fs.readFileSync(serverFile, 'utf8');

// 1. Inject into /api/admin/chats
const targetPush = 'chatList.push({';
if (code.includes(targetPush)) {
  const replacement = `const ver = verificationsStore[chatId] || {};
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

  code = code.replace(targetPush, replacement);
  console.log('✓ Injected verification into /api/admin/chats');
}

// 2. Inject into /api/chat/messages
const targetOnline = 'online: onlineStatus,';
if (code.includes(targetOnline)) {
  const replacement = `online: onlineStatus,
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
      })(),`;

  // Avoid duplicate isEnded
  code = code.replace(`online: onlineStatus,\r\n      isEnded: endedChatsSet.has(chatId)`, replacement);
  if (!code.includes('verification: (() => {')) {
    code = code.replace(`online: onlineStatus,\n      isEnded: endedChatsSet.has(chatId)`, replacement);
  }
  console.log('✓ Injected verification into /api/chat/messages');
}

fs.writeFileSync(serverFile, code, 'utf8');
console.log('Done!');
