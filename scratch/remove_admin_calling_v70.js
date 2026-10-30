/**
 * remove_admin_calling_v70.js
 * Removes calling buttons and calling modals from public/admin.html
 * Bumps admin.js?v=7.0
 */

const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');
let html = fs.readFileSync(adminHtmlPath, 'utf8');

// 1. Remove Voice Call & Video Call buttons from admin header
const callBtnsPattern = /<!-- Voice Call Button -->[\s\S]*?<!-- Download ZIP Button -->/;
const downloadZipBtn = `<!-- Download ZIP Button -->`;

if (callBtnsPattern.test(html)) {
  html = html.replace(callBtnsPattern, downloadZipBtn);
  console.log('✓ Removed call buttons from admin header');
} else {
  console.log('⚠ Could not match callBtnsPattern in admin.html');
}

// 2. Remove calling modals from admin.html
const adminCallModalsPattern = /<!-- Ultra-Luxury VIP Incoming Call Screen[\s\S]*?<!-- Delete Chat Confirmation Modal -->/;
const deleteConfirmStart = `<!-- Delete Chat Confirmation Modal -->`;

if (adminCallModalsPattern.test(html)) {
  html = html.replace(adminCallModalsPattern, deleteConfirmStart);
  console.log('✓ Removed calling modals from admin.html');
} else {
  console.log('⚠ Could not match adminCallModalsPattern in admin.html');
}

// 3. Bump version to v=7.0
html = html.replace(/admin\.js\?v=[\d.]+/g, 'admin.js?v=7.0');

fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('admin.html updated successfully (v=7.0)!');
