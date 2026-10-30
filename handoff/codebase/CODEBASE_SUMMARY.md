# Raoprime Codebase Architecture & Source Manifest

**Repository:** `raoprime/Raoprime`  
**Target Branch:** `main`  
**Deployment Target:** Render Cloud Web Service  
**Runtime:** Node.js v20+  

---

## 1. Directory Structure

```
client-document-portal/
├── server.js                  # Master Express application, WebSocket hub, Google OAuth 2.0
├── package.json               # Node dependencies and npm scripts
├── .env                       # Environment configuration (PORT, OAuth credentials)
├── Dockerfile                 # Containerized deployment definition
├── docker-compose.yml         # Local container orchestration
├── public/                    # Frontend client bundle
│   ├── index.html             # Client chat interface, velvet styling, profile drawer
│   ├── chat-app.js            # Client real-time messaging, Google auth, inline profile
│   ├── admin.html             # Admin command portal, password gateway
│   ├── admin.js               # Admin real-time inbox, client intel inspector, verification
│   └── assets/                # Logos, SVG icons, wallpapers
├── storage/                   # File-based database stores
│   ├── messages.json          # Conversation message history
│   ├── verifications.json     # Client verification and Google DP links
│   ├── client_intel.json      # Silent device telemetry
│   └── audit_log.json         # Administrative activity logs
├── uploads/                   # Media attachments and client documents
├── handoff/                   # Structured delivery packages for Claude & Figma
│   ├── screenshots/           # High-resolution UI captures
│   ├── video/                 # Exploratory screen recording walkthrough.mp4
│   ├── reports/               # Automated Google OAuth test results
│   ├── CLAUDE_HANDOFF_PACKAGE.md
│   ├── FIGMA_DESIGN_SYSTEM_HANDOFF.md
│   └── CLAUDE_DEVELOPMENT_ROADMAP_AND_PLAN.md
└── scripts/                   # Automated audit and recording scripts
```

---

## 2. Core Server Modules (`server.js`)

1. **Authentication & Identity (`server.js:1100–1235`):**
   - Config endpoint: `GET /api/auth/google/config`
   - OAuth redirect: `GET /api/auth/google` -> `accounts.google.com`
   - Token callback: `GET /api/auth/google/callback`
   - Permanent handle derivation: strictly `(email || '').split('@')[0]`
   - Automatic guest-to-permanent conversation history migration
2. **WebSocket Real-Time Engine (`server.js:350–550`):**
   - Room-based isolation: `socket.join(chatId)`
   - Bidirectional message dispatch, typing indicators, delivery receipts (`✓✓`)
3. **Chunked File Vault (`server.js:600–900`):**
   - Resumable streaming file uploads
   - Antivirus / MIME-type inspection and secure storage
4. **Client Intelligence Telemetry (`server.js:950–1080`):**
   - Ingestion of hardware parameters: OS, GPU, battery, network type, IP
