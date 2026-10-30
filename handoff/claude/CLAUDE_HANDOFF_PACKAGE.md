# Raoprime Client Portal & Admin Console — Master Claude Handoff Package

**Project Name:** Raoprime Client Document Portal & Messaging Suite  
**Architecture:** Real-Time Node.js Express Hub, Native WebSocket Engine, Google OAuth 2.0 Web Client, Tailwind CSS  
**Production Release:** Version 2.4.0 (Enterprise Release)  
**Live Production URL:** [https://raoprime.onrender.com](https://raoprime.onrender.com)  
**Local Development URL:** [http://localhost:4000](http://localhost:4000)  
**Official Support Account:** `raoprime.music@gmail.com`  
**Target LLM Engine:** Claude 3.7 Sonnet / Claude 3.5 Sonnet / Claude Opus  

---

## 1. System Architecture & Technical Stack

```mermaid
graph TB
    subgraph ClientLayer [Client Layer - Browser Frontend]
        ClientUI["Client Web App (/?chat=:username)"]
        AdminUI["Admin Command Console (/admin)"]
        ProfileDrawer["My Profile Drawer & Lightbox"]
    end

    subgraph ServerLayer [Application Hub - Node.js Express (server.js)]
        ExpressRouter["Express HTTP API Router"]
        WebSocketHub["Native WebSocket Room Server (ws)"]
        OAuthHandler["Google OAuth 2.0 Client"]
        SecurityGateway["Admin Vault Gateway (Password 'rdmy')"]
    end

    subgraph DataLayer [Storage & Persistence Layer]
        LocalJSON["storage/*.json (messages, verifications, intel, audit)"]
        UploadsDir["uploads/ (documents, media, voice notes)"]
        FirebaseSync["Firebase Admin SDK / Firestore (firebase-key.json)"]
    end

    ClientUI <--> |HTTP / WebSocket| ExpressRouter
    AdminUI <--> |HTTP / WebSocket| ExpressRouter
    ClientUI <--> |Real-Time Bidirectional| WebSocketHub
    AdminUI <--> |Real-Time Bidirectional| WebSocketHub
    ExpressRouter <--> OAuthHandler
    ExpressRouter <--> SecurityGateway
    ExpressRouter --> LocalJSON
    ExpressRouter --> UploadsDir
    ExpressRouter -.-> FirebaseSync
```

### Core Technologies
- **Server Runtime:** Node.js v20+ with Express.js (`server.js`)
- **Real-Time Communication:** Native WebSocket (`ws`) with dynamic channel multiplexing (`socket.join(chatId)`), typing indicators, and delivery receipts (`✓✓`).
- **Identity & Authentication:** Official Google OAuth 2.0 Web Client (`accounts.google.com`) Authorization Code flow, verifying ID tokens with Google's public keys.
- **Admin Security Gateway:** Institutional password-protected vault (`#loginGateway`) with master credential `rdmy`, brute-force throttling, and session cookies.
- **Persistence:** Local atomic JSON stores (`storage/messages.json`, `storage/verifications.json`, `storage/client_intel.json`, `storage/audit_log.json`) with automated failover replication to Cloud Firestore via Firebase Admin SDK.
- **Frontend Architecture:** Vanilla modern ES6+ modules (`public/chat-app.js`, `public/admin.js`) styled with Tailwind CSS and luxury custom SVG icons. Zero heavy frontend framework overhead for instantaneous sub-100ms first contentful paint.

---

## 2. Invariable Identity Rule: Permanent Username Derivation

The application enforces a strict, immutable security invariant regarding user handles:

1. **Email Prefix Authority:** When an authenticated Google user signs in via `/api/auth/google`, their permanent handle is strictly derived on the server:
   ```javascript
   const permanentHandle = (googleUser.email || '').split('@')[0].toLowerCase().trim();
   ```
2. **Immutability Invariant:** The permanent handle `@username` cannot be edited, spoofed, or overwritten by any client-side request or admin dashboard action.
3. **Guest Conversation Migration:** If a user initiates a conversation under a temporary session name (e.g., `client`) and subsequently connects their Google Account, `server.js` automatically and transactionally merges their conversation history, attachments, and telemetry into their permanent handle record.

---

## 3. Comprehensive Route & Modal Directory

### Web Endpoints
| Route | Access Level | Description | Primary Selectors |
|---|---|---|---|
| `/?chat=<username>` | Public Client | Main client portal, real-time message stream, file dropzone, audio recorder | `#chatContainer`, `#chatMessages`, `#chatFooter` |
| `/admin` | Protected (Vault) | Security login gateway requiring master password `rdmy` | `#loginGateway`, `#adminPasswordInput`, `#loginSubmitBtn` |
| `/admin` (Unlocked) | Admin Authenticated | Real-time multi-client command center, conversation viewer, client intel drawer | `#adminDashboard`, `#clientListContainer`, `#adminChatArea` |

### Modals & Drawers
| Modal Identifier | Route | Purpose | Key Elements |
|---|---|---|---|
| `#clientProfileModal` | Client Portal | Apple-grade My Profile drawer | Top banner, 72px avatar, locked `@username` badge, Google OAuth button (`#googleAuthTriggerBtn`), display name edit |
| `#profileModal` | Client Portal | Raoprime institutional brand details | Brand mission, encryption notice, document guidelines |
| `#imageLightbox` | Client Portal | Full-screen media previewer | Zoomable image container, close button, download anchor |
| `#nameModal` | Client Portal | Onboarding modal for guest users | Display name input, submit button |
| `#clientIntelDrawer` | Admin Portal | Silent device hardware telemetry | OS, browser, GPU, battery, network latency, IP geolocation |
| `#photoVerifyModal` | Admin Portal | Google account profile verification | High-res avatar zoom, verified email match badge |
| `#renameModal` | Admin Portal | Admin alias assignment dialog | Client alias input, save button |
| `#deleteConfirmModal`| Admin Portal | Destructive conversation purge | Confirmation warning, permanent delete CTA |

### REST & OAuth API Endpoints
| Endpoint | Method | Access | Function |
|---|---|---|---|
| `/api/auth/google/config` | `GET` | Public | Returns official Google Client ID for client SDK initialization |
| `/api/auth/google` | `GET` | Public | Initiates OAuth 2.0 redirect to `accounts.google.com` with `client_id`, `redirect_uri`, `scope=openid email profile` |
| `/api/auth/google/callback` | `GET` | Public Callback | Exchanges OAuth authorization code for ID token, derives permanent handle, sets cookie, redirects to client portal |
| `/api/chat/verify-google` | `POST` | Authenticated | Validates client-side Google credential against Google tokeninfo endpoint |
| `/api/chat/history` | `GET` | Authenticated | Retrieves persistent message history for room |
| `/api/upload` | `POST` | Public / Multipart | Handles chunked document, image, and voice note uploads |

---

## 4. Visual Identity Tokens Reference

| Token Name | Value | Applied To |
|---|---|---|
| `Primary Velvet Maroon` | `#741728` | Main accent, buttons, focus borders, active indicator |
| `Dark Maroon Base` | `#3e0a14` | Gradient bottom anchor, deep luxury shadows |
| `Maroon Velvet Gradient`| `linear-gradient(135deg, #741728, #3e0a14)` | Sent message bubbles, primary action buttons, avatar rings |
| `Obsidian Base Surface` | `#080a0f` | Global application canvas background |
| `Slate Received Bubble` | `#1f2937` | Received incoming bubbles from admin/support |
| `Verified Emerald` | `#00D26A` | Google verified account badge, checkmark SVG |
| `Permanent Lock Slate` | `#94a3b8` | Padlock icon and permanent username border |

---

## 5. Ready-to-Run Claude 3.7 Ingestion Prompt

Copy and paste this structured prompt into Claude 3.7 Sonnet / Opus to initiate an in-depth code review, architectural refinement, or feature sprint:

```markdown
You are acting as the Principal Full-Stack Architect and Lead UI/UX Systems Designer for the Raoprime Client Document Portal & Messaging Suite.

### Project Baseline
- Production Deployment: https://raoprime.onrender.com
- Local Server: http://localhost:4000
- Tech Stack: Node.js Express, Native WebSocket (ws), Google OAuth 2.0 Web Client, Tailwind CSS
- Design System: Velvet Maroon (#741728 to #3e0a14) with Obsidian Dark Surface (#080a0f) and Emerald Verified (#00D26A)
- Identity Invariant: User handles are strictly immutable and derived from Google email prefixes (email.split('@')[0]).

### Assembled Deliverables in Hand
1. Complete Codebase Archive: handoff/codebase/codebase_export.zip
2. Codebase Architecture Manifest: handoff/codebase/CODEBASE_SUMMARY.md
3. 28 High-Resolution Screenshots: handoff/screenshots/ (Desktop, Mobile, all 12 Modals)
4. Exploratory Video Walkthrough: handoff/video/walkthrough.mp4 (Full HD 61s)
5. Google OAuth 2.0 Verification Report: handoff/reports/google_oauth_verification_report.md
6. Design Tokens & Component Specs: handoff/figma/design_tokens.json & FIGMA_DESIGN_SYSTEM_HANDOFF.md
7. Technical Roadmap: handoff/claude/CLAUDE_DEVELOPMENT_PLAN.md

### Task
Analyze the codebase architecture, visual design tokens, and future roadmap to produce a comprehensive implementation blueprint for the next engineering sprint. Specifically:
1. Provide exact code modifications for canvas-based audio waveform visualization in public/chat-app.js.
2. Outline the WebSocket auto-reconnect state machine with exponential backoff and message ACK protocol.
3. Specify the Redis Pub/Sub adapter implementation for horizontal scaling across multi-instance cloud deployments.
```
