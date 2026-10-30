/**
 * update_chat_app_v70.js
 * Installs Google Identity Services & Dedicated Client Profile Module into public/chat-app.js
 */

const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'public', 'chat-app.js');
let code = fs.readFileSync(appFile, 'utf8');

// 1. Target the old verification section in chat-app.js
// From "let currentClientVerification" up to "function openPhotoLightbox"
const verStart = code.indexOf('let currentClientVerification');
const verEnd = code.indexOf('function openPhotoLightbox');

if (verStart === -1 || verEnd === -1) {
  console.error('Could not find verification section bounds in chat-app.js');
  process.exit(1);
}

const newVerificationSection = `// ──────────────────────────────────────────────────────────────
// Dedicated Client Profile Section & Authentic Google Identity Verification
// Google Client ID: 231998089859-0hm2e9hfetjku8qomjfoj2megb8jldsg.apps.googleusercontent.com
// ──────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = '231998089859-0hm2e9hfetjku8qomjfoj2megb8jldsg.apps.googleusercontent.com';

let currentClientVerification = {
  verified: false,
  status: 'none',
  provider: 'none',
  photoUrl: null,
  email: null,
  name: null,
  phoneNumber: null,
  verifiedAt: null
};

// Initialize Google Identity Services (GSI)
function initGoogleIdentityServices() {
  if (typeof window === 'undefined') return;
  if (window.google && window.google.accounts && window.google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });
      renderGoogleButtons();
    } catch (err) {
      console.warn('Google GSI init notice:', err);
    }
  } else {
    // Retry shortly if GSI script is still downloading
    setTimeout(initGoogleIdentityServices, 600);
  }
}

function renderGoogleButtons() {
  if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
  const container = document.getElementById('googleGsiButtonContainer');
  if (container) {
    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 260
    });
  }
}

// Decode Google JWT ID Token (contains user profile, email & picture)
function decodeGoogleJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode Google JWT token:', e);
    return null;
  }
}

// Handle authentic Google Sign-In response
async function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) return;
  const payload = decodeGoogleJwt(response.credential);
  if (!payload || !payload.email) {
    showToast('Google authentication failed. Please try again.');
    return;
  }

  showToast('Authenticating with Google...');

  try {
    const res = await fetch('/api/chat/verify-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        profile: {
          name: payload.name || currentChatId,
          email: payload.email,
          picture: payload.picture,
          sub: payload.sub
        }
      })
    });
    const data = await res.json();
    if (data.success) {
      currentClientVerification = {
        verified: true,
        status: 'verified',
        provider: 'google',
        photoUrl: data.photoUrl,
        email: data.email,
        name: data.name,
        phoneNumber: null,
        verifiedAt: data.verifiedAt
      };

      updateClientProfileHeaderUI();
      openClientProfileModal(); // Refresh modal to show verified card
      showToast(\`🎉 Google Verified as \${data.email}\`);
    } else {
      showToast('Verification error: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error during Google verification');
  }
}

// Load verification status from backend
async function loadPhotoVerificationStatus() {
  if (!currentChatId) return;
  try {
    const res = await fetch(\`/api/chat/verification?chatId=\${encodeURIComponent(currentChatId)}\`);
    const data = await res.json();
    if (data.success) {
      currentClientVerification = {
        verified: Boolean(data.verified),
        status: data.status || (data.verified ? 'verified' : (data.photoUrl ? 'pending' : 'none')),
        provider: data.provider || 'custom',
        photoUrl: data.photoUrl || null,
        email: data.email || null,
        name: data.name || null,
        phoneNumber: data.phoneNumber || null,
        verifiedAt: data.verifiedAt || null
      };

      updateClientProfileHeaderUI();
    }
  } catch (err) {
    console.warn('loadPhotoVerificationStatus error:', err);
  }
}

// Sync Client Profile Header UI (DP, Name, Verified Badge)
function updateClientProfileHeaderUI() {
  const headerName = document.getElementById('headerProfileName');
  const headerInitial = document.getElementById('headerProfileInitial');
  const headerImg = document.getElementById('headerProfileImg');
  const headerBadge = document.getElementById('headerProfileVerifiedBadge');
  const headerStatus = document.getElementById('headerProfileStatusText');
  const welcomeCard = document.getElementById('welcomeGoogleVerifyCard');

  if (headerName) {
    headerName.textContent = '@' + (currentChatId || 'User');
  }

  const initialChar = (currentChatId || 'C').charAt(0).toUpperCase();
  if (headerInitial) {
    headerInitial.textContent = initialChar;
  }

  // Display Picture (Google Avatar or Custom Upload)
  if (currentClientVerification.photoUrl) {
    if (headerImg) {
      headerImg.src = currentClientVerification.photoUrl;
      headerImg.classList.remove('hidden');
    }
    if (headerInitial) headerInitial.classList.add('hidden');
  } else {
    if (headerImg) {
      headerImg.src = '';
      headerImg.classList.add('hidden');
    }
    if (headerInitial) headerInitial.classList.remove('hidden');
  }

  // Google Verified Badge
  if (currentClientVerification.verified) {
    if (headerBadge) headerBadge.classList.remove('hidden');
    if (headerStatus) {
      headerStatus.textContent = 'Verified ✓';
      headerStatus.className = 'text-[9.5px] text-[#00D26A] font-bold truncate';
    }
    if (welcomeCard) welcomeCard.classList.add('hidden');
  } else {
    if (headerBadge) headerBadge.classList.add('hidden');
    if (headerStatus) {
      headerStatus.textContent = 'Verify';
      headerStatus.className = 'text-[9.5px] text-amber-400 font-medium truncate';
    }
    if (welcomeCard) welcomeCard.classList.remove('hidden');
  }
}

// Open Dedicated Client Profile Modal
function openClientProfileModal() {
  const modal = document.getElementById('clientProfileModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Username
  const userText = document.getElementById('modalUsernameText');
  if (userText) userText.textContent = '@' + (currentChatId || 'client');

  // Avatar
  const initialEl = document.getElementById('modalProfileInitial');
  const imgEl = document.getElementById('modalProfileImg');
  const checkEl = document.getElementById('modalProfileVerifiedCheck');
  const ringEl = document.getElementById('modalProfileRing');

  const initialChar = (currentChatId || 'C').charAt(0).toUpperCase();
  if (initialEl) initialEl.textContent = initialChar;

  if (currentClientVerification.photoUrl) {
    if (imgEl) {
      imgEl.src = currentClientVerification.photoUrl;
      imgEl.classList.remove('hidden');
    }
    if (initialEl) initialEl.classList.add('hidden');
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.classList.add('hidden');
    }
    if (initialEl) initialEl.classList.remove('hidden');
  }

  // Google Verification Card
  const verifiedCard = document.getElementById('modalGoogleVerifiedCard');
  const unverifiedCard = document.getElementById('modalGoogleUnverifiedCard');
  const emailText = document.getElementById('modalGoogleEmailText');

  if (currentClientVerification.verified) {
    if (checkEl) checkEl.classList.remove('hidden');
    if (ringEl) {
      ringEl.classList.remove('border-slate-700');
      ringEl.classList.add('border-[#00D26A]', 'shadow-emerald-950/50');
    }
    if (verifiedCard) verifiedCard.classList.remove('hidden');
    if (unverifiedCard) unverifiedCard.classList.add('hidden');
    if (emailText) emailText.textContent = currentClientVerification.email || 'Google Verified Identity';
  } else {
    if (checkEl) checkEl.classList.add('hidden');
    if (ringEl) {
      ringEl.classList.remove('border-[#00D26A]', 'shadow-emerald-950/50');
      ringEl.classList.add('border-slate-700');
    }
    if (verifiedCard) verifiedCard.classList.add('hidden');
    if (unverifiedCard) {
      unverifiedCard.classList.remove('hidden');
      renderGoogleButtons();
    }
  }

  // Notification Toggle Preference
  const notifToggle = document.getElementById('profileNotifToggle');
  if (notifToggle && 'Notification' in window) {
    notifToggle.checked = Notification.permission === 'granted';
  }
}

function closeClientProfileModal() {
  const modal = document.getElementById('clientProfileModal');
  if (modal) modal.classList.add('hidden');
}

// Quick edit username from Profile
function promptEditUsername() {
  const newName = prompt('Enter your new username:', currentChatId);
  if (newName && newName.trim() && newName.trim() !== currentChatId) {
    const clean = newName.trim();
    currentChatId = clean;
    localStorage.setItem('raoprime_client', clean);
    
    // Update URL cleanly
    const newUrl = \`\${window.location.pathname}?chat=\${encodeURIComponent(clean)}\`;
    window.history.replaceState(null, '', newUrl);

    updateClientProfileHeaderUI();
    openClientProfileModal();
    showToast(\`Username updated to @\${clean}\`);
    loadMessages();
    loadPhotoVerificationStatus();
  }
}

// Custom Photo Upload (File or Camera)
function handleCustomPhotoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      const maxDim = 480;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.88);

      showToast('Uploading profile picture...');
      try {
        const res = await fetch('/api/chat/verify-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: currentChatId,
            photoData: base64,
            enabled: true
          })
        });
        const data = await res.json();
        if (data.success) {
          currentClientVerification.photoUrl = data.photoUrl;
          updateClientProfileHeaderUI();
          openClientProfileModal();
          showToast('✓ Profile picture updated!');
        } else {
          showToast('Failed to update picture: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        showToast('Network error uploading picture');
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

// Notification Toggle inside Profile
async function handleProfileNotifToggle(isChecked) {
  if (isChecked) {
    await requestNotificationPermission();
  }
}

`;

