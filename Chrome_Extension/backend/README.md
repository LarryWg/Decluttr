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
   - `OPENAI_API_KEY`: Your OpenAI API key (users will provide their own via extension)
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
  "emailContent": "Email subject and body text...",
  "apiKey": "sk-..."
}
```

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
  "emailContent": "Email subject and body text...",
  "apiKey": "sk-..."
}
```

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

- The OpenAI API key is provided by users via the Chrome Extension UI
- All endpoints validate input and return appropriate error messages
- CORS is enabled for Chrome Extension origins
- Rate limiting should be added in production

