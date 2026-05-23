# hat-watcher-ts

TypeScript + Node watcher that polls Grassroots California "new" collection and emails newly seen hats with image attachments.

## Features

- Polls `https://www.grassrootscalifornia.com/collections/new`
- Extracts product title, link, description/snippet (if available), and image URL
- Deduplicates using Supabase persistence ("since last run")
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
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `SUPABASE_TABLE`, `POLL_MINUTES`, `IMAGE_DIR`, `COLLECTION_URL`

## Run

```bash
npm run dev
```

For compiled run:

```bash
npm run build
npm run start
```

## Supabase setup

### Create/link project with Supabase CLI

```bash
supabase login
supabase projects list
```

If your CLI supports project creation:

```bash
supabase projects create --name hat-watcher-ts --org-id <ORG_ID> --region <REGION>
supabase projects list
supabase link --project-ref <PROJECT_REF>
```

If your CLI does not support `projects create`, create the project in the Supabase dashboard, then:

```bash
supabase projects list
supabase link --project-ref <PROJECT_REF>
```
 
Create the table in Supabase SQL editor (or migration):

```sql
create table if not exists public.seen_products (
  url text primary key,
  first_seen_at timestamptz not null default now()
);
```

If you use a custom table name, set `SUPABASE_TABLE` accordingly.

## GitHub Actions (hourly cloud polling)

This repo includes `.github/workflows/hat-watcher.yml` which runs hourly and can also be triggered manually.

Required repository secrets:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

How to enable:

1. GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret
2. Add all the secrets above
3. GitHub -> Actions -> Hat Watcher -> Run workflow (for first manual validation)

The workflow runs one watcher cycle per trigger (`RUN_ONCE=1`) and exits.

## Notes

- This script uses polling (not push) unless the site offers a push feed/webhook.
- Keep polling interval reasonable and respect website terms/robots.
- If site markup changes, update selectors in `src/index.ts`.
