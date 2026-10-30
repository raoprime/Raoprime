const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server.js');
let code = fs.readFileSync(filePath, 'utf8');
const isCrlf = code.includes('\r\n');

// Replace using regex that handles both \r\n and \n
code = code.replace(
  /function getRoomPresence\(chatId\) \{[\s\S]*?return \{ isClientOnline, isAdminOnline \};\s*\}/,
  `function getRoomPresence(chatId) {\n  const normChatId = normalizeChatId(chatId);\n  let isClientOnline = false;\n\n  for (const [, meta] of wsClients.entries()) {\n    if (meta.chatId === normChatId) {\n      isClientOnline = true;\n    }\n  }\n  // Admin is ALWAYS active (Instagram style always-online)\n  return { isClientOnline, isAdminOnline: true };\n}`
);

code = code.replace(
  /const isRaoprimeOnline = Boolean\(\(now - globalAdminPresence < 10000\)[\s\S]*?Raoprime: isRaoprimeOnline\s*\};/,
  `// Admin is ALWAYS active (Instagram style always-online)\n    const isRaoprimeOnline = true;\n\n    const onlineStatus = {\n      Client: isClientOnline,\n      Raoprime: true\n    };`
);

code = code.replace(
  /const isOtherOnline = otherSender === 'Raoprime'\s*\?\s*Boolean\(now - globalAdminPresence < 10000[\s\S]*?\)[\r\n\s]*:\s*Boolean\(presenceStatus\[chatId\]\?\.Client && \(now - presenceStatus\[chatId\]\.Client < 10000\)\);/,
  `const isOtherOnline = otherSender === 'Raoprime'\n      ? true // Admin is ALWAYS active\n      : Boolean(presenceStatus[chatId]?.Client && (now - presenceStatus[chatId].Client < 10000));`
);

code = code.replace(
  /const isOtherOnline = otherSender === 'Raoprime'\s*\?\s*Boolean\(nowMs - globalAdminPresence < 10000[\s\S]*?\)[\r\n\s]*:\s*Boolean\(presenceStatus\[chatId\]\?\.Client && \(nowMs - presenceStatus\[chatId\]\.Client < 10000\)\);/,
  `const isOtherOnline = otherSender === 'Raoprime'\n      ? true // Admin is ALWAYS active\n      : Boolean(presenceStatus[chatId]?.Client && (nowMs - presenceStatus[chatId].Client < 10000));`
);

if (isCrlf) {
  code = code.replace(/\r?\n/g, '\r\n');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated server.js with regex-safe replacements!');
