# Raoprime Client Portal — System Architecture & Claude Engineering Guide

## 1. Project Overview & Identity
- **Product Name:** Raoprime Client Document Portal & Messaging Suite
- **Live Deployment:** `https://raoprime.onrender.com`
- **Admin Console:** `https://raoprime.onrender.com/admin` (Password: `rdmy`)
- **Design Philosophy:** Verifect-grade institutional luxury. Quiet precision, dark obsidian surfaces, gold & emerald accents, and zero amateur or tacky elements.

---

## 2. Institutional Design Standard (Verifect Principles)
Adhere strictly to the design system established in `DESIGN.md`:
- **Background Base:** Dark Obsidian `#07080c`
- **Surface / Container:** `#0c0e14` with subtle border `rgba(255, 255, 255, 0.08)`
- **Typography:** Plus Jakarta Sans & Inter font stacks (`font-black`, `font-bold`, crisp tracking)
- **Verified Accent:** Instagram / Verifect Emerald `#00D26A`
- **Luxury Accent:** Antique Gold `#d4af37`
- **Client Discretion:** Telemetry (device model, battery, RAM, GPU, network) is **100% silent** in the background. It is **NEVER** displayed on the client screen. Telemetry belongs exclusively inside the Admin Intelligence console (`openClientIntelModal()`).
- **No Manual Email:** Never force or ask the user to type their email in input fields. Email is acquired automatically via Google OAuth 2.0 or background sync.

---

## 3. Google OAuth 2.0 & Identity Verification

### Google Cloud Credentials (Official Raoprime)
- **Client ID:** Configured in `.env` / Render (`GOOGLE_CLIENT_ID`): `1091556491172-...`
- **Client Secret:** Configured in `.env` / Render (`GOOGLE_CLIENT_SECRET`)
- **Project:** `Raoprime` (Owner/Support: `raoprime.music@gmail.com`)

### Whitelisted Domains & Callbacks
For the official Raoprime Web Client ID (`1091556491172-qvg8ad21inph1u5f5i50dohnrp06uvri.apps.googleusercontent.com`):
1. **Authorized JavaScript origins:**
   - `https://raoprime.onrender.com`
   - `http://localhost:4000`
2. **Authorized redirect URIs:**
   - `https://raoprime.onrender.com/api/auth/google/callback`
   - `http://localhost:4000/api/auth/google/callback`

### Fallback Verification Engine
If Google OAuth is pending domain propagation, the client portal provides **Fast-Track Instant Verify**:
- Calls `/api/chat/verify-google` with unavatar DP resolution (`https://unavatar.io/<email>`).
- Automatically sets the Google photo as the default DP everywhere (`#headerProfileImg`, `#modalProfileImg`, admin conversations, message cards).
- Activates the verified emerald checkmark `✓` across client and admin consoles.

---

## 4. Repository Structure & Key Files

```
client-document-portal/
├── server.js               # Node.js Express server + WebSocket server + OAuth endpoints
├── package.json            # Dependencies and scripts
├── CLAUDE.md               # Claude handover and engineering instructions
├── public/
│   ├── index.html          # Client chat portal interface (Verifect luxury styling)
│   ├── chat-app.js         # Client WebSocket, messaging, telemetry, Google verification
│   ├── admin.html          # Raoprime administrative console
│   ├── admin.js            # Admin real-time chat, telemetry modals, verification review
│   └── favicon.ico         # Portal brand icon
├── storage/
│   ├── messages.json       # Chat messages persistence
│   ├── verifications.json  # Client verification records & DP links
│   └── client_intel.json   # Captured silent device telemetry
└── uploads/                # Document and media vault (E2E transfer)
```

---

## 5. Key Server Endpoints & WebSocket Architecture

### Express Routes
- `GET /api/auth/google`: Initiates official Google OAuth 2.0 code exchange.
- `GET /api/auth/google/callback`: Receives authorization code, exchanges for Google ID token, extracts picture URL, email & name, sets default DP, and redirects back to portal.
- `POST /api/chat/verify-google`: Direct Google profile verification & DP sync.
- `POST /api/chat/verify-photo`: Custom camera/photo upload with 20-minute countdown simulation.
- `POST /api/chat/telemetry`: Silent client device telemetry ingestion.
- `GET /api/chat/verification`: Returns verification status and profile photo URL.
- `POST /api/admin/verify-client`: Admin manual approve/reject of client identity.

### WebSocket Events
- `chat:message`: Instant 0ms bidirectional messaging with seen receipts.
- `chat:typing`: Live WhatsApp-grade typing bubble.
- `user:presence`: Live online/offline status tracking (strictly excludes admin role from showing client as online).
- `chat:verification-updated`: Live broadcast of photo and verification status.

---

## 6. Development & Deployment Commands

```bash
# Install dependencies
npm install

# Start local server (Port 4000)
node server.js

# Syntax check
node -c server.js
node -c public/chat-app.js
node -c public/admin.js

# Deploy to Render
git add .
git commit -m "feat: updates"
git push origin main
```

---

## 7. Operational Commitments
- **Zero Tacky Elements:** No amateur AI badges or cheap buttons.
- **Client Data Protection:** Device details remain in admin only.
- **Default DP:** Verified Google photo must remain the primary display avatar.
- **High Uptime:** Clean JSON file persistence with automatic directory and file fallback creation.
