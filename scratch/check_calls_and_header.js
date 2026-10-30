const fs = require('fs');
const index = fs.readFileSync('public/index.html', 'utf8');

// Find all call related elements
const lines = index.split('\n');
console.log('=== Call references in index.html ===');
lines.forEach((l, i) => {
  if (/call/i.test(l) && l.length < 120) {
    console.log(`${i+1}: ${l.trim()}`);
  }
});

const headerStart = index.indexOf('<header');
const headerEnd = index.indexOf('</header>');
console.log('\n=== Header content ===\n', index.substring(headerStart, headerEnd + 9));
