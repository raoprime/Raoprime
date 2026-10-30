const fs = require('fs');
const path = require('path');

// ----------------------------------------------------
// 1. UPDATE public/index.html
// ----------------------------------------------------
const indexHtmlPath = path.join(__dirname, '../public/index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const isIndexCrlf = indexHtml.includes('\r\n');

// Replace CSS radar animation with Instagram active dot styles
indexHtml = indexHtml.replace(
  /\/\* Radar Ping Animation for Online Activity Indicator \*\/[\s\S]*?\.radar-pulse::after \{[\s\S]*?z-index: 0;\s*\}/,
  `/* Instagram Signature Active Indicator */\n    .ig-active-dot {\n      background-color: #00d26a;\n      border: 2px solid #0a0c12;\n      box-shadow: 0 0 0 1px rgba(0, 210, 106, 0.25), 0 0 6px rgba(0, 210, 106, 0.5);\n    }\n    .ig-active-dot-lg {\n      background-color: #00d26a;\n      border: 3px solid #0e1118;\n      box-shadow: 0 0 0 1.5px rgba(0, 210, 106, 0.3), 0 0 10px rgba(0, 210, 106, 0.6);\n    }`
);

// Replace header avatar radar dot
indexHtml = indexHtml.replace(
  /<!-- Live Radar Activity Indicator on Avatar -->\s*<span id="headerRadarDot" class="[^"]*"><\/span>/,
  `<!-- Instagram Active Indicator Dot -->\n        <span id="headerRadarDot" class="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot"></span>`
);

// Replace header status text with Instagram DM style
indexHtml = indexHtml.replace(
  /<!-- Status \/ Real-time Typing Text -->\s*<p id="headerStatus"[\s\S]*?<\/p>/,
  `<!-- Status / Real-time Typing Text (Instagram DM Style) -->\n        <p id="headerStatus" class="text-[11.5px] sm:text-[12px] text-slate-400 font-normal flex items-center gap-1.5 truncate">\n          <span class="w-1.5 h-1.5 rounded-full bg-[#00D26A] inline-block shrink-0"></span>\n          <span>Active now</span>\n        </p>`
);

// Replace profile modal indicator
indexHtml = indexHtml.replace(
  /<span class="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-\[#0e1118\] rounded-full radar-pulse"><\/span>/,
  `<span class="absolute bottom-1 right-1 w-5 h-5 rounded-full ig-active-dot-lg"></span>`
);

// Bump version in index.html to v=5.7
indexHtml = indexHtml.replace(/chat-app\.js\?v=5\.6/, 'chat-app.js?v=5.7');

if (isIndexCrlf) {
  indexHtml = indexHtml.replace(/\r?\n/g, '\r\n');
}
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('Successfully updated public/index.html');


// ----------------------------------------------------
// 2. UPDATE public/admin.html (version bump)
// ----------------------------------------------------
const adminHtmlPath = path.join(__dirname, '../public/admin.html');
let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
const isAdminCrlf = adminHtml.includes('\r\n');

adminHtml = adminHtml.replace(/admin\.js\?v=5\.6/, 'admin.js?v=5.7');

if (isAdminCrlf) {
  adminHtml = adminHtml.replace(/\r?\n/g, '\r\n');
}
fs.writeFileSync(adminHtmlPath, adminHtml, 'utf8');
console.log('Successfully updated public/admin.html');


// ----------------------------------------------------
// 3. UPDATE public/chat-app.js
// ----------------------------------------------------
const chatAppPath = path.join(__dirname, '../public/chat-app.js');
let chatApp = fs.readFileSync(chatAppPath, 'utf8');
const isChatCrlf = chatApp.includes('\r\n');

// Replace updateTypingUI function
chatApp = chatApp.replace(
  /function updateTypingUI\(isOnline, isTyping\) \{[\s\S]*?\n\}/,
  `function updateTypingUI(isOnline, isTyping) {
  const headerStatus = document.getElementById('headerStatus');
  const bubble = document.getElementById('typingBubbleContainer');
  const radarDot = document.getElementById('headerRadarDot');

  // Instagram Style: Admin is ALWAYS active
  if (isTyping) {
    if (headerStatus) {
      headerStatus.innerHTML = \`
        <span class="text-rose-400 font-medium flex items-center gap-1.5 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Raoprime is typing...
        </span>\`;
    }
    if (bubble && bubble.classList.contains('hidden')) {
      bubble.classList.remove('hidden');
      scrollToBottom();
    }
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot';
    }
  } else {
    // Always Active (Instagram DM Signature Style)
    if (headerStatus) {
      headerStatus.innerHTML = \`
        <span class="w-1.5 h-1.5 rounded-full bg-[#00D26A] inline-block shrink-0"></span>
        <span class="text-slate-400 font-normal">Active now</span>\`;
    }
    if (bubble) bubble.classList.add('hidden');
    if (radarDot) {
      radarDot.className = 'absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ig-active-dot';
    }
  }
}`
);

// In loadMessages: always update with isOnline = true
chatApp = chatApp.replace(
  /const isOtherOnline = Boolean\(data\.online && data\.online\[otherSender\]\);[\s\S]*?updateTypingUI\(isOtherOnline, isOtherTyping\);/,
  `const isOtherTyping = Boolean(data.typing && data.typing[otherSender]);\n      const currentTypingSig = \`online:\${isOtherTyping}\`;\n      if (currentTypingSig !== lastTypingSig) {\n        lastTypingSig = currentTypingSig;\n        updateTypingUI(true, isOtherTyping);`
);

// In DOMContentLoaded: initialize active status right away
chatApp = chatApp.replace(
  /initServiceWorkerAndNotifications\(\);/,
  `initServiceWorkerAndNotifications();\n  // Instagram Always-Active Indicator\n  updateTypingUI(true, false);`
);

if (isChatCrlf) {
  chatApp = chatApp.replace(/\r?\n/g, '\r\n');
}
fs.writeFileSync(chatAppPath, chatApp, 'utf8');
console.log('Successfully updated public/chat-app.js');
