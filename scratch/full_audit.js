const fs = require('fs');
const app = fs.readFileSync('public/chat-app.js', 'utf8');
const idx = fs.readFileSync('public/index.html', 'utf8');
const adm = fs.readFileSync('public/admin.js', 'utf8');

console.log('=== FULL AUDIT REPORT ===\n');

// 1. data.verification in loadMessages
const verIdx = app.indexOf('data.verification');
if (verIdx === -1) {
  console.log('❌ BUG 1: data.verification NOT consumed in loadMessages - status never auto-updates from server!');
} else {
  console.log('✓ data.verification found at char:', verIdx);
  console.log(app.substring(verIdx - 50, verIdx + 300));
}

// 2. loadPhotoVerificationStatus called at startup
const domLoad = app.indexOf('DOMContentLoaded');
const domChunk = app.substring(domLoad, domLoad + 3000);
if (!domChunk.includes('loadPhotoVerificationStatus')) {
  console.log('\n❌ BUG 2: loadPhotoVerificationStatus NOT called on startup - verification status never loaded!');
} else {
  console.log('\n✓ loadPhotoVerificationStatus called at startup');
}

// 3. validateVerificationForm called after photo capture/upload
const captureIdx = app.indexOf('function captureModalPhoto');
const captureChunk = app.substring(captureIdx, captureIdx + 700);
if (!captureChunk.includes('validateVerificationForm')) {
  console.log('\n❌ BUG 3: validateVerificationForm NOT called after captureModalPhoto - save button stays disabled!');
} else {
  console.log('\n✓ validateVerificationForm called after capture');
}

const fileIdx = app.indexOf('function handlePhotoFileSelected');
const fileChunk = app.substring(fileIdx, fileIdx + 800);
if (!fileChunk.includes('validateVerificationForm')) {
  console.log('❌ BUG 4: validateVerificationForm NOT called after handlePhotoFileSelected - save button stays disabled after upload!');
} else {
  console.log('✓ validateVerificationForm called after file select');
}

// 4. Strip visibility by default
const stripStart = idx.indexOf('id="photoVerifyStrip"');
const stripChunk = idx.substring(stripStart - 5, stripStart + 100);
console.log('\n=== Strip default visibility ===');
console.log(stripChunk);

// 5. Check pending status branch - toggle.checked = true when pending
const uiFn = app.indexOf('function updatePhotoVerifyUI');
const uiChunk = app.substring(uiFn, uiFn + 2500);
const hasPendingToggleTrue = uiChunk.includes("pending") && uiChunk.includes("toggle.checked = true");
console.log('\n✓/❌ Pending state sets toggle.checked=true:', hasPendingToggleTrue);

// 6. Admin loadAdminChats - does it save isVerified/verifiedPhoto to allChats?
const ladmIdx = adm.indexOf('async function loadAdminChats');
const ladmChunk = adm.substring(ladmIdx, ladmIdx + 2500);
console.log('\n=== admin loadAdminChats - pushes isVerified? ===');
console.log('Has allChats.push or allChats =:', ladmChunk.includes('allChats'));
console.log('Has isVerified in mapping:', ladmChunk.includes('isVerified'));
console.log('Has verificationStatus:', ladmChunk.includes('verificationStatus'));
console.log(ladmChunk.substring(0, 1000));

// 7. admin.js - does renderAdminChats pass verification fields to chat item?
const renderIdx = adm.indexOf('function renderAdminChats');
const renderChunk = adm.substring(renderIdx, renderIdx + 3000);
console.log('\n=== renderAdminChats verification usage ===');
console.log('Has c.isVerified:', renderChunk.includes('c.isVerified'));
console.log('Has c.verifiedPhoto:', renderChunk.includes('c.verifiedPhoto'));
console.log('Has c.verificationStatus:', renderChunk.includes('c.verificationStatus'));
