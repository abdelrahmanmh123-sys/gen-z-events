# Gen Z Events — Live Concerts & Smart Ticketing Platform

> Enterprise-grade event management, bilingual ticketing storefront, and real-time gate QR admission platform for Upper Egypt (Qena). Continuous evolution of the Google AI Studio project `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f`.

---

## Key Features

- **Full Bilingual Parity (EN / AR):** 100% synchronized English (LTR) and Arabic (RTL) localized experience across storefront, fan tickets, and organizer portals.
- **Smart Multi-Scan QR Gate System:** Multi-ticket orders (e.g. 5 tickets on 1 order) allow $N$ individual scans (`1/5` through `5/5`) on a single QR pass, backed by atomic Firestore transactions preventing race conditions across gates.
- **Category Inventory Management:** Real-time seat allocation and live seat count customization across all tiers (`Silver`, `Gold`, `VIP / Fan Pit`, `Lounge`).
- **Official Houda x Qena 3:1 Ticket Passes:** High-resolution digital passes with automatic QR seal alignment matching physical official stamp dimensions.
- **Super Admin In-Place Payment Config:** Instant editing of InstaPay and Vodafone Cash / Mobile Wallets payment destinations.
- **Offline & Box Office Sales Sync:** Full support for physical sales desks, spreadsheet bulk import/export (with formula injection protection), and Google Forms integration.
- **Hardened Firestore Security Rules:** Global default-deny, role-based access control (Super Admin vs Gate Staff vs Fan), atomic check-in diff guards, and schema key allowlists.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Recharts
- **Build & Tooling:** Vite
- **Backend & Database:** Firebase Cloud Firestore (Enterprise Mode), Firebase Authentication
- **Imaging & Export:** HTML5 Canvas, jsQR, QRCode, SheetJS (XLSX)

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended) or Bun

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd gen-z-events
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```

3. Set up environment variables (optional for local Gemini development):
   Copy `.env.example` to `.env` if local Gemini API testing is required. Core Firebase configuration is loaded securely from `firebase-applet-config.json`.

4. Start the local development server:
   ```bash
   npm run dev
   # or
   bun run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```
