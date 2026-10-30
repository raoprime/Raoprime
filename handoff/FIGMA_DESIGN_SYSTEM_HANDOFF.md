# Raoprime Design System & Figma Component Specifications

**System:** Raoprime Velvet Maroon & Obsidian Dark System  
**Design Level:** Institutional High-End / Telegram + Apple Grade  
**Target Viewports:**
- Mobile: `390 × 844 px` (iPhone 14 / modern Android)
- Desktop: `1920 × 1080 px` / `1440 × 900 px`

---

## 1. Color Foundations & Tokens

### Primary Brand Gradients
| Token Name | Value | Usage |
|---|---|---|
| `color-maroon-primary` | `#741728` | Main accent, border focus, active toggle |
| `color-maroon-dark` | `#3e0a14` | Gradient bottom/right anchor |
| `gradient-maroon-velvet` | `linear-gradient(135deg, #741728, #3e0a14)` | Sent message bubbles, primary action buttons |
| `color-maroon-glow` | `rgba(116, 23, 40, 0.45)` | Button box shadows, active indicators |

### Neutral Surfaces
| Token Name | Value | Usage |
|---|---|---|
| `surface-obsidian` | `#080a0f` | Global application background canvas |
| `surface-slate-dark` | `#0d1017` | Modal cards, header bars, footer input container |
| `surface-bubble-received` | `#1f2937` | Received messages from Admin/Support |
| `surface-card-subtle` | `rgba(255, 255, 255, 0.03)` | Card grouping panels inside modals |
| `border-subtle` | `rgba(255, 255, 255, 0.08)` | Dividers, card strokes, input borders |

### Semantic Indicators
| Token Name | Value | Usage |
|---|---|---|
| `status-verified-emerald` | `#00D26A` | Google account verified badge, checkmarks |
| `status-warning-amber` | `#f59e0b` | Pending review status, unread indicator |
| `status-locked-slate` | `#94a3b8` | Permanent username badge lock icon |

---

## 2. Core UI Components for Figma Recreation

### Component 1: Message Bubble (Variants: Sent vs Received)
- **Sent (Client):**
  - Background: `gradient-maroon-velvet` (`#741728` to `#3e0a14`)
  - Border radius: `18px 18px 4px 18px`
  - Text color: `#ffffff`
  - Timestamp: `#fecdd3` (`rose-200`) at `10px`, with double checkmark icon
  - Shadow: `0 4px 14px rgba(116, 23, 40, 0.25)`
- **Received (Admin / Support):**
  - Background: `surface-bubble-received` (`#1f2937`)
  - Border: `1px solid rgba(255, 255, 255, 0.08)`
  - Border radius: `18px 18px 18px 4px`
  - Text color: `#f1f5f9`
  - Timestamp: `#94a3b8` (`slate-400`) at `10px`

### Component 2: My Profile Drawer Modal (`#clientProfileModal`)
- Width: `412px` (mobile viewport) / Max width `480px` centered (desktop)
- Border radius: `28px 28px 0 0` (mobile bottom sheet) or `24px` all around (desktop modal)
- Sections:
  1. **Velvet Maroon Header:** Banner gradient with subtle close icon `×` and "ACCOUNT PROFILE" title.
  2. **Avatar Block:** Large `72px` circular avatar with dual border ring, initials or Google photo, and verified checkmark pill.
  3. **Identity Header:** Display name in `font-extrabold` and handle (`@username`).
  4. **Profile Details Card:**
     - Display Name with smooth inline edit mode.
     - Permanent Username: Locked badge with padlock icon `[Permanent 🔒]` and one-click copy button.
     - WhatsApp / Phone field.
     - Connected Email field.
  5. **Google Identity Card:**
     - Unverified state: Official `[G] Verify & Sign in with Google` button. Zero clutter.
     - Verified state: Emerald gradient card with authenticated email and "Synced" tag.
  6. **Preferences Group:** Message chimes audio toggle, device push notifications toggle.

### Component 3: Chat Input Bar
- Floating pill structure inside `#chatFooter`
- Background: `#0d1017` with `border: 1px solid rgba(255, 255, 255, 0.08)`
- Action buttons:
  - Attachment paperclip (left)
  - Microphone voice recording trigger (left)
  - Text input: placeholder `"Type your message..."`
  - Send button: Circular `40px` with Velvet Maroon gradient and paper-plane SVG icon

---

## 3. Figma Design Prompt for Automated Generation

To import these components into Figma using the `figma-generate-design` or `figma-generate-library` skills, run:

```
Create a luxury dark-mode design system frame named "Raoprime Institutional Messaging System" featuring:
1. Color Token Swatches: Primary Velvet Maroon (#741728 -> #3e0a14), Slate Gray (#1f2937), Obsidian Base (#080a0f), Emerald Verified (#00D26A).
2. Chat Bubble Variants: Sent (Velvet Maroon gradient with 18px 18px 4px 18px corners) and Received (Slate 18px 18px 18px 4px corners).
3. Apple-grade Account Profile Modal: 412x840 frame with top banner, circular avatar, permanent username badge with lock, Google sign-in button, and preference switches.
```
