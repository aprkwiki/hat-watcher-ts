import "dotenv/config";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

type Product = {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  localImagePath?: string;
};

const COLLECTION_URL =
  process.env.COLLECTION_URL ??
  "https://www.grassrootscalifornia.com/collections/new";
const POLL_MINUTES = Number(process.env.POLL_MINUTES ?? "60");
const STATE_DIR = process.env.STATE_DIR ?? "hat-watcher/state";
const IMAGE_DIR = process.env.IMAGE_DIR ?? "hat-watcher/images";
const STATE_FILE = path.join(STATE_DIR, "seen.json");

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "";
const EMAIL_TO = process.env.EMAIL_TO ?? "";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertRequiredEnv(): void {
  const missing = [
    ["SMTP_HOST", SMTP_HOST],
    ["SMTP_USER", SMTP_USER],
    ["SMTP_PASS", SMTP_PASS],
    ["EMAIL_FROM", EMAIL_FROM],
    ["EMAIL_TO", EMAIL_TO],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(IMAGE_DIR, { recursive: true });
}

async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

async function saveSeen(seen: Set<string>): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify([...seen], null, 2), "utf8");
}

function absolutize(base: string, value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; hat-watcher-ts/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return await response.text();
}

function parseProducts(html: string): Product[] {
  const $ = cheerio.load(html);
  const linkSelectors = [
    'a[href*="/products/"]',
    ".product-card a[href*='/products/']",
    ".grid-product a[href*='/products/']",
  ];

  const products: Product[] = [];
  const dedupe = new Set<string>();

  for (const selector of linkSelectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr("href");
      const url = absolutize(COLLECTION_URL, href);
      if (!url || dedupe.has(url)) return;

      dedupe.add(url);

      const card = $(el).closest(
        "li, .product-card, .grid-product, .card, .grid__item"
      );

      const title =
        $(el).attr("title")?.trim() ||
        card
          .find(".product-title, .grid-product__title, .card__heading")
          .first()
          .text()
          .trim() ||
        $(el).text().trim() ||
        "Untitled";

      const description =
        card
          .find(".product-description, .card__excerpt, .grid-product__meta")
          .first()
          .text()
          .trim() || "";

      const imageEl = $(el).find("img").first().length
        ? $(el).find("img").first()
        : card.find("img").first();

      const src =
        imageEl.attr("src") ??
        imageEl.attr("data-src") ??
        imageEl
          .attr("srcset")
          ?.split(",")
          .map((v) => v.trim().split(" ")[0])[0] ??
        null;

      const imageUrl = absolutize(COLLECTION_URL, src);

      products.push({
        url,
        title,
        description,
        imageUrl,
      });
    });

    if (products.length > 0) break;
  }

  return products;
}

function safeFileName(input: string): string {
  return input.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

async function downloadImage(url: string, outPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": "hat-watcher-ts/1.0" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Image download failed (${res.status}) ${url}`);
  }

  const fileStream = createWriteStream(outPath);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);
}

async function sendDigestEmail(newItems: Product[]): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const attachments = [];
  let html = `<h2>New hats found (${newItems.length})</h2><ul>`;

  for (const item of newItems) {
    const attachedName = item.localImagePath
      ? path.basename(item.localImagePath)
      : null;

    if (item.localImagePath) {
      attachments.push({
        filename: attachedName ?? "image.jpg",
        path: item.localImagePath,
      });
    }

    html += `<li>
      <p><strong>${item.title}</strong></p>
      <p>${item.description || "(No description found on listing card)"}</p>
      <p><a href="${item.url}">${item.url}</a></p>
      ${attachedName ? `<p>Attached image: ${attachedName}</p>` : ""}
    </li>`;
  }

  html += "</ul>";

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject: `Grassroots new hats: ${newItems.length} new item(s)`,
    html,
    attachments,
  });
}

async function runOnce(): Promise<void> {
  await ensureDirs();
  const seen = await loadSeen();

  const html = await fetchHtml(COLLECTION_URL);
  const products = parseProducts(html);

  const unseen = products.filter((p) => !seen.has(p.url));
  if (unseen.length === 0) {
    console.log("No new hats found.");
    return;
  }

  for (let i = 0; i < unseen.length; i++) {
    const p = unseen[i];
    if (!p.imageUrl) continue;

    try {
      const pathname = new URL(p.imageUrl).pathname;
      const ext = path.extname(pathname) || ".jpg";
      const filename = `${Date.now()}_${i}_${safeFileName(p.title)}${ext}`;
      const target = path.join(IMAGE_DIR, filename);
      await downloadImage(p.imageUrl, target);
      p.localImagePath = target;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Failed image download for ${p.url}: ${msg}`);
    }
  }

  await sendDigestEmail(unseen);

  for (const p of unseen) seen.add(p.url);
  await saveSeen(seen);

  console.log(`Sent digest for ${unseen.length} new hat(s).`);
}

async function main(): Promise<void> {
  assertRequiredEnv();
  console.log(
    `Starting hat watcher. Polling every ${POLL_MINUTES} minute(s) from ${COLLECTION_URL}`
  );

  // Run immediately, then poll
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Run failed: ${msg}`);
    }

    await sleep(POLL_MINUTES * 60 * 1000);
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`Fatal startup error: ${msg}`);
  process.exit(1);
});
