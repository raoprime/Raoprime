const fs = require('fs');
const path = require('path');

const files = [
  'public/index.html',
  'public/admin.html',
  'public/chat-app.js',
  'public/admin.js'
];

files.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  const before = content;

  // Replace unicode replacement char \uFFFD with ✓
  content = content.replace(/\uFFFD/g, '✓');
  // Replace ???? +91 with 🇮🇳 +91
  content = content.replace(/\?\?\?\? \+91/g, '🇮🇳 +91');
  // Replace 'Verified ?' with 'Verified ✓'
  content = content.replace(/Verified [\?]+/g, 'Verified ✓');
  // Replace '?? ' in toasts with '✓ '
  content = content.replace(/showToast\('[\?]{2}\s*/g, "showToast('✓ ");

  if (content !== before) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Cleaned corrupted chars in:', file);
  } else {
    console.log('Already clean:', file);
  }
});
