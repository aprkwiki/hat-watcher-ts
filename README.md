# hat-watcher-ts

TypeScript + Node watcher that polls Grassroots California "new" collection and emails newly seen hats with image attachments.

## Features

- Polls `https://www.grassrootscalifornia.com/collections/new`
- Extracts product title, link, description/snippet (if available), and image URL
- Deduplicates using a persisted `seen.json` ("since last run")
- Downloads unseen images and emails a digest with attachments
- Retries on next poll if errors occur

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` values:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `EMAIL_FROM`, `EMAIL_TO`
- Optional: `POLL_MINUTES`, `STATE_DIR`, `IMAGE_DIR`, `COLLECTION_URL`

## Run

```bash
npm run dev
```

For compiled run:

```bash
npm run build
npm run start
```

## Notes

- This script uses polling (not push) unless the site offers a push feed/webhook.
- Keep polling interval reasonable and respect website terms/robots.
- If site markup changes, update selectors in `src/index.ts`.
