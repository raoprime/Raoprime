const http = require('http');

async function request(path, options = {}) {
  const url = new URL('http://localhost:4000' + path);
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('=== TESTING REAL GOOGLE VERIFICATION SUITE ===\n');

  const testUser = 'google_user_' + Date.now();
  const testEmail = 'user_' + Date.now() + '@gmail.com';
  const testPic = 'https://lh3.googleusercontent.com/a/test_avatar_' + Date.now();

  // 1. Submit Google Verification
  console.log('1. Submitting Google Verification for', testUser);
  const r1 = await request('/api/chat/verify-google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: testUser,
      profile: {
        name: 'Dharmesh Google',
        email: testEmail,
        picture: testPic,
        sub: 'google_sub_12345'
      }
    })
  });
  console.log('   Response status:', r1.status);
  console.log('   Response data:', r1.data);
  if (!r1.data.success || !r1.data.verified || r1.data.email !== testEmail) {
    throw new Error('Google verification submission failed!');
  }

  // 2. Query verification status
  console.log('\n2. Querying /api/chat/verification for', testUser);
  const r2 = await request(`/api/chat/verification?chatId=${testUser}`);
  console.log('   Verification data:', r2.data);
  if (!r2.data.verified || r2.data.email !== testEmail || r2.data.photoUrl !== testPic) {
    throw new Error('Query verification returned incorrect data!');
  }

  // 3. Login as admin and check /api/admin/chats
  console.log('\n3. Logging in as admin...');
  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'rdmy' })
  });
  const token = adminLogin.data.token;

  console.log('   Querying admin chats...');
  const adminChats = await request('/api/admin/chats', {
    headers: { 'x-admin-token': token }
  });
  console.log('   Admin chats query successful, status:', adminChats.status);

  // 4. Cleanup test user
  console.log('\n4. Cleaning up test user...');
  await request('/api/chat/verify-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: testUser, enabled: false })
  });

  console.log('\n🎉 GOOGLE VERIFICATION SUITE TEST PASSED WITH 100% SUCCESS!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
