# Decluttr Backend API

Backend server for Decluttr Chrome Extension providing AI-powered email processing.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
   - `OPENAI_API_KEY`: **REQUIRED** - Your OpenAI API key (used for all AI requests)
   - `PORT`: Server port (default: 3000)
   - `BACKEND_URL`: Backend URL (default: http://localhost:3000)

4. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000` (or the PORT specified in `.env`).

## API Endpoints

### POST /api/email/summarize
Generate AI summary, category, and unsubscribe detection for an email.

**Request:**
```json
{
  "emailContent": "Email subject and body text..."
}
```

**Note:** OpenAI API key is configured server-side via `OPENAI_API_KEY` environment variable.

**Response:**
```json
{
  "summary": "2-3 sentence summary of the email",
  "category": "Work|Personal|Promotional|Spam|Newsletter|Other",
  "hasUnsubscribe": true,
  "unsubscribeLink": "https://example.com/unsubscribe" // or null
}
```

### POST /api/email/categorize
Categorize an email.

**Request:**
```json
{
  "emailContent": "Email subject and body text..."
}
```

**Note:** OpenAI API key is configured server-side via `OPENAI_API_KEY` environment variable.

**Response:**
```json
{
  "category": "Work|Personal|Promotional|Spam|Newsletter|Other",
  "confidence": 0.85
}
```

### POST /api/email/detect-unsubscribe
Detect unsubscribe links in email content.

**Request:**
```json
{
  "emailContent": "Email HTML or text content..."
}
```

**Response:**
```json
{
  "hasUnsubscribe": true,
  "unsubscribeLink": "https://example.com/unsubscribe" // or null
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Notes

- **OpenAI API key is configured server-side** via `OPENAI_API_KEY` environment variable
- All users share the same OpenAI API key (configured on the server)
- All endpoints validate input and return appropriate error messages
- CORS is enabled for Chrome Extension origins
- Rate limiting should be added in production
- Make sure to set `OPENAI_API_KEY` in your `.env` file before starting the server

