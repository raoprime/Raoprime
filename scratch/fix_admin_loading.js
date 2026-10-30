const fs = require('fs');
const path = require('path');

// 1. Fix public/admin.js
const adminJsPath = path.join(__dirname, '../public/admin.js');
let adminJs = fs.readFileSync(adminJsPath, 'utf8');
const isAdminCrlf = adminJs.includes('\r\n');

// Replace date handling in renderAdminSingleMessageHtml
adminJs = adminJs.replace(
  /const msgDate = new Date\(msg\.timestamp\);[\s\S]*?const isSameSenderAsPrev = !isNewDay && prevMsg/,
  `const msgDate = new Date(msg.timestamp);
    const dateFormatted = msgDate.toDateString();
    const prevDate = prevMsg ? (new Date(prevMsg.timestamp)).toDateString() : null;
    const isNewDay = !prevDate || dateFormatted !== prevDate;
    let dateDividerHtml = '';

    if (isNewDay) {
      const now = new Date();
      let label = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
      if (dateFormatted === now.toDateString()) label = 'Today';
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (dateFormatted === yesterday.toDateString()) label = 'Yesterday';

      dateDividerHtml = \`
        <div class="flex justify-center my-3 select-none">
          <span class="px-3.5 py-1 rounded-full bg-[#111520]/90 border border-white/10 text-[10.5px] font-semibold text-slate-400 tracking-wider uppercase backdrop-blur-md shadow-sm">
            \${label}
          </span>
        </div>
      \`;
    }

    const isSameSenderAsPrev = !isNewDay && prevMsg`
);

// Remove duplicate return at end of renderAdminSingleMessageHtml
adminJs = adminJs.replace(
  /          <\/div>\s*<\/div>\s*<\/div>\s*`;\s*return `\${dateDividerHtml}<div class="admin-message-row[\s\S]*?<\/div><\/div><\/div>`;\s*\}/,
  `          </div>\n        </div>\n      </div>\n    \`;\n}`
);

if (isAdminCrlf) {
  adminJs = adminJs.replace(/\r?\n/g, '\r\n');
}
fs.writeFileSync(adminJsPath, adminJs, 'utf8');
console.log('Successfully updated public/admin.js');

// 2. Fix public/chat-app.js
const chatAppPath = path.join(__dirname, '../public/chat-app.js');
let chatApp = fs.readFileSync(chatAppPath, 'utf8');
const isChatCrlf = chatApp.includes('\r\n');

chatApp = chatApp.replace(
  /let lastDateStr = '';[\s\S]*?const msgDate = new Date\(msg\.timestamp\);[\s\S]*?const isSameSenderAsPrev = !isNewDay && prevMsg/,
  `const isOut = msg.sender === currentRole;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

    const msgDate = new Date(msg.timestamp);
    const dateFormatted = msgDate.toDateString();
    const prevDate = prevMsg ? (new Date(prevMsg.timestamp)).toDateString() : null;
    const isNewDay = !prevDate || dateFormatted !== prevDate;
    let dateDividerHtml = '';

    if (isNewDay) {
      const now = new Date();
      let label = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
      if (dateFormatted === now.toDateString()) label = 'Today';
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (dateFormatted === yesterday.toDateString()) label = 'Yesterday';

      dateDividerHtml = \`
        <div class="flex justify-center my-3 select-none">
          <span class="px-3.5 py-1 rounded-full bg-[#111520]/90 border border-white/10 text-[10.5px] font-semibold text-slate-400 tracking-wider uppercase backdrop-blur-md shadow-sm">
            \${label}
          </span>
        </div>
      \`;
    }

    const isSameSenderAsPrev = !isNewDay && prevMsg`
);

if (isChatCrlf) {
  chatApp = chatApp.replace(/\r?\n/g, '\r\n');
}
fs.writeFileSync(chatAppPath, chatApp, 'utf8');
console.log('Successfully updated public/chat-app.js');
