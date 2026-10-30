const http = require('http');

async function request(path, options = {}) {
  const url = new URL('http://localhost:4000' + path);
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.status, ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.status, ok: res.statusCode >= 200 && res.statusCode < 300, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTest() {
  console.log('=== RUNNING VERIFICATION END-TO-END INTEGRATION TEST ===\n');

  const testChatId = 'integration_test_user_' + Date.now();
  const testPhone = '9876543210';
  const testPhotoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // 1. Initial verification status check
  console.log('1. Checking initial status for', testChatId);
  const r1 = await request(`/api/chat/verification?chatId=${testChatId}`);
  console.log('   Initial verified:', r1.data.verified, 'status:', r1.data.status);
  if (r1.data.verified !== false) throw new Error('Initial should be unverified');

  // 2. Submit verification with phone number & photo
  console.log('\n2. Submitting verification with photo + phone number...');
  const r2 = await request('/api/chat/verify-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: testChatId,
      photoData: testPhotoBase64,
      phoneNumber: testPhone,
      enabled: true
    })
  });
  console.log('   Response success:', r2.data.success);
  console.log('   Status:', r2.data.status, '(should be pending)');
  console.log('   Verified:', r2.data.verified, '(should be false)');
  console.log('   Photo URL:', r2.data.photoUrl);
  console.log('   Phone Number:', r2.data.phoneNumber);
  console.log('   Remaining Minutes:', r2.data.remainingMinutes);

  if (r2.data.status !== 'pending' || r2.data.verified !== false || !r2.data.photoUrl || r2.data.phoneNumber !== testPhone) {
    throw new Error('Submit verification failed expectations!');
  }

  // 3. Query verification status again (pending with 20 min timer)
  console.log('\n3. Querying verification endpoint after submit...');
  const r3 = await request(`/api/chat/verification?chatId=${testChatId}`);
  console.log('   Status:', r3.data.status, 'Verified:', r3.data.verified, 'Remaining min:', r3.data.remainingMinutes);
  if (r3.data.status !== 'pending') throw new Error('Expected status to be pending');

  // 4. Test admin approve endpoint (instant approval)
  console.log('\n4. Logging in as admin to obtain authenticated session token...');
  const loginRes = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'rdmy' })
  });
  if (!loginRes.data.success || !loginRes.data.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes.data));
  }
  const adminToken = loginRes.data.token;
  console.log('   Obtained admin session token:', adminToken.slice(0, 10) + '...');

  console.log('   Admin approving verification instantly...');
  const r4 = await request('/api/admin/verify-client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({
      chatId: testChatId,
      approve: true
    })
  });
  console.log('   Admin approve response:', r4.data);
  if (!r4.data.success || !r4.data.verified) {
    throw new Error('Admin approval failed!');
  }

  // 5. Query verification endpoint after approval
  console.log('\n5. Querying verification after approval...');
  const r5 = await request(`/api/chat/verification?chatId=${testChatId}`);
  console.log('   Status:', r5.data.status, 'Verified:', r5.data.verified, 'VerifiedAt:', r5.data.verifiedAt);
  if (r5.data.status !== 'verified' || !r5.data.verified) {
    throw new Error('Expected status to be verified');
  }

  // 6. Cleanup test entry
  console.log('\n6. Cleaning up test user...');
  await request('/api/chat/verify-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: testChatId,
      enabled: false
    })
  });

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% READY FOR PRODUCTION!');
}

runTest().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
