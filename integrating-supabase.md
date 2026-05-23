# Integrating Supabase Persistence into `hat-watcher-ts`

## Goal

Replace local JSON persistence (`hat-watcher/state/seen.json`) with Supabase-backed persistence so seen product URLs are stored centrally and survive local environment resets.

---

## Information Gathered

- The watcher currently tracks seen product URLs using local filesystem helpers in `src/index.ts`:
  - `loadSeen()` reads from `STATE_FILE`
  - `saveSeen()` writes to `STATE_FILE`
- Polling, product parsing, image download, and email digest behavior are already implemented and should remain unchanged.
- Requested direction: use Supabase for persistence.

---

## Implementation Plan

### 1) Add Supabase client dependency

**File:** `hat-watcher-ts/package.json`

- Add dependency:
  - `@supabase/supabase-js`

---

### 2) Refactor persistence in watcher

**File:** `hat-watcher-ts/src/index.ts`

#### 2.1 Add required Supabase env configuration

Introduce env vars:

- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)
- `SUPABASE_TABLE` (optional, default: `seen_products`)

#### 2.2 Initialize Supabase client

- Import `createClient` from `@supabase/supabase-js`
- Construct client once at startup
- Extend `assertRequiredEnv()` to validate Supabase vars

#### 2.3 Replace local seen-state functions

Current local-file functions:

- `loadSeen()` from JSON file
- `saveSeen(seen)` to JSON file

New Supabase-backed functions:

- `loadSeen(): Promise<Set<string>>`
  - `select("url")` from `SUPABASE_TABLE`
  - convert result into `Set<string>`
- `saveSeenUrls(urls: string[]): Promise<void>`
  - upsert rows into `SUPABASE_TABLE`
  - each row shape: `{ url }`

#### 2.4 Keep watcher behavior unchanged

- Continue:
  - polling cadence
  - scraping/parsing logic
  - unseen filtering
  - image download + email digest
- Only persistence backend changes.

---

### 3) Database schema and setup documentation

**File:** `hat-watcher-ts/README.md`

Document required SQL:

```sql
create table if not exists public.seen_products (
  url text primary key,
  first_seen_at timestamptz not null default now()
);
```

Document env additions in setup section:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `SUPABASE_TABLE=seen_products`

---

### 4) TODO tracking updates

**File:** `hat-watcher-ts/TODO.md`

- Keep checklist aligned with implementation progress
- Mark testing/reporting steps only after execution and confirmation

---

### 5) Validation plan (critical-path)

Run in `hat-watcher-ts`:

1. `npm install`
2. `npm run typecheck`
3. `npm run build`

Optional runtime sanity:

- Start watcher with valid env config and verify startup + first poll path.

---

## Dependent Files to Edit

- `hat-watcher-ts/package.json`
- `hat-watcher-ts/src/index.ts`
- `hat-watcher-ts/README.md`
- `hat-watcher-ts/TODO.md`

---

## Notes / Risks

- Use **service role key** only in trusted runtime environments; never expose in client-side code.
- If RLS is enabled, configure policies appropriately or rely on service role server-side execution.
- Supabase network failures should surface clear errors and avoid silent data loss.

---

## Expected Outcome

- Seen-product state is persisted in Supabase table instead of local files.
- Existing watcher behavior remains intact.
- Project setup docs include Supabase prerequisites and schema.
