const fs = require('fs');

const indexHtml = fs.readFileSync('public/index.html', 'utf8');
const chatAppJs = fs.readFileSync('public/chat-app.js', 'utf8');

console.log('=== In chat-app.js ===');
const lines = chatAppJs.split('\n');
lines.forEach((line, idx) => {
  if (/prompt\(|raoprime_client|Enter your name|Your Name|clientName|username/i.test(line)) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});

console.log('\n=== In index.html ===');
const indexLines = indexHtml.split('\n');
indexLines.forEach((line, idx) => {
  if (/name|modal|client|verify/i.test(line) && line.length < 150) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
