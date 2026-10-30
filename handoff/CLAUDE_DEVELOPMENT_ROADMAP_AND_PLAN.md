# Raoprime Technical Roadmap & Architecture Plan

**Generated for:** Raoprime Executive Team & Development Leads  
**Target Release Cycle:** Q4 2026 - Q1 2027  
**Architectural Baseline:** Node.js Express, Native WebSocket, Google OAuth 2.0 Web Client, Tailwind CSS  

---

## 1. Executive Summary & Current State Audit

Raoprime has achieved a solid institutional baseline:
1. **Authentication & Identity:** 100% verified official Google OAuth 2.0 (`1091556491172-qvg8ad21inph1u5f5i50dohnrp06uvri.apps.googleusercontent.com`) with permanent usernames strictly derived from Google email handles (`email.split('@')[0]`).
2. **Visual Consistency:** The Velvet Maroon (`#741728` to `#3e0a14`) signature theme is cleanly implemented across chat bubbles, buttons, and headers, with WhatsApp dark slate incoming bubbles.
3. **Admin Command:** Cryptographic password vault `/admin` (`rdmy`) with live client monitoring, real-time message broadcasting, and device intelligence.
4. **Integrity:** Zero fake countdowns, zero artificial simulation timers, genuine WebSocket delivery.

---

## 2. Prioritized 3-Phase Engineering Roadmap

```mermaid
flowchart TD
    subgraph Phase 1 [Phase 1: Real-Time Hardening & Media Polish]
        P1A[WebSocket Auto-Reconnect with Exponential Backoff]
        P1B[Voice Note Waveform Visualizer & Playhead Scrubbing]
        P1C[In-Browser PDF & Multi-Page Document Previews]
    end

    subgraph Phase 2 [Phase 2: Administrative Intelligence & Security]
        P2A[Admin Multi-Factor Authentication & WebAuthn Biometrics]
        P2B[Client Telemetry Analytics Dashboard]
        P2C[Automated End-to-End Chat Transcripts Export to PDF]
    end

    subgraph Phase 3 [Phase 3: High-Scale Cloud Distribution]
        P3A[Distributed Redis Pub/Sub for Multi-Instance WebSockets]
        P3B[S3-Compatible Cloud Storage for Large Document Uploads]
        P3C[Global CDN Edge Caching for Static Bundles]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
```

---

## 3. Phase Details & Action Items

### Phase 1: Real-Time Hardening & Media Polish (Sprint 1–2)
- **Voice Note Waveforms:** Replace standard HTML5 audio tag with canvas-based audio waveform visualization (using Web Audio API `AudioContext` and frequency analysis).
- **Chunked File Upload Progress Bar:** Implement real-time percentage indicators during large multi-megabyte document uploads using `XMLHttpRequest.upload.onprogress`.
- **Inline PDF Viewer:** Embed a lightweight PDF rendering modal using PDF.js to preview signed agreements and receipts directly without forcing a download.

### Phase 2: Administrative Intelligence & Security (Sprint 3–4)
- **WebAuthn / Passkey Admin Authentication:** Complement the master password `rdmy` with hardware security key / TouchID biometric passkey verification via the Web Authentication API.
- **Client Activity Timeline:** Display client lifecycle events (first visit, Google sign-in timestamp, document downloads, audio chimes preferences) in the Admin Client Intel Drawer.
- **Export to PDF:** Allow one-click generation of court-admissible or audit-ready PDF conversation transcripts directly from the admin dashboard.

### Phase 3: Cloud Scalability & Multi-Region Resilience (Sprint 5–6)
- **Redis Pub/Sub:** Decouple WebSocket connections from single-server memory so multiple Render / Oracle Cloud instances can route messages instantaneously.
- **S3 / Cloudflare R2 Document Vault:** Move local `/storage/uploads` to Cloudflare R2 or AWS S3 with signed pre-authenticated download URLs.
- **Automated Backup Cron:** Off-site automated daily backups of conversation databases with AES-256 encryption.

---

## 4. Immediate Next Steps for Next Work Session
1. Wire up client-side voice message waveform rendering for recorded voice notes.
2. Add PDF preview lightbox inside the chat window for `.pdf` document attachments.
3. Conduct production load testing on Render instance under simulated multi-client concurrency.
