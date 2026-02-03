# Decluttr

Chrome extension for email management, AI summaries, and productivity tools.

## Tech stack

| Layer | Technologies |
|-------|--------------|
| **Extension** | Chrome Manifest V3, vanilla JavaScript, HTML, CSS |
| **Backend** | Node.js, Express.js, OpenAI API, SerpAPI |
| **Email** | Gmail API, OAuth 2.0, D3.js (Sankey diagram) |
| **Focus mode** | MediaPipe / TensorFlow (face landmarker, WASM) |


## Features

- **Email Assistant**: Gmail integration with AI-powered summaries, categorization (Primary / Promotions), unsubscribe detection, and Manage Promotions (unsubscribe in Gmail or move to trash)
- **Focus Mode**: Face detection and focus tracking
- **LinkedIn Tools**: (placeholder for future features)

## Setup

### Backend

1. Go to the backend directory:
   ```bash
   cd Chrome_Extension/backend
   ```

2. Install dependencies and configure:
   ```bash
   npm install
   cp .env.example .env
   ```
   Set `OPENAI_API_KEY` in `.env` (required for AI summaries).
   Set `SERPAPI_KEY` in `.env` (required for LinkedIn automatic search summaries).

4. Start the server:
   ```bash
   npm start
   ```
   Default: `http://localhost:3000`. See [Chrome_Extension/backend/README.md](Chrome_Extension/backend/README.md) for API details.

### Chrome Extension

1. **Google Cloud: Gmail API and OAuth**
   - In [Google Cloud Console](https://console.cloud.google.com/): create or select a project.
   - Enable **Gmail API** (APIs & Services → Library → search “Gmail API” → Enable).
   - Create **OAuth 2.0 Client ID**: APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Chrome app** (or **Web application**). For Chrome app, enter your extension ID (see step 3).
   - **Authorized redirect URIs**: After loading the extension once, open the extension → Settings → Developer options → copy the **Redirect URI**. Add that exact URI to your OAuth client’s “Authorized redirect URIs”. If you have multiple OAuth clients (e.g. for different testers), add the same URI to each client.
   - Copy the **Client ID** and put it in `Chrome_Extension/manifest.json` under `oauth2.client_id`.

2. **Load the extension**
   - Chrome → `chrome://extensions/` → turn on **Developer mode** → **Load unpacked** → select the `Chrome_Extension` folder.
   - The extension uses a fixed `key` in the manifest so the extension ID (and redirect URI) stay the same across reloads. Use the redirect URI shown in Settings → Developer options when configuring OAuth.

3. **Optional: Backend URL**
   - Extension → Settings (gear) → Developer options → set **Backend URL** if your backend is not at `http://localhost:3000` → Save.

4. **Connect Gmail**
   - Open the extension → Email Assistant → **Connect Gmail** → sign in and allow access. Testers do not need to configure OAuth; only the person who set up the OAuth client(s) needs to add the redirect URI once.

## Usage

### Email Assistant

1. Open the Decluttr icon → **Email Assistant**.
2. Use **Primary** and **Promotions** tabs to filter by Gmail category.
3. **Load More** fetches the next page of emails (batch size is configurable).
4. **Process with AI** on an email: summary, category, and unsubscribe detection.
5. **View Details** opens the full email and AI analysis.
6. **Manage Promotions** (when on Promotions): select senders, then **Open in Gmail** (use Gmail’s Unsubscribe) and/or **Unsubscribe & optionally trash** (extension attempt + optional move to trash).
7. **Refresh** reloads the inbox.

### Settings

- **Account**: Log out from Gmail.
- **Appearance**: Theme (Light / Dark / System).
- **Behavior**: Auto-categorize emails on load (toggle).
- **Developer options** (collapsed): Backend URL, Redirect URI (for OAuth setup). Copy the Redirect URI and add it to your OAuth client(s) in Google Cloud Console so Connect Gmail works.

## Troubleshooting

- **Backend**: Ensure the backend is running and the Backend URL in Settings → Developer options is correct. CORS must allow the extension origin.
- **Gmail / OAuth**: If you see “redirect_uri_mismatch” or “Access blocked: This app’s request is invalid”, add the **exact** Redirect URI from Settings → Developer options to your OAuth client’s Authorized redirect URIs in Google Cloud Console. If you use multiple OAuth clients, add the same URI to each.
- **AI errors**: Check `OPENAI_API_KEY` in backend `.env` and backend logs for details.
