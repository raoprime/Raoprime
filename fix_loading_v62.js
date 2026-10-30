/**
 * fix_loading_v62.js
 * Fix the stuck "Loading..." on admin panel
 * Key issues:
 * 1. adminChatCache declared AFTER selectChat uses it → move to top
 * 2. Poll interval too slow (30s when WS connected) → drop to 2s always
 * 3. Version bump to v=6.2
 */

const fs = require('fs');
const path = require('path');

const adminJsPath = path.join(__dirname, 'public', 'admin.js');
const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');

let adminJs = fs.readFileSync(adminJsPath, 'utf8');
let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

let changes = [];

// ─── FIX 1: Move adminChatCache declaration to the very TOP of the file ──────
// Remove the late declaration first
const lateDeclPattern = /const adminChatCache = \{\};\s*\nwindow\.adminChatCache = adminChatCache;\s*\n/;
if (lateDeclPattern.test(adminJs)) {
  adminJs = adminJs.replace(lateDeclPattern, '');
  changes.push('✓ Removed late adminChatCache declaration');
} else {
  console.log('⚠ Late adminChatCache declaration not found (may already be fixed or pattern mismatch)');
}

// Now inject at the very top (after first 'use strict' or at line 1)
const topDecl = `// ─── Global Cache (must be at top before any function uses it) ───────────────
const adminChatCache = {};
window.adminChatCache = adminChatCache;

`;
// Insert after the very first line
const firstNewline = adminJs.indexOf('\n');
adminJs = adminJs.substring(0, firstNewline + 1) + topDecl + adminJs.substring(firstNewline + 1);
changes.push('✓ adminChatCache declared at TOP of file');

// ─── FIX 2: Poll interval — always 2s (not 30s when WS connected) ─────────────
const slowPollPattern = /const interval = isAdminWsConnected \? 30000 : \(document\.hidden \? 5000 : 2000\);/;
const fastPoll = `const interval = document.hidden ? 4000 : 2000; // Always fast-poll for real-time feel`;
if (slowPollPattern.test(adminJs)) {
  adminJs = adminJs.replace(slowPollPattern, fastPoll);
  changes.push('✓ Poll interval fixed: always 2s (not 30s when WS connected)');
} else {
  console.log('⚠ Slow poll pattern not found');
}

// ─── FIX 3: Force-render even when sig matches (belt+suspenders) ──────────────
// If placeholder is showing AND sig matches (no new msgs), still clear it
const sigCheckPattern = /if \(currentSig !== lastAdminMsgSig \|\| isPlaceholderStillShowing \|\| data\.messages\.length === 0\) \{/;
if (!sigCheckPattern.test(adminJs)) {
  // Try to add isPlaceholderStillShowing if not there
  const altPattern = /if \(currentSig !== lastAdminMsgSig \|\| isPlaceholderStillShowing\) \{/;
  if (altPattern.test(adminJs)) {
    adminJs = adminJs.replace(altPattern, 'if (currentSig !== lastAdminMsgSig || isPlaceholderStillShowing || data.messages.length === 0) {');
    changes.push('✓ Force-render condition strengthened');
  } else {
    console.log('⚠ Sig check pattern not found for strengthening');
  }
} else {
  changes.push('✓ Force-render condition already strong');
}

// ─── FIX 4: Version bump v=6.1 → v=6.2 in admin.html ─────────────────────────
if (adminHtml.includes('admin.js?v=6.1')) {
  adminHtml = adminHtml.replace(/admin\.js\?v=6\.1/g, 'admin.js?v=6.2');
  changes.push('✓ admin.html version bumped to v=6.2');
} else if (adminHtml.includes('admin.js?v=6.2')) {
  changes.push('✓ admin.html already at v=6.2');
} else {
  // Try generic pattern
  adminHtml = adminHtml.replace(/admin\.js\?v=[\d.]+/g, 'admin.js?v=6.2');
  changes.push('✓ admin.html version bumped to v=6.2 (generic)');
}

// ─── FIX 5: Version bump v=6.1 → v=6.2 in index.html ────────────────────────
const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
if (indexHtml.includes('chat-app.js?v=6.1')) {
  indexHtml = indexHtml.replace(/chat-app\.js\?v=6\.1/g, 'chat-app.js?v=6.2');
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
  changes.push('✓ index.html version bumped to v=6.2');
} else if (indexHtml.includes('chat-app.js?v=6.2')) {
  changes.push('✓ index.html already at v=6.2');
} else {
  indexHtml = indexHtml.replace(/chat-app\.js\?v=[\d.]+/g, 'chat-app.js?v=6.2');
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
  changes.push('✓ index.html version bumped to v=6.2 (generic)');
}

// ─── Write files ──────────────────────────────────────────────────────────────
fs.writeFileSync(adminJsPath, adminJs, 'utf8');
fs.writeFileSync(adminHtmlPath, adminHtml, 'utf8');

console.log('\n=== FIX LOADING v6.2 ===');
changes.forEach(c => console.log(c));
console.log('\nDone!');

// Verify adminChatCache is now at the top
const firstHundred = adminJs.substring(0, 300);
console.log('\n=== First 300 chars of admin.js ===');
console.log(firstHundred);

// Check no duplicate adminChatCache
const cacheOccurrences = (adminJs.match(/const adminChatCache = \{\}/g) || []).length;
console.log(`\nadminChatCache declarations found: ${cacheOccurrences} (should be exactly 1)`);
