# Decluttr

Chrome Extension for email management, AI summaries, and productivity tools.

## Features

- **Email Assistant**: Gmail integration with AI-powered email summaries, categorization, and unsubscribe detection
- **Focus Mode**: Face detection and focus tracking (existing)
- **LinkedIn Tools**: (placeholder for future features)

## Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

5. Start the backend server:
```bash
npm start
```

The backend will run on `http://localhost:3000` (or your configured PORT).

See [backend/README.md](backend/README.md) for detailed backend API documentation.

### Chrome Extension Setup

1. **Configure OAuth Client ID for Gmail API**:

   a. **Enable Gmail API in Google Cloud Console:**
      - Go to [Google Cloud Console](https://console.cloud.google.com/)
      - Create a new project or select an existing one
      - Navigate to "APIs & Services" > "Library"
      - Search for "Gmail API" and click "Enable"
   
   b. **Create OAuth 2.0 credentials:**
      - Go to "APIs & Services" > "Credentials"
      - Click "Create Credentials" > "OAuth client ID"
      - **Choose "Desktop app" as the application type** (or "Web application")
      - **No redirect URI needed** - Chrome extensions handle this automatically
      - Click "Create"
      - Copy the generated Client ID (looks like: `123456789-abcdefg.apps.googleusercontent.com`)
   
   c. **Update manifest.json:**
      - Open `Chrome_Extension/manifest.json`
      - Find the `oauth2.client_id` field
      - Replace the placeholder with your actual Client ID from step b
      - **Reload the extension** in `chrome://extensions/` after making this change

2. **Load the Extension**:

   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `Chrome_Extension` directory

3. **Configure Settings** (Optional):

   - Click the Decluttr extension icon in Chrome toolbar
   - Click "Email Assistant"
   - Click the settings (⚙️) button
   - Optionally update the backend URL if running on a different port/host
   - Click "Save"
   

4. **Connect Gmail**:

   - Click "Connect Gmail" button
   - Authorize the extension to access your Gmail (read-only)
   - Your emails will be fetched and displayed

## Usage

### Email Assistant

1. Click the Decluttr extension icon
2. Click "Email Assistant"
3. Your Gmail inbox emails will be displayed (latest 20 emails)
4. Click "Process with AI" on any email to get:
   - AI-generated summary
   - Category classification (Work, Personal, Promotional, Spam, Newsletter, Other)
   - Unsubscribe link detection
5. Click "View Details" to see full email content and AI analysis
6. Click "Refresh" to fetch latest emails

## Development

### Backend API Endpoints

- `POST /api/email/summarize` - Generate AI summary, category, and unsubscribe detection
- `POST /api/email/categorize` - Categorize an email
- `POST /api/email/detect-unsubscribe` - Detect unsubscribe links
- `GET /health` - Health check

See [backend/README.md](backend/README.md) for detailed API documentation.

### File Structure

```
Decluttr/
├── Chrome_Extension/
│   ├── features/
│   │   └── email/          # Email Assistant feature
│   │       ├── email.html  # Email UI
│   │       ├── email.css   # Email styles
│   │       ├── email.js    # Email logic & Gmail API
│   │       └── gmail-auth.js # OAuth authentication
│   ├── popup/              # Main popup
│   └── manifest.json       # Extension manifest
└── backend/                # Backend API server
    ├── server.js           # Express server
    ├── routes/             # API routes
    └── utils/              # Utility functions
```



### Backend Connection Issues

- Ensure the backend server is running (`npm start` in backend directory)
- Check that the backend URL in extension settings matches your server URL
- Verify CORS setting in backend allow requests from extension

### Gmail Authentication Issues

- Verify OAuth Client ID is correctly configured in `manifest.json`
- Check that Gmail API is enabled in Google Cloud Console
- Ensure the extension has proper permissions in Chrome

### AI Processing Errors

- Verify OpenAI API key is valid and has credits
- Check backend server logs for detailed error messages
- Ensure email content is not empty or malformed
