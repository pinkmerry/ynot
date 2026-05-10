import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
function loadEnvFile(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const ref = new URL(url).hostname.split('.')[0];
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = resolve(root, `../Database/backups/pre-migration-${stamp}`);
mkdirSync(outDir, { recursive: true });
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const tables = ['profiles','admin_users','draw_rounds','draw_slots','orders','payment_slips','order_picks','audit_events','cards','draw_round_prizes','lucky_draw_realtime_events'];
const manifest = { createdAt: new Date().toISOString(), projectRef: ref, type: 'service-role-json-data-export', warning: 'Contains production data/PII. Do not commit.', limitation: 'Data-only REST export. Not a full Supabase backup; does not include Auth internals, roles, policies, functions, extensions, or Storage objects.', tables: [], storage: { buckets: [] } };
for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*');
  const file = `${table}.json`;
  if (error) {
    manifest.tables.push({ table, ok: false, count: null, file: null, error: { code: error.code ?? 'UNKNOWN', message: error.message } });
    continue;
  }
  const json = JSON.stringify(data ?? [], null, 2);
  writeFileSync(join(outDir, file), json + '\n');
  manifest.tables.push({ table, ok: true, count: (data ?? []).length, file, sha256: crypto.createHash('sha256').update(json + '\n').digest('hex'), error: null });
}
const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) {
  manifest.storage.error = { code: bucketError.code ?? 'UNKNOWN', message: bucketError.message };
} else {
  for (const bucket of buckets ?? []) {
    if (!['payment-slips','lucky-draw-assets'].includes(bucket.name)) continue;
    const listing = { name: bucket.name, id: bucket.id, public: bucket.public, objects: 0, folders: 0, samplesRedacted: [], errors: [] };
    async function walk(prefix='', depth=0) {
      if (depth > 4) return;
      for (let offset=0; offset<1000; offset += 100) {
        const { data, error } = await supabase.storage.from(bucket.name).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' }});
        if (error) { listing.errors.push({ prefixHash: crypto.createHash('sha256').update(prefix).digest('hex').slice(0,12), code: error.code ?? 'UNKNOWN', message: error.message }); return; }
        if (!data || data.length === 0) break;
        for (const item of data) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          const isFolder = !item.id && !item.metadata;
          if (isFolder) { listing.folders++; await walk(path, depth+1); }
          else { listing.objects++; if (listing.samplesRedacted.length < 10) listing.samplesRedacted.push({ pathHash: crypto.createHash('sha256').update(path).digest('hex').slice(0,12) }); }
        }
        if (data.length < 100) break;
      }
    }
    await walk();
    manifest.storage.buckets.push(listing);
  }
}
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(join(outDir, 'manifest.json'), manifestText);
console.log(JSON.stringify({ outDir, projectRef: ref, tableCounts: Object.fromEntries(manifest.tables.map(t => [t.table, t.count])), storage: manifest.storage.buckets.map(b => ({ name: b.name, objects: b.objects, folders: b.folders, errors: b.errors.length })), manifestSha256: crypto.createHash('sha256').update(manifestText).digest('hex') }, null, 2));