code = code.substring(0, verStart) + newVerificationSection + code.substring(verEnd);
console.log('✓ Injected new Google verification & profile section into chat-app.js');

// 2. In WebSocket listener, handle chat:verification-updated
const wsTarget = /case 'chat:verification-updated':\s*\{[\s\S]*?break;\s*\}/;
const newWsHandler = `case 'chat:verification-updated': {
      if (payload && payload.chatId === currentChatId) {
        currentClientVerification = {
          verified: Boolean(payload.verified),
          status: payload.status || (payload.verified ? 'verified' : (payload.photoUrl ? 'pending' : 'none')),
          provider: payload.provider || currentClientVerification.provider || 'custom',
          photoUrl: payload.photoUrl || currentClientVerification.photoUrl,
          email: payload.email || currentClientVerification.email,
          name: payload.name || currentClientVerification.name,
          phoneNumber: payload.phoneNumber || currentClientVerification.phoneNumber,
          verifiedAt: payload.verifiedAt || currentClientVerification.verifiedAt
        };
        updateClientProfileHeaderUI();
      }
      break;
    }`;

if (wsTarget.test(code)) {
  code = code.replace(wsTarget, newWsHandler);
  console.log('✓ Updated chat:verification-updated in WebSocket listener');
}

// 3. In DOMContentLoaded, call initGoogleIdentityServices()
const domInitTarget = 'initServiceWorkerAndNotifications();';
const domInitReplacement = `initServiceWorkerAndNotifications();
  initGoogleIdentityServices();`;

if (code.includes(domInitTarget) && !code.includes('initGoogleIdentityServices();')) {
  code = code.replace(domInitTarget, domInitReplacement);
  console.log('✓ Added initGoogleIdentityServices() to DOMContentLoaded');
}

fs.writeFileSync(appFile, code, 'utf8');
console.log('chat-app.js updated successfully (v=7.0)!');
