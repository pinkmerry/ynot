import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, extname, relative } from 'node:path';
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
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
    process.env[key] = value;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');
function projectRefFromUrl(value) {
  try { return new URL(value).hostname.split('.')[0] || 'unknown'; } catch { return 'unknown'; }
}
function hostFromUrl(value) {
  try { return new URL(value).hostname; } catch { return 'unknown'; }
}
function errInfo(error) {
  if (!error) return null;
  return { code: error.code ?? 'UNKNOWN', message: error.message ?? String(error) };
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = projectRefFromUrl(url ?? '');
const result = {
  generatedAt: new Date().toISOString(),
  mode: 'read-only inventory; no writes/migrations/restores/deploys/storage mutations',
  env: {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(key),
    SUPABASE_ACCESS_TOKEN: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
    POSTGRES_URL: Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL),
  },
  supabase: { projectRef, host: hostFromUrl(url ?? '') },
  tableCounts: {},
  websiteSchemaGaps: { tables: {}, columns: {}, rpcs: {} },
  adminRoleSummary: null,
  storage: { buckets: [], expectedBuckets: {}, note: 'Object names are hashed/redacted; no objects downloaded or modified.' },
  backup: { managementApi: null, existingLocalRestBackup: null },
};
if (!url || !key) {
  result.fatal = 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for read-only REST inventory';
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
async function tableCount(table) {
  const availability = await supabase.from(table).select('id').limit(1);
  if (availability.error) return { status: 'missing_or_unavailable', error: errInfo(availability.error) };
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return error ? { status: 'available_count_unavailable', availability: 'select id passed', error: errInfo(error) } : { status: 'available', count };
}
for (const table of ['profiles','admin_users','draw_rounds','draw_slots','orders','payment_slips','order_picks','audit_events','cards','draw_round_prizes','lucky_draw_realtime_events']) {
  result.tableCounts[table] = await tableCount(table);
}
for (const table of ['store_categories','draw_round_categories','draw_round_prize_units','seed_runs','user_identities','user_addresses','app_realtime_events','payment_methods','top_up_requests','wallet_accounts','coin_ledger','gacha_opens','gacha_open_items','collection_items','exchange_orders','exchange_order_items','shipping_requests','shipping_request_items','site_settings','ranking_snapshots']) {
  result.websiteSchemaGaps.tables[table] = await tableCount(table);
}
async function columnProbe(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return error ? { status: 'missing_or_unavailable', error: errInfo(error) } : { status: 'available' };
}
for (const [table, col] of [['profiles','auth_user_id'], ['profiles','line_user_id'], ['cards','tone'], ['draw_round_prizes','tone']]) {
  result.websiteSchemaGaps.columns[`${table}.${col}`] = await columnProbe(table, col);
}
async function rpcProbe(name, args) {
  const { error } = await supabase.rpc(name, args);
  return error ? { status: 'missing_or_unavailable', error: errInfo(error) } : { status: 'available' };
}
result.websiteSchemaGaps.rpcs.get_draw_round_inventory_summary = await rpcProbe('get_draw_round_inventory_summary', { p_draw_round_id: '00000000-0000-0000-0000-000000000000', p_profile_id: null });
result.websiteSchemaGaps.rpcs.create_draw_slots = { status: 'not_probed_mutation_sensitive', note: 'Existing mutating RPC; not invoked during Phase 1 read-only inventory.' };
result.websiteSchemaGaps.rpcs.claim_order_slots = { status: 'not_probed_mutation_sensitive', note: 'Existing mutating RPC; not invoked during Phase 1 read-only inventory.' };
{
  const { data, error } = await supabase.from('admin_users').select('role').limit(5000);
  if (error) result.adminRoleSummary = { status: 'unavailable', error: errInfo(error) };
  else {
    const roles = {};
    for (const row of data ?? []) roles[row.role ?? 'unknown'] = (roles[row.role ?? 'unknown'] ?? 0) + 1;
    result.adminRoleSummary = { status: 'available', total: data?.length ?? 0, roles };
  }
}
function hashPath(p) { return crypto.createHash('sha256').update(p).digest('hex').slice(0,12); }
async function listPrefix(bucket, prefix='', depth=0, acc={objects:0, folders:0, samples:[], errors:[]}) {
  if (depth > 4) return acc;
  for (let offset=0; offset<1000; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' }});
    if (error) { acc.errors.push({ prefixHash: hashPath(prefix), error: errInfo(error) }); return acc; }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && !item.metadata;
      if (isFolder) {
        acc.folders += 1;
        if (acc.samples.length < 10) acc.samples.push({ kind: 'folder', depth, pathHash: hashPath(path), ext: '' });
        await listPrefix(bucket, path, depth+1, acc);
      } else {
        acc.objects += 1;
        if (acc.samples.length < 10) acc.samples.push({ kind: 'object', depth, pathHash: hashPath(path), ext: extname(path).slice(0,16) });
      }
    }
    if (data.length < 100) break;
  }
  return acc;
}
{
  const { data, error } = await supabase.storage.listBuckets();
  result.storage.buckets = error ? { status:'unavailable', error: errInfo(error) } : (data ?? []).map(b => ({ id: b.id, name: b.name, public: b.public, created_at: b.created_at, updated_at: b.updated_at }));
  for (const bucket of ['payment-slips','lucky-draw-assets']) {
    const found = Array.isArray(result.storage.buckets) && result.storage.buckets.some(b => b.name === bucket || b.id === bucket);
    result.storage.expectedBuckets[bucket] = found ? await listPrefix(bucket) : { status:'missing_from_bucket_list' };
  }
}
{
  const backupPath = '/Users/pinkmerry/Project X/Lucky Draw/Database/backups/pre-migration-20260507T090736Z';
  if (existsSync(backupPath)) {
    const files=[];
    function walk(dir) {
      for (const name of readdirSync(dir)) {
        const p=join(dir,name); const s=statSync(p);
        if (s.isDirectory()) walk(p);
        else {
          const buf=readFileSync(p);
          files.push({ path: relative(backupPath,p), bytes:s.size, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
        }
      }
    }
    walk(backupPath);
    result.backup.existingLocalRestBackup = { status:'present_data_only_rest_backup', path: backupPath, fileCount: files.length, totalBytes: files.reduce((a,f)=>a+f.bytes,0), files };
  } else {
    result.backup.existingLocalRestBackup = { status:'missing', path: backupPath };
  }
}
if (process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }});
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0,500) }; }
    result.backup.managementApi = { statusCode: res.status, ok: res.ok, bodySummary: Array.isArray(parsed) ? { count: parsed.length, items: parsed.map((b)=>({ id: b.id ?? b.name ?? null, inserted_at: b.inserted_at ?? b.created_at ?? b.started_at ?? null, status: b.status ?? b.type ?? null })).slice(0,10) } : parsed };
  } catch (e) { result.backup.managementApi = { status:'request_failed', message:String(e) }; }
} else {
  result.backup.managementApi = { status:'not_checked_missing_SUPABASE_ACCESS_TOKEN' };
}
console.log(JSON.stringify(result, null, 2));
