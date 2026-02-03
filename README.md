<!-- <p align="center">
  <img src="path/to/decluttr-logo.png" alt="Decluttr Logo" width="120" />
</p> -->

<h1 align="center">Decluttr</h1>

<p align="center">
  <strong>📬 AI-Powered Email & Focus for Chrome</strong>
</p>

## 🎯 The Problem

Inboxes are overloaded. Promotions and newsletters compete with what actually matters. At the same time, staying focused is harder than ever—tabs, notifications, and context-switching fragment attention.

**Traditional approaches fall short because:**
- Manual filters and labels don’t scale
- Unsubscribing is tedious and scattered across senders
- Focus tools are either too rigid or easy to ignore

## 💡 Our Solution

**Decluttr** is a Chrome extension that combines an **AI-powered email assistant** with **focus mode**. It connects to Gmail, uses AI for summaries and categorization, helps you manage promotions and unsubscribe in one place, and adds face-based focus tracking so you stay on task.

Think of it as **“Inbox + Focus in one place”**:

---

## ✨ Features

### 📧 Email Assistant
- **Gmail integration** with OAuth 2.0
- **AI-powered summaries**, category suggestions (Primary / Promotions), and unsubscribe detection
- **Manage Promotions**: pick senders, then **Open in Gmail** (use Gmail’s Unsubscribe) or **Unsubscribe & optionally trash**
- **Primary vs Promotions** tabs; load more, process with AI, view details

### 🧠 AI Summaries & Classification
- Process individual emails for summary, category, and unsubscribe detection
- Optional **auto-categorize on load**
- Backend uses OpenAI for analysis

### 📊 Sankey & Pipeline
- Visualize email flow and pipeline (e.g. Primary vs Promotions) with D3.js Sankey diagrams

### 👁️ Focus Mode
- **Face detection** and focus tracking (MediaPipe / TensorFlow, face landmarker, WASM)
- Distraction overlay and focus sessions to keep you on task

### 🔗 LinkedIn Tools
- Placeholder for future LinkedIn-related features

---

## 🛠️ How It Works

1. **Extension**: You use Email Assistant or Focus from the extension popup/pages.
2. **Backend**: Email and AI requests go to the Node/Express server (OpenAI, SerpAPI for LinkedIn, etc.).
3. **Gmail**: OAuth and Gmail API fetch mail; AI summarizes and classifies; you manage promotions and unsubscribe.
4. **Focus**: Face detection runs in the extension; focus overlay and logic run when Focus mode is on.

---

## 🧱 Tech Stack

| Layer | Technology |
|-------|------------|
| **Extension** | Chrome Manifest V3, vanilla JavaScript, HTML, CSS |
| **Backend** | Node.js, Express.js, OpenAI API, SerpAPI |
| **Email** | Gmail API, OAuth 2.0, D3.js (Sankey diagram) |
| **Focus** | MediaPipe / TensorFlow (face landmarker, WASM) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Chrome browser
- OpenAI API key (for AI summaries)
- SerpAPI key (optional; for LinkedIn automatic search summaries)
- Google Cloud project with Gmail API and OAuth 2.0 client (for Gmail)

### Backend

```bash
cd Chrome_Extension/backend
npm install
cp .env.example .env
```

Set in `.env`:
- `OPENAI_API_KEY` — required for AI summaries
- `SERPAPI_KEY` — required for LinkedIn search summaries (if used)

Start the server:

```bash
npm start
```

Default: `http://localhost:3000`. See [Chrome_Extension/backend/README.md](Chrome_Extension/backend/README.md) for API details.

### Chrome Extension

1. **Google Cloud: Gmail API and OAuth**
   - In [Google Cloud Console](https://console.cloud.google.com/): create or select a project.
   - Enable **Gmail API** (APIs & Services → Library → search “Gmail API” → Enable).
   - Create **OAuth 2.0 Client ID**: APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Chrome app** (or **Web application**). For Chrome app, use your extension ID (see step 2).
   - **Authorized redirect URIs**: Load the extension once, then open it → Settings → Developer options → copy the **Redirect URI**. Add that exact URI to your OAuth client’s “Authorized redirect URIs”. Add the same URI to each client if you use multiple (e.g. for testers).
   - Copy the **Client ID** into `Chrome_Extension/manifest.json` under `oauth2.client_id`.

2. **Load the extension**
   - Chrome → `chrome://extensions/` → turn on **Developer mode** → **Load unpacked** → select the `Chrome_Extension` folder.
   - The manifest uses a fixed `key` so the extension ID (and redirect URI) stay the same across reloads. Use the redirect URI from Settings → Developer options when configuring OAuth.

3. **Optional: Backend URL**
   - Extension → Settings (gear) → Developer options → set **Backend URL** if the backend is not at `http://localhost:3000` → Save.

4. **Connect Gmail**
   - Open the extension → Email Assistant → **Connect Gmail** → sign in and allow access. Only the OAuth client owner needs to add the redirect URI; testers can connect once it’s set.

---

## 📖 Usage

### Email Assistant

1. Open the Decluttr icon → **Email Assistant**.
2. Use **Primary** and **Promotions** tabs to filter by Gmail category.
3. **Load More** fetches the next page of emails (batch size is configurable).
4. **Process with AI** on an email: summary, category, and unsubscribe detection.
5. **View Details** opens the full email and AI analysis.
6. **Manage Promotions** (when on Promotions): select senders, then **Open in Gmail** (Gmail’s Unsubscribe) and/or **Unsubscribe & optionally trash** (extension attempt + optional move to trash).
7. **Refresh** reloads the inbox.

### Settings

- **Account**: Log out from Gmail.
- **Appearance**: Theme (Light / Dark / System).
- **Behavior**: Auto-categorize emails on load (toggle).
- **Developer options** (collapsed): Backend URL, Redirect URI (for OAuth). Copy the Redirect URI and add it to your OAuth client(s) in Google Cloud Console so Connect Gmail works.

### Troubleshooting

- **Backend**: Ensure the backend is running and the Backend URL in Settings → Developer options is correct. CORS must allow the extension origin.
- **Gmail / OAuth**: For “redirect_uri_mismatch” or “Access blocked: This app’s request is invalid”, add the **exact** Redirect URI from Settings → Developer options to your OAuth client’s Authorized redirect URIs in Google Cloud Console. If you use multiple OAuth clients, add the same URI to each.
- **AI errors**: Check `OPENAI_API_KEY` in backend `.env` and backend logs for details.

---

## 📁 Project Structure

```
Chrome_Extension/
├── backend/
│   ├── routes/           # email, linkedin API routes
│   ├── features/linkedin/ # LinkedIn AI service
│   ├── utils/             # openai etc.
│   └── server.js
├── features/
│   ├── email/             # Email Assistant (Gmail, AI, Sankey, Unsubscribe)
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── lib/           # d3, sankey
│   ├── focus/             # Focus mode (face detection, overlay)
│   │   └── lib/           # MediaPipe / TensorFlow WASM
│   └── linkedin/          # LinkedIn UI & theme
├── popup/                 # Extension popup (App.js, App.html, App.css)
├── utils/                 # theme, shared utilities
└── manifest.json
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

