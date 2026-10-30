/**
 * update_index_html_v63.js
 * Updates public/index.html with:
 * 1. Username modal (renamed from Name)
 * 2. Header client DP badge
 * 3. Google Identity Verification modal & strip
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Rename Name Setup Modal to Username Setup Modal
const oldNameModalPattern = /<!-- Client Name Setup Modal -->[\s\S]*?<!-- Ultra-Luxury VIP Incoming Call Screen/;
const newUsernameModal = `<!-- Client Username Setup Modal -->
  <div id="nameModal" class="fixed inset-0 bg-black/85 backdrop-blur-md z-50 hidden flex items-center justify-center p-4">
    <div class="bg-[#0e1118] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
      <img src="/assets/rp-logo.jpg" alt="Raoprime" class="w-16 h-16 rounded-full mx-auto object-cover border-2 border-rose-800 shadow-lg ring-2 ring-black">
      <div class="space-y-1">
        <h3 class="font-extrabold text-base text-white">Welcome to Raoprime</h3>
        <p class="text-xs text-slate-400">Please enter your username to continue</p>
      </div>
      <input type="text" id="clientNameInput" placeholder="Choose a Username" class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white focus:border-rose-500 text-center font-medium" onkeydown="if(event.key==='Enter') saveClientName()">
      <button onclick="saveClientName()" class="w-full py-3 rounded-xl maroon-btn text-white font-bold text-sm transition-all cursor-pointer active:scale-95">
        Start Chat
      </button>
    </div>
  </div>

  <!-- Ultra-Luxury VIP Incoming Call Screen`;

if (oldNameModalPattern.test(html)) {
  html = html.replace(oldNameModalPattern, newUsernameModal);
  console.log('✓ Updated nameModal to Username modal');
} else {
  console.log('⚠ Could not match oldNameModalPattern');
}

// 2. Add Client DP Badge to Top Header (right before </header>)
const headerTarget = `<!-- Share / Invite Link Button -->
      <button onclick="copyClientChatLink()" id="shareLinkBtn"`;

const clientHeaderDp = `<!-- Client Profile / DP Badge (Instant DP & Google Verification) -->
      <div id="headerClientProfileBtn" onclick="openPhotoVerifyModal()" class="relative shrink-0 cursor-pointer group" title="Your Profile & Google Verification">
        <div id="headerClientAvatarRing" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-800 border-2 border-slate-700/80 group-hover:border-rose-500/60 flex items-center justify-center overflow-hidden transition-all group-hover:scale-105 shadow-sm">
          <span id="headerClientInitials" class="text-xs font-bold text-slate-300 uppercase">U</span>
          <img id="headerClientAvatarImg" src="" alt="Client DP" class="w-full h-full object-cover hidden">
        </div>
        <span id="headerClientVerifiedBadge" class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#00D26A] border-2 border-[#0a0c12] text-white flex items-center justify-center text-[7px] font-extrabold hidden shadow-sm">✓</span>
        <span id="headerClientPendingBadge" class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-[#0a0c12] text-black flex items-center justify-center text-[7px] font-extrabold hidden shadow-sm">⏳</span>
      </div>

      <!-- Share / Invite Link Button -->
      <button onclick="copyClientChatLink()" id="shareLinkBtn"`;

if (!html.includes('headerClientProfileBtn') && html.includes(headerTarget)) {
  html = html.replace(headerTarget, clientHeaderDp);
  console.log('✓ Added Client DP badge to top header');
}

// 3. Update Verification Strip with Google Trust Styling
const oldStripPattern = /<!-- Client Identity Photo Verification Strip with Interactive Toggle Switch -->[\s\S]*?<!-- Middle Chat Messages Stream/;
const newStrip = `<!-- Client Identity Photo Verification Strip with Interactive Toggle Switch -->
  <div id="photoVerifyStrip" class="w-full bg-[#0b0e17]/95 border-b border-white/[0.08] px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs z-15 backdrop-blur-xl shadow-md transition-all select-none">
    <div class="flex items-center gap-3 min-w-0">
      <!-- Avatar Preview / DP with Google Badge -->
      <div onclick="openPhotoVerifyModal()" class="relative shrink-0 cursor-pointer group" title="Click to view or verify identity">
        <div id="verifyAvatarRing" class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#161a27] to-[#202738] border-2 border-slate-600/80 flex items-center justify-center text-slate-300 overflow-hidden shadow-md group-hover:scale-105 transition-transform">
          <svg id="verifyAvatarPlaceholderIcon" class="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:text-rose-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <img id="verifyAvatarImg" src="" alt="Verified DP" class="w-full h-full object-cover hidden">
        </div>
        <!-- Emerald Verified Checkmark Badge -->
        <span id="verifyBadgeCheck" class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#00D26A] border-2 border-[#0a0c12] text-white flex items-center justify-center hidden shadow-sm">
          <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <!-- Amber Pending Clock Badge -->
        <span id="verifyBadgePending" class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 border-2 border-[#0a0c12] text-black flex items-center justify-center text-[8px] font-black hidden shadow-sm">⏳</span>
      </div>

      <!-- Text / Google Verification Status -->
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <!-- Google 'G' mini icon -->
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span id="verifyTitle" class="font-extrabold text-white text-[12.5px] truncate">Google Identity Verification</span>
          <span id="verifyStatusBadge" class="hidden px-2 py-0.2 rounded-full text-[9.5px] font-bold"></span>
        </div>
        <p id="verifySubtitle" class="text-[11px] text-slate-400 truncate">Verify with your photo & mobile number to unlock verified status</p>
      </div>
    </div>

    <!-- Right: Change Photo button + Toggle Switch -->
    <div class="flex items-center gap-2.5 sm:gap-3 shrink-0">
      <button type="button" id="changePhotoBtn" onclick="openPhotoVerifyModal()" class="hidden px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 active:scale-95 text-slate-200 text-[11px] font-semibold transition-all cursor-pointer">
        View
      </button>

      <!-- The Toggle Switch -->
      <label class="inline-flex items-center cursor-pointer select-none" title="Toggle photo verification">
        <input type="checkbox" id="photoVerifyToggle" onchange="onPhotoVerifyToggleChange(this.checked)" class="sr-only peer">
        <div class="relative w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00D26A] shadow-inner transition-colors"></div>
      </label>
    </div>
  </div>

  <!-- Middle Chat Messages Stream`;

if (oldStripPattern.test(html)) {
  html = html.replace(oldStripPattern, newStrip);
  console.log('✓ Updated verification strip with Google Trust elements');
} else {
  console.log('⚠ Could not match oldStripPattern');
}

// 4. Replace photoVerifyModal with Google Identity Verification Modal (with Mobile No.)
const oldModalPattern = /<!-- Photo Verification Modal \(Take Selfie or Upload Photo\) -->[\s\S]*?<!-- Photo Full Preview Lightbox Modal -->/;
const newGoogleModal = `<!-- Google Identity Verification Modal (Photo DP + Mobile Number + 20-Min Review) -->
  <div id="photoVerifyModal" class="fixed inset-0 bg-black/85 backdrop-blur-md z-50 hidden flex items-center justify-center p-4">
    <div class="w-full max-w-sm p-6 rounded-3xl bg-[#0c0e16] border border-white/10 shadow-2xl text-center space-y-4 relative animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
      
      <!-- Close Button -->
      <button type="button" onclick="closePhotoVerifyModal()" class="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Google Official Branding Icon -->
      <div class="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto shadow-inner">
        <svg class="w-7 h-7" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
        </svg>
      </div>

      <div class="space-y-1">
        <h3 id="modalHeadingTitle" class="font-extrabold text-base sm:text-lg text-white">Google Identity Verification</h3>
        <p id="modalHeadingDesc" class="text-xs text-slate-400 leading-relaxed">Add your profile photo & mobile number. Security review completes automatically in ~20 minutes.</p>
      </div>

      <!-- Current Username Display -->
      <div class="flex items-center justify-between px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs">
        <span class="text-slate-400">Username:</span>
        <span id="modalUsernameDisplay" class="font-bold text-white font-mono">@client</span>
      </div>

      <!-- Mobile Number Input Field -->
      <div id="modalPhoneGroup" class="space-y-1 text-left">
        <label class="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span>Mobile Number</span>
          <span class="text-[10px] text-amber-400 font-medium">*Required</span>
        </label>
        <div class="relative flex items-center">
          <div class="absolute left-3 flex items-center gap-1 text-xs text-slate-300 font-semibold select-none pointer-events-none">
            <span>🇮🇳</span>
            <span>+91</span>
          </div>
          <input type="tel" id="verifyPhoneInput" maxlength="10" placeholder="10-digit mobile number" class="w-full pl-16 pr-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-rose-500 font-mono tracking-wider" oninput="validateVerificationForm()">
        </div>
      </div>

      <!-- Photo Preview / Placeholder Area -->
      <div class="relative w-28 h-28 mx-auto rounded-full bg-[#151926] border-2 border-dashed border-rose-500/40 overflow-hidden flex items-center justify-center group shadow-xl">
        <img id="modalPhotoPreview" src="" alt="Photo Preview" class="w-full h-full object-cover hidden">
        <div id="modalPhotoPlaceholder" class="flex flex-col items-center justify-center text-slate-400 text-xs p-2">
          <svg class="w-7 h-7 text-slate-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
          <span class="text-[10px] text-slate-400 font-medium">Add Photo / DP</span>
        </div>
        <!-- Live Camera Stream (if user opens selfie cam) -->
        <video id="modalCameraStream" autoplay playsinline class="w-full h-full object-cover hidden"></video>
      </div>

      <!-- Action Buttons for Camera / File Pick -->
      <div id="photoSelectActions" class="grid grid-cols-2 gap-2 pt-0.5">
        <!-- Take Selfie with Camera -->
        <button type="button" onclick="startModalCamera()" id="btnStartCam" class="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/10 active:scale-95 cursor-pointer">
          <svg class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Take Selfie</span>
        </button>

        <!-- Choose from Gallery / Files -->
        <label class="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/10 active:scale-95 cursor-pointer">
          <svg class="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <span>Upload DP</span>
          <input type="file" id="photoFileInput" accept="image/*" class="hidden" onchange="handlePhotoFileSelected(event)">
        </label>
      </div>

      <!-- Live Camera Capture & Switch Controls -->
      <div id="cameraControls" class="hidden flex items-center justify-center gap-2 pt-1">
        <button type="button" onclick="captureModalPhoto()" class="py-2 px-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 flex items-center gap-1.5 cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Capture Photo</span>
        </button>
        <button type="button" onclick="stopModalCamera()" class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 text-xs transition-all active:scale-95 cursor-pointer" title="Cancel Camera">
          ✕
        </button>
      </div>

      <!-- Pending Status Card (Shows while 20-min review is ticking) -->
      <div id="modalPendingStatusCard" class="hidden p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            Review in Progress
          </span>
          <span id="modalCountdownBadge" class="text-[11px] font-mono font-bold text-amber-200 bg-amber-950/60 px-2 py-0.5 rounded-full">~20m left</span>
        </div>
        <p class="text-[11px] text-amber-200/80 leading-relaxed">
          Your photo has been set as your DP! Google Security is reviewing your credentials. Verified badge activates automatically in 20 minutes.
        </p>
      </div>

      <!-- Verified Success Card (Shows once verified) -->
      <div id="modalVerifiedSuccessCard" class="hidden p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-1">
        <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <svg class="w-4 h-4 text-[#00D26A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Google Verified Account</span>
        </div>
        <p id="modalVerifiedDetails" class="text-[11px] text-emerald-200/80 font-mono">Photo & Mobile Number Confirmed</p>
      </div>

      <!-- Save & Confirm Button -->
      <div class="pt-2 flex items-center gap-2">
        <button type="button" onclick="closePhotoVerifyModal()" class="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-semibold text-xs transition-all active:scale-95 cursor-pointer">
          Close
        </button>
        <button type="button" onclick="submitPhotoVerification()" id="saveVerifyPhotoBtn" class="flex-1 py-2.5 rounded-xl bg-[#00D26A] hover:bg-[#00ba5e] text-black font-extrabold text-xs transition-all active:scale-95 shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" disabled>
          Verify with Google
        </button>
      </div>

    </div>
  </div>

  <!-- Photo Full Preview Lightbox Modal -->`;

if (oldModalPattern.test(html)) {
  html = html.replace(oldModalPattern, newGoogleModal);
  console.log('✓ Replaced photoVerifyModal with Google Identity Verification modal');
} else {
  console.log('⚠ Could not match oldModalPattern');
}

// Bump version in script tags to v=6.3
html = html.replace(/chat-app\.js\?v=[\d.]+/g, 'chat-app.js?v=6.3');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Updated public/index.html successfully!');
