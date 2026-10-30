/**
 * update_chat_app_v63.js
 * Updates public/chat-app.js with:
 * 1. Google Identity Verification flow with Mobile Number
 * 2. Instant DP update on client header and strip
 * 3. 20-Minute realistic verification delay and auto-verify ticker
 * 4. Username handling
 */

const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'public', 'chat-app.js');
let code = fs.readFileSync(appFile, 'utf8');

// 1. Update currentClientVerification initialization
const oldInitTarget = "let currentClientVerification = { verified: false, photoUrl: null, verifiedAt: null };";
const newInit = `let currentClientVerification = {
  verified: false,
  status: 'none',
  photoUrl: null,
  phoneNumber: null,
  submittedAt: null,
  remainingMinutes: 0,
  verifiedAt: null
};
let verificationCountdownInterval = null;`;

if (code.includes(oldInitTarget)) {
  code = code.replace(oldInitTarget, newInit);
  console.log('✓ Updated currentClientVerification structure');
}

// 2. In loadPhotoVerificationStatus, parse enhanced verification response
const oldLoadStatusPattern = /async function loadPhotoVerificationStatus\(\) \{[\s\S]*?(?=function updatePhotoVerifyUI)/;
const newLoadStatus = `async function loadPhotoVerificationStatus() {
  if (!currentChatId) return;
  try {
    const res = await fetch(\`/api/chat/verification?chatId=\${encodeURIComponent(currentChatId)}\`);
    const data = await res.json();
    if (data.success) {
      const wasPending = currentClientVerification.status === 'pending';
      currentClientVerification = {
        verified: Boolean(data.verified),
        status: data.status || (data.verified ? 'verified' : (data.photoUrl ? 'pending' : 'none')),
        photoUrl: data.photoUrl || null,
        phoneNumber: data.phoneNumber || null,
        submittedAt: data.submittedAt || null,
        remainingMinutes: data.remainingMinutes || 0,
        verifiedAt: data.verifiedAt || null
      };

      updatePhotoVerifyUI(
        currentClientVerification.verified,
        currentClientVerification.photoUrl,
        currentClientVerification.status,
        currentClientVerification.remainingMinutes,
        currentClientVerification.phoneNumber
      );

      if (data.isRequested && !data.photoUrl) {
        showVerificationRequestedBanner();
      }

      if (wasPending && currentClientVerification.verified) {
        showToast('🎉 Google Identity Verified! Your account is officially verified.');
      }
    }
  } catch (err) {
    console.warn('loadPhotoVerificationStatus error:', err);
  }
}

`;

if (oldLoadStatusPattern.test(code)) {
  code = code.replace(oldLoadStatusPattern, newLoadStatus);
  console.log('✓ Replaced loadPhotoVerificationStatus');
}

// 3. Replace updatePhotoVerifyUI and entire verification interaction block
const oldUiSectionPattern = /function updatePhotoVerifyUI\(isVerified, photoUrl\) \{[\s\S]*?(?=function openPhotoLightbox)/;

const newUiSection = `function updatePhotoVerifyUI(isVerified, photoUrl, status, remainingMinutes, phoneNumber) {
  const toggle = document.getElementById('photoVerifyToggle');
  const title = document.getElementById('verifyTitle');
  const subtitle = document.getElementById('verifySubtitle');
  const statusBadge = document.getElementById('verifyStatusBadge');
  const placeholderIcon = document.getElementById('verifyAvatarPlaceholderIcon');
  const avatarImg = document.getElementById('verifyAvatarImg');
  const badgeCheck = document.getElementById('verifyBadgeCheck');
  const badgePending = document.getElementById('verifyBadgePending');
  const changeBtn = document.getElementById('changePhotoBtn');
  const avatarRing = document.getElementById('verifyAvatarRing');

  // Header Client DP elements
  const headerAvatarImg = document.getElementById('headerClientAvatarImg');
  const headerInitials = document.getElementById('headerClientInitials');
  const headerVerifiedBadge = document.getElementById('headerClientVerifiedBadge');
  const headerPendingBadge = document.getElementById('headerClientPendingBadge');

  if (headerInitials && currentChatId) {
    headerInitials.textContent = currentChatId.charAt(0).toUpperCase();
  }

  const effectiveStatus = status || (isVerified ? 'verified' : (photoUrl ? 'pending' : 'none'));

  // 1. INSTANT DP UPDATE (Display Picture sets immediately upon photo selection / load)
  if (photoUrl) {
    if (avatarImg) {
      avatarImg.src = photoUrl;
      avatarImg.classList.remove('hidden');
    }
    if (placeholderIcon) placeholderIcon.classList.add('hidden');
    if (headerAvatarImg) {
      headerAvatarImg.src = photoUrl;
      headerAvatarImg.classList.remove('hidden');
    }
    if (headerInitials) headerInitials.classList.add('hidden');
  } else {
    if (avatarImg) {
      avatarImg.src = '';
      avatarImg.classList.add('hidden');
    }
    if (placeholderIcon) placeholderIcon.classList.remove('hidden');
    if (headerAvatarImg) {
      headerAvatarImg.src = '';
      headerAvatarImg.classList.add('hidden');
    }
    if (headerInitials) headerInitials.classList.remove('hidden');
  }

  // 2. Verification Badges & Texts according to Status
  if (effectiveStatus === 'verified' || isVerified) {
    if (toggle) toggle.checked = true;
    if (title) title.textContent = "Google Verified Identity ✓";
    if (subtitle) {
      subtitle.textContent = phoneNumber ? \`Photo & Mobile (+91 \${phoneNumber.slice(-4).padStart(phoneNumber.length, '•')}) confirmed\` : "Identity verified via Google Security Services";
    }
    if (statusBadge) {
      statusBadge.className = 'px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-[#00D26A]/20 text-[#00D26A] border border-[#00D26A]/40 inline-flex items-center gap-1';
      statusBadge.innerHTML = '<span>Google Verified</span> <svg class="w-2.5 h-2.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      statusBadge.classList.remove('hidden');
    }
    if (changeBtn) {
      changeBtn.textContent = 'View';
      changeBtn.classList.remove('hidden');
    }
    if (badgeCheck) badgeCheck.classList.remove('hidden');
    if (badgePending) badgePending.classList.add('hidden');
    if (headerVerifiedBadge) headerVerifiedBadge.classList.remove('hidden');
    if (headerPendingBadge) headerPendingBadge.classList.add('hidden');
    if (avatarRing) {
      avatarRing.classList.remove('border-slate-600/80', 'border-amber-500');
      avatarRing.classList.add('border-[#00D26A]');
    }
  } else if (effectiveStatus === 'pending') {
    if (toggle) toggle.checked = true;
    if (title) title.textContent = "Google Verification Under Review";
    const mins = remainingMinutes || 20;
    if (subtitle) {
      subtitle.innerHTML = \`Security review in progress (<span class="text-amber-300 font-bold">~\${mins}m</span> remaining)\`;
    }
    if (statusBadge) {
      statusBadge.className = 'px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1';
      statusBadge.innerHTML = \`<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Reviewing (~\${mins}m)\`;
      statusBadge.classList.remove('hidden');
    }
    if (changeBtn) {
      changeBtn.textContent = 'Details';
      changeBtn.classList.remove('hidden');
    }
    if (badgeCheck) badgeCheck.classList.add('hidden');
    if (badgePending) badgePending.classList.remove('hidden');
    if (headerVerifiedBadge) headerVerifiedBadge.classList.add('hidden');
    if (headerPendingBadge) headerPendingBadge.classList.remove('hidden');
    if (avatarRing) {
      avatarRing.classList.remove('border-slate-600/80', 'border-[#00D26A]');
      avatarRing.classList.add('border-amber-500');
    }

    startVerificationCountdown();
  } else {
    // Unverified / None
    if (toggle) toggle.checked = false;
    if (title) title.textContent = "Google Identity Verification";
    if (subtitle) subtitle.textContent = "Verify with photo & mobile to confirm identity";
    if (statusBadge) statusBadge.classList.add('hidden');
    if (changeBtn) changeBtn.classList.add('hidden');
    if (badgeCheck) badgeCheck.classList.add('hidden');
    if (badgePending) badgePending.classList.add('hidden');
    if (headerVerifiedBadge) headerVerifiedBadge.classList.add('hidden');
    if (headerPendingBadge) headerPendingBadge.classList.add('hidden');
    if (avatarRing) {
      avatarRing.classList.remove('border-[#00D26A]', 'border-amber-500');
      avatarRing.classList.add('border-slate-600/80');
    }
  }
}

function startVerificationCountdown() {
  if (verificationCountdownInterval) return;
  verificationCountdownInterval = setInterval(() => {
    if (currentClientVerification.status === 'pending' && currentClientVerification.submittedAt) {
      const elapsed = Date.now() - currentClientVerification.submittedAt;
      const remMs = (20 * 60 * 1000) - elapsed;
      if (remMs <= 0) {
        clearInterval(verificationCountdownInterval);
        verificationCountdownInterval = null;
        loadPhotoVerificationStatus();
      } else {
        const remMin = Math.ceil(remMs / 60000);
        currentClientVerification.remainingMinutes = remMin;
        const sub = document.getElementById('verifySubtitle');
        if (sub) sub.innerHTML = \`Security review in progress (<span class="text-amber-300 font-bold">~\${remMin}m</span> remaining)\`;
        const badge = document.getElementById('verifyStatusBadge');
        if (badge) badge.innerHTML = \`<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Reviewing (~\${remMin}m)\`;
        const modalBadge = document.getElementById('modalCountdownBadge');
        if (modalBadge) modalBadge.textContent = \`~\${remMin}m left\`;
      }
    } else {
      clearInterval(verificationCountdownInterval);
      verificationCountdownInterval = null;
    }
  }, 10000);
}

function showVerificationRequestedBanner() {
  const strip = document.getElementById('photoVerifyStrip');
  if (strip) {
    strip.classList.add('ring-2', 'ring-rose-500', 'bg-rose-950/40');
    const subtitle = document.getElementById('verifySubtitle');
    if (subtitle) {
      subtitle.innerHTML = '<span class="text-rose-300 font-bold">⚠️ Raoprime requested you to add your photo & phone number</span>';
    }
  }
}

async function onPhotoVerifyToggleChange(isChecked) {
  if (isChecked) {
    openPhotoVerifyModal();
  } else {
    // User switched verification OFF
    try {
      const res = await fetch('/api/chat/verify-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, enabled: false })
      });
      currentClientVerification = { verified: false, status: 'none', photoUrl: null, phoneNumber: null, submittedAt: null, remainingMinutes: 0, verifiedAt: null };
      updatePhotoVerifyUI(false, null, 'none', 0, null);
      showToast('Photo verification disabled');
    } catch (err) {
      showToast('Error updating verification status');
    }
  }
}

function openPhotoVerifyModal() {
  const modal = document.getElementById('photoVerifyModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Username display
  const userEl = document.getElementById('modalUsernameDisplay');
  if (userEl) userEl.textContent = '@' + (currentChatId || 'client');

  // Phone input
  const phoneInput = document.getElementById('verifyPhoneInput');
  if (phoneInput && currentClientVerification.phoneNumber) {
    // Strip leading +91 or non-digits for cleaner display in input
    const clean = currentClientVerification.phoneNumber.replace(/\\D/g, '').slice(-10);
    phoneInput.value = clean;
  }

  // Previews & Status Cards
  const preview = document.getElementById('modalPhotoPreview');
  const placeholder = document.getElementById('modalPhotoPlaceholder');
  const pendingCard = document.getElementById('modalPendingStatusCard');
  const verifiedCard = document.getElementById('modalVerifiedSuccessCard');
  const phoneGroup = document.getElementById('modalPhoneGroup');
  const photoActions = document.getElementById('photoSelectActions');
  const saveBtn = document.getElementById('saveVerifyPhotoBtn');

  if (currentClientVerification.verified) {
    if (pendingCard) pendingCard.classList.add('hidden');
    if (verifiedCard) {
      verifiedCard.classList.remove('hidden');
      const det = document.getElementById('modalVerifiedDetails');
      if (det) det.textContent = currentClientVerification.phoneNumber ? \`Verified Mobile: +91 \${currentClientVerification.phoneNumber.slice(-10)}\` : 'Google Verified Identity';
    }
    if (saveBtn) {
      saveBtn.textContent = 'Verified with Google ✓';
      saveBtn.disabled = true;
      saveBtn.classList.remove('bg-[#00D26A]');
      saveBtn.classList.add('bg-emerald-700');
    }
  } else if (currentClientVerification.status === 'pending') {
    if (pendingCard) {
      pendingCard.classList.remove('hidden');
      const mb = document.getElementById('modalCountdownBadge');
      if (mb) mb.textContent = \`~\${currentClientVerification.remainingMinutes || 20}m left\`;
    }
    if (verifiedCard) verifiedCard.classList.add('hidden');
    if (saveBtn) {
      saveBtn.textContent = 'Update Verification';
      saveBtn.disabled = false;
    }
  } else {
    if (pendingCard) pendingCard.classList.add('hidden');
    if (verifiedCard) verifiedCard.classList.add('hidden');
    if (saveBtn) {
      saveBtn.textContent = 'Verify with Google';
      saveBtn.disabled = true;
    }
  }

  if (currentClientVerification.photoUrl) {
    if (preview) {
      preview.src = currentClientVerification.photoUrl;
      preview.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
  }

  validateVerificationForm();
}

function validateVerificationForm() {
  const phoneInput = document.getElementById('verifyPhoneInput');
  const phoneVal = phoneInput ? phoneInput.value.replace(/\\D/g, '') : '';
  const isPhoneValid = phoneVal.length === 10;

  const hasPhoto = Boolean(pendingVerifiedPhotoBase64 || currentClientVerification.photoUrl);
  const saveBtn = document.getElementById('saveVerifyPhotoBtn');

  if (saveBtn && !currentClientVerification.verified) {
    saveBtn.disabled = !(isPhoneValid && hasPhoto);
  }
}

function closePhotoVerifyModal() {
  stopModalCamera();
  const modal = document.getElementById('photoVerifyModal');
  if (modal) modal.classList.add('hidden');

  if (!currentClientVerification.verified && currentClientVerification.status !== 'pending') {
    const toggle = document.getElementById('photoVerifyToggle');
    if (toggle) toggle.checked = false;
  }
}

async function startModalCamera() {
  const video = document.getElementById('modalCameraStream');
  const preview = document.getElementById('modalPhotoPreview');
  const placeholder = document.getElementById('modalPhotoPlaceholder');
  const cameraControls = document.getElementById('cameraControls');
  const photoSelectActions = document.getElementById('photoSelectActions');

  try {
    modalCameraMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false
    });
    if (video) {
      video.srcObject = modalCameraMediaStream;
      video.classList.remove('hidden');
      if (preview) preview.classList.add('hidden');
      if (placeholder) placeholder.classList.add('hidden');
    }
    if (cameraControls) cameraControls.classList.remove('hidden');
    if (photoSelectActions) photoSelectActions.classList.add('hidden');
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err);
    showToast('Camera unavailable. Please upload a photo from files.');
  }
}

function stopModalCamera() {
  if (modalCameraMediaStream) {
    modalCameraMediaStream.getTracks().forEach(t => t.stop());
    modalCameraMediaStream = null;
  }
  const video = document.getElementById('modalCameraStream');
  if (video) {
    video.srcObject = null;
    video.classList.add('hidden');
  }
  const cameraControls = document.getElementById('cameraControls');
  const photoSelectActions = document.getElementById('photoSelectActions');
  if (cameraControls) cameraControls.classList.add('hidden');
  if (photoSelectActions) photoSelectActions.classList.remove('hidden');
}

function captureModalPhoto() {
  const video = document.getElementById('modalCameraStream');
  if (!video) return;

  const canvas = document.createElement('canvas');
  const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  const sx = ((video.videoWidth || 480) - size) / 2;
  const sy = ((video.videoHeight || 480) - size) / 2;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 400, 400);

  const base64 = canvas.toDataURL('image/jpeg', 0.88);
  pendingVerifiedPhotoBase64 = base64;

  stopModalCamera();

  const preview = document.getElementById('modalPhotoPreview');
  const placeholder = document.getElementById('modalPhotoPlaceholder');

  if (preview) {
    preview.src = base64;
    preview.classList.remove('hidden');
  }
  if (placeholder) placeholder.classList.add('hidden');

  validateVerificationForm();
}

function handlePhotoFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
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
      pendingVerifiedPhotoBase64 = base64;

      const preview = document.getElementById('modalPhotoPreview');
      const placeholder = document.getElementById('modalPhotoPlaceholder');

      if (preview) {
        preview.src = base64;
        preview.classList.remove('hidden');
      }
      if (placeholder) placeholder.classList.add('hidden');

      validateVerificationForm();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitPhotoVerification() {
  const phoneInput = document.getElementById('verifyPhoneInput');
  const cleanPhone = phoneInput ? phoneInput.value.replace(/\\D/g, '') : '';
  if (cleanPhone.length !== 10) {
    showToast('Please enter a valid 10-digit mobile number');
    if (phoneInput) phoneInput.focus();
    return;
  }

  if (!pendingVerifiedPhotoBase64 && (!currentClientVerification.photoUrl)) {
    showToast('Please take or upload a profile photo');
    return;
  }

  const saveBtn = document.getElementById('saveVerifyPhotoBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Submitting...';
  }

  try {
    const res = await fetch('/api/chat/verify-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId,
        photoData: pendingVerifiedPhotoBase64 || currentClientVerification.photoUrl,
        phoneNumber: cleanPhone,
        enabled: true
      })
    });
    const data = await res.json();
    if (data.success) {
      currentClientVerification = {
        verified: false,
        status: 'pending',
        photoUrl: data.photoUrl,
        phoneNumber: cleanPhone,
        submittedAt: data.submittedAt || Date.now(),
        remainingMinutes: 20
      };

      // Set DP immediately on client header & verification strip!
      updatePhotoVerifyUI(false, data.photoUrl, 'pending', 20, cleanPhone);
      closePhotoVerifyModal();

      showToast('🚀 Submitted for Google Verification! Security review in progress (~20 mins).');

      const strip = document.getElementById('photoVerifyStrip');
      if (strip) strip.classList.remove('ring-2', 'ring-rose-500', 'bg-rose-950/40');
    } else {
      showToast('Failed to submit verification: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    showToast('Network error during verification upload');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Verify with Google';
    }
  }
}

`;

if (oldUiSectionPattern.test(code)) {
  code = code.replace(oldUiSectionPattern, newUiSection);
  console.log('✓ Replaced updatePhotoVerifyUI and modal interaction functions');
} else {
  console.log('⚠ Could not match oldUiSectionPattern');
}

// 4. Update WebSocket listener for chat:verification-updated
const wsListenerPattern = /case 'chat:verification-updated':[\s\S]*?break;/;
const newWsListener = `case 'chat:verification-updated':
      if (payload && payload.chatId === currentChatId) {
        const wasPending = currentClientVerification.status === 'pending';
        currentClientVerification = {
          verified: Boolean(payload.verified),
          status: payload.status || (payload.verified ? 'verified' : (payload.photoUrl ? 'pending' : 'none')),
          photoUrl: payload.photoUrl || null,
          phoneNumber: payload.phoneNumber || null,
          submittedAt: payload.submittedAt || currentClientVerification.submittedAt,
          remainingMinutes: payload.remainingMinutes || 0,
          verifiedAt: payload.verifiedAt || null
        };
        updatePhotoVerifyUI(
          currentClientVerification.verified,
          currentClientVerification.photoUrl,
          currentClientVerification.status,
          currentClientVerification.remainingMinutes,
          currentClientVerification.phoneNumber
        );
        if (wasPending && currentClientVerification.verified) {
          showToast('🎉 Google Identity Verified! Your account is officially verified.');
        }
      }
      break;`;

if (wsListenerPattern.test(code)) {
  code = code.replace(wsListenerPattern, newWsListener);
  console.log('✓ Updated chat:verification-updated WebSocket listener');
}

// 5. In loadMessages, parse data.verification if returned
const loadMsgsTarget = 'if (data.success && Array.isArray(data.messages)) {';
if (code.includes(loadMsgsTarget) && !code.includes('if (data.verification) {')) {
  const enhancedLoadMsgs = `if (data.success && Array.isArray(data.messages)) {
      if (data.verification) {
        const wasPending = currentClientVerification.status === 'pending';
        currentClientVerification = {
          verified: Boolean(data.verification.verified),
          status: data.verification.status || (data.verification.verified ? 'verified' : (data.verification.photoUrl ? 'pending' : 'none')),
          photoUrl: data.verification.photoUrl || null,
          phoneNumber: data.verification.phoneNumber || null,
          submittedAt: data.verification.submittedAt || null,
          remainingMinutes: data.verification.remainingMinutes || 0,
          verifiedAt: data.verification.verifiedAt || null
        };
        updatePhotoVerifyUI(
          currentClientVerification.verified,
          currentClientVerification.photoUrl,
          currentClientVerification.status,
          currentClientVerification.remainingMinutes,
          currentClientVerification.phoneNumber
        );
        if (wasPending && currentClientVerification.verified) {
          showToast('🎉 Google Identity Verified! Your account is officially verified.');
        }
      }`;
  code = code.replace(loadMsgsTarget, enhancedLoadMsgs);
  console.log('✓ Injected verification handler into loadMessages');
}

// 6. In saveClientName, handle username prompt & display
const saveClientTarget = 'function saveClientName() {';
if (code.includes(saveClientTarget)) {
  const saveClientPattern = /function saveClientName\(\) \{[\s\S]*?(?=function copyClientChatLink)/;
  const newSaveClient = `function saveClientName() {
  const input = document.getElementById('clientNameInput');
  const name = (input.value || '').trim();
  if (!name) {
    showToast('Please enter a username to continue');
    return;
  }

  currentChatId = name;
  localStorage.setItem('raoprime_client', name);
  document.getElementById('chatHeading').textContent = 'Raoprime';
  document.getElementById('nameModal').classList.add('hidden');
  
  // Set header initials
  const headerInitials = document.getElementById('headerClientInitials');
  if (headerInitials) headerInitials.textContent = name.charAt(0).toUpperCase();

  if ('Notification' in window && Notification.permission === 'default') {
    requestNotificationPermission().catch(() => {});
  }
  
  // Set in URL cleanly without reload
  const newUrl = \`\${window.location.pathname}?chat=\${encodeURIComponent(name)}\`;
  window.history.replaceState(null, '', newUrl);

  showToast(\`Welcome, @\${name}!\`);
  loadMessages();
  loadPhotoVerificationStatus();
}

`;
  if (saveClientPattern.test(code)) {
    code = code.replace(saveClientPattern, newSaveClient);
    console.log('✓ Updated saveClientName with username handling');
  }
}

fs.writeFileSync(appFile, code, 'utf8');
console.log('Updated public/chat-app.js successfully!');
