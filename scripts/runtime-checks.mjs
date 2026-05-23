import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const url = required("SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const table = process.env.SUPABASE_TABLE || "seen_products";

  const supabase = createClient(url, key);
  const probe = `https://runtime-check.local/${Date.now()}`;
  const missingTable = `seen_products__missing_probe_${Date.now()}`;

  const results = {
    table,
    selectOk: false,
    upsertOk: false,
    dedupeOk: false,
    cleanupOk: false,
    missingTableOk: false,
  };

  const selectRes = await supabase.from(table).select("url").limit(1);
  if (selectRes.error) throw new Error(`select failed: ${selectRes.error.message}`);
  results.selectOk = true;

  const firstUpsert = await supabase
    .from(table)
    .upsert([{ url: probe }], { onConflict: "url", ignoreDuplicates: true });
  if (firstUpsert.error) {
    throw new Error(`first upsert failed: ${firstUpsert.error.message}`);
  }
  results.upsertOk = true;

  const secondUpsert = await supabase
    .from(table)
    .upsert([{ url: probe }], { onConflict: "url", ignoreDuplicates: true });
  if (secondUpsert.error) {
    throw new Error(`second upsert failed: ${secondUpsert.error.message}`);
  }

  const verify = await supabase
    .from(table)
    .select("url", { count: "exact", head: false })
    .eq("url", probe);
  if (verify.error) throw new Error(`verify failed: ${verify.error.message}`);
  results.dedupeOk = (verify.count ?? 0) === 1;

  const deleteRes = await supabase.from(table).delete().eq("url", probe);
  if (deleteRes.error) throw new Error(`cleanup failed: ${deleteRes.error.message}`);
  results.cleanupOk = true;

  const missing = await supabase.from(missingTable).select("url").limit(1);
  results.missingTableOk = Boolean(
    missing.error && missing.error.message.includes("Could not find the table")
  );

  if (!results.missingTableOk) {
    throw new Error("missing-table behavior check failed");
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`runtime checks failed: ${msg}`);
  process.exit(1);
});
