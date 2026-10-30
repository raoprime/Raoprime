# Raoprime Client Portal & Admin Console — Complete Claude Handoff Package

**Project Name:** Raoprime Client Document Portal & Messaging Suite  
**Version:** 2.4.0 (Production Institutional Release)  
**Live Production URL:** [https://raoprime.onrender.com](https://raoprime.onrender.com)  
**Local Development URL:** [http://localhost:4000](http://localhost:4000)  
**GitHub Repository:** `raoprime/Raoprime` (Branch: `main`)  
**User Support Email:** `raoprime.music@gmail.com`  

---

## 1. System Architecture & Tech Stack

### Core Technologies
- **Backend:** Node.js, Express.js (`server.js`)
- **Real-Time Communication:** Native WebSocket (`ws` engine) with bidirectional room routing and broadcast fallback
- **Authentication:** Official Google OAuth 2.0 Authorization Code Grant (`accounts.google.com`) + HMAC tokenized admin session gate
- **Storage Layer:** Dual-layer persistence:
  - Primary Local JSON DB: `storage/messages.json`, `storage/verifications.json`, `storage/client_intel.json`, `storage/audit_log.json`
  - Cloud Replication: Firebase Admin SDK / Firestore (`firebase-key.json`)
- **Frontend:** Vanilla ES6+ JavaScript (`public/chat-app.js`, `public/admin.js`), Tailwind CSS, Custom SVG asset system

### Key Security Standard: Immutable Identity & Zero Fake Logic
1. **Immutable Handle:** Every authenticated client's permanent username is derived strictly from their Google email prefix (`email.split('@')[0]`). It cannot be spoofed, edited, or modified by any user or administrator.
2. **Zero Fake Features:** All artificial delay timers, simulated encryption countdowns, and non-existent security claims have been permanently purged. Profile updates and OAuth authentications occur instantaneously and verifiably.
3. **Admin Fortress:** The `/admin` route is sealed behind an institutional cryptographic vault gate (`#loginGateway`) with brute-force rate-limiting and session cookies.

---

## 2. Route & State Directory

| Route / View | Access | Description |
|---|---|---|
| `/?chat=<username>` | Client Public | Client messaging interface, real-time message stream, file dropzone, voice recording, image lightbox |
| `/?chat=<username>` Modal: Profile | Client Auth | Apple/Telegram grade My Profile drawer (`#clientProfileModal`) with Google Sign-In and permanent username |
| `/?chat=<username>` Modal: Info | Client Public | Raoprime institutional brand details and document transmission guidelines (`#profileModal`) |
| `/admin` | Admin Vault | Security login gateway (`#loginGateway`) with master password authentication (`rdmy`) |
| `/admin` Dashboard | Admin Authenticated | Real-time multi-client inbox, live conversation viewer, telemetry inspect drawer, photo verification modal |
| `/api/auth/google` | Public Redirect | Initiates Google OAuth 2.0 Web redirect with valid client ID, redirect URI, and scope |
| `/api/auth/google/callback` | OAuth Callback | Exchanges authorization code for Google ID token, extracts verified profile, sets permanent username |
| `/api/auth/google/config` | Public JSON | Exposes official public Google Client ID for client-side SDK initialization |

---

## 3. Brand Design System & Visual Tokens

- **Signature Luxury Velvet Maroon:**
  - Dark Maroon (Deep base): `#3e0a14`
  - Primary Maroon (Vibrant accent): `#741728`
  - Gradient definition: `linear-gradient(135deg, #741728 0%, #3e0a14 100%)`
  - Applied to: Outgoing message bubbles, Send action button, Modal save buttons, active status highlights
- **WhatsApp Dark Slate (Incoming Bubbles):**
  - Dark Slate background: `#1f2937`
  - Subtle border: `rgba(255, 255, 255, 0.08)`
- **Atmospheric Background & Wallpaper:**
  - Obsidian Base: `#080a0f`
  - WhatsApp Authentic Wallpaper Texture: Inverted subtle doodle overlay at `3%` opacity
- **Status & Badges:**
  - Google Verified: Emerald `#00D26A` / `emerald-400`
  - Permanent Username Lock: Slate `#94a3b8` / `bg-white/[0.06]`

---

## 4. Claude Analysis & Improvement Prompt Template

Use the following prompt when handing off this codebase to Claude 3.7 Sonnet / Opus:

```markdown
You are acting as the Principal Full-Stack Architect and Lead UI/UX Designer reviewing the Raoprime Client Document Portal & Messaging Suite.

### Context & Resources
- Live Production App: https://raoprime.onrender.com
- Primary Stack: Node.js, Express, WebSocket, Tailwind CSS, Google OAuth 2.0
- Visual Theme: Signature Luxury Velvet Maroon (#741728 to #3e0a14) with WhatsApp-style dark incoming bubbles (#1f2937) and authenticated wallpapers.
- Identity: Google OAuth 2.0 with permanent unchangeable usernames strictly derived from email prefixes (email.split('@')[0]).

### Your Mission
Review the provided codebase architecture, screenshot assets, and test logs to deliver a comprehensive technical audit and 3-phase evolution plan:
1. Architecture & Real-Time Performance: Review WebSocket connection handling, message delivery guarantees (ACMs, retries), and cloud database synchronization.
2. UX/UI Micro-Interactions: Refine the Apple/Telegram-grade My Profile modal, inline editing feedback, media lightboxes, and audio message playback waves.
3. Feature Roadmap: Prioritize next-step capabilities (e.g., end-to-end client PDF annotation, multi-file batch upload progress bars, biometric webauthn admin keys).
```
