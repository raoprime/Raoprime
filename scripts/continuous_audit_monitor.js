/**
 * Continuous Audit Monitor for Raoprime Portal
 * 
 * Performs automated health, OAuth endpoint, and headless browser UI audits
 * across local and production (Render) environments.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const LOCAL_BASE = 'http://localhost:4000';
const LIVE_BASE = 'https://raoprime.onrender.com';
const EXPECTED_CLIENT_ID_PREFIX = '1091556491172';

function fetchUrl(targetUrl, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(targetUrl, { headers: { 'User-Agent': 'Raoprime-AuditMonitor/2.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms for ${targetUrl}`));
    });
  });
}

async function runAudit() {
  console.log(`[${new Date().toISOString()}] ========================================================`);
  console.log(`[${new Date().toISOString()}] Starting Raoprime Continuous Audit Monitor...`);
  console.log(`[${new Date().toISOString()}] ========================================================`);

  const report = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { passed: 0, failed: 0, total: 0 }
  };

  function record(name, passed, details) {
    report.summary.total++;
    if (passed) {
      report.summary.passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      report.summary.failed++;
      console.error(`  ❌ [FAIL] ${name}:`, details);
    }
    report.tests.push({ name, passed, details, timestamp: new Date().toISOString() });
  }

  // 1. Local Health Check
  try {
    const localHealth = await fetchUrl(`${LOCAL_BASE}/api/health`);
    const isOk = localHealth.statusCode === 200;
    record('Local Server Health (/api/health)', isOk, { statusCode: localHealth.statusCode, body: localHealth.body });
  } catch (err) {
    record('Local Server Health (/api/health)', false, { error: err.message });
  }

  // 2. Production Health Check
  try {
    const liveHealth = await fetchUrl(`${LIVE_BASE}/api/health`);
    const isOk = liveHealth.statusCode === 200;
    record('Production Server Health (/api/health)', isOk, { statusCode: liveHealth.statusCode, body: liveHealth.body });
  } catch (err) {
    record('Production Server Health (/api/health)', false, { error: err.message });
  }

  // 3. Local Google OAuth Endpoint Check
  try {
    const localOauth = await fetchUrl(`${LOCAL_BASE}/api/auth/google?chatId=audit_client`);
    const isRedirect = localOauth.statusCode === 302;
    const location = localOauth.headers.location || '';
    const hasGoogle = location.includes('accounts.google.com');
    const hasClientId = location.includes(EXPECTED_CLIENT_ID_PREFIX);
    record('Local Google OAuth Init (/api/auth/google)', isRedirect && hasGoogle && hasClientId, {
      statusCode: localOauth.statusCode,
      hasGoogleRedirect: hasGoogle,
      hasClientId: hasClientId,
      locationPreview: location.substring(0, 120) + '...'
    });
  } catch (err) {
    record('Local Google OAuth Init (/api/auth/google)', false, { error: err.message });
  }

  // 4. Production Google OAuth Endpoint Check
  try {
    const liveOauth = await fetchUrl(`${LIVE_BASE}/api/auth/google?chatId=audit_client`);
    const isRedirect = liveOauth.statusCode === 302;
    const location = liveOauth.headers.location || '';
    const hasGoogle = location.includes('accounts.google.com');
    const hasClientId = location.includes(EXPECTED_CLIENT_ID_PREFIX);
    record('Production Google OAuth Init (/api/auth/google)', isRedirect && hasGoogle && hasClientId, {
      statusCode: liveOauth.statusCode,
      hasGoogleRedirect: hasGoogle,
      hasClientId: hasClientId,
      locationPreview: location.substring(0, 120) + '...'
    });
  } catch (err) {
    record('Production Google OAuth Init (/api/auth/google)', false, { error: err.message });
  }

  // 5. Headless Browser Invariant & UI Audit via Puppeteer
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    await page.goto(`${LOCAL_BASE}/?chat=audit_client`, { waitUntil: 'networkidle2', timeout: 20000 });

    // Check for Console Errors
    record('Browser Console Integrity (Zero Errors)', consoleErrors.length === 0, { errors: consoleErrors });

    // Check DOM Elements for Document Preview Modal
    const hasDocModal = await page.$('#documentPreviewModal') !== null;
    record('Universal Document Preview Modal in DOM', hasDocModal, { selector: '#documentPreviewModal' });

    // Check DOM Elements for Velvet Maroon Invariants
    const rootVelvetCardOut = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--wa-card-out').trim();
    });
    const isMaroon = rootVelvetCardOut.toLowerCase() === '#741728';
    record('Brand Invariant: Signature Velvet Maroon CSS Token', isMaroon, { tokenValue: rootVelvetCardOut });

    // Check DOM Elements for Clutter Purge (No instant DP button, no fake timers)
    const hasInstantDpBtn = await page.evaluate(() => {
      const el = document.getElementById('instantSyncDpBtn');
      if (el) return true;
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Instant Sync Google DP'));
    });
    record('Profile Clutter Check: "Instant Sync Google DP" button eliminated', !hasInstantDpBtn, {});

    const fakeCountdown = await page.evaluate(() => {
      return document.body.innerText.includes('Simulated Delay') || document.body.innerText.includes('Wait 20 minutes');
    });
    record('Profile Clutter Check: Fake countdown timers eliminated', !fakeCountdown, {});

    // Check Helper Functions Available in Browser Context
    const functionsExist = await page.evaluate(() => {
      return {
        openDocumentPreview: typeof window.openDocumentPreview === 'function',
        closeDocumentPreviewModal: typeof window.closeDocumentPreviewModal === 'function',
        renderWaveformBarsHtml: typeof window.renderWaveformBarsHtml === 'function',
        toggleWaveformAudio: typeof window.toggleWaveformAudio === 'function',
        seekWaveformAudio: typeof window.seekWaveformAudio === 'function',
        cycleAudioPlaybackRate: typeof window.cycleAudioPlaybackRate === 'function'
      };
    });
    const allFunctionsPresent = Object.values(functionsExist).every(Boolean);
    record('Interactive Feature Track APIs Available on Window', allFunctionsPresent, functionsExist);

  } catch (err) {
    record('Headless Browser Invariant Audit', false, { error: err.message });
  } finally {
    if (browser) await browser.close();
  }

  // Save audit report
  const reportDir = path.join(__dirname, '..', 'handoff', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'continuous_audit_report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log(`[${new Date().toISOString()}] ========================================================`);
  console.log(`[${new Date().toISOString()}] Audit Complete: ${report.summary.passed}/${report.summary.total} Passed (${report.summary.failed} Failed)`);
  console.log(`[${new Date().toISOString()}] Report saved to: handoff/reports/continuous_audit_report.json`);
  console.log(`[${new Date().toISOString()}] ========================================================`);

  return report;
}

if (require.main === module) {
  runAudit().then(report => {
    process.exit(report.summary.failed === 0 ? 0 : 1);
  }).catch(err => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
  });
}

module.exports = { runAudit };
