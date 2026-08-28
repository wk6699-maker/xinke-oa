import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sourcePath = resolve(process.env.SQLITE_PATH || './data/xinke-email.sqlite');
const backupDir = resolve(process.env.RESTORE_BACKUP_DIR || './backups/aliyun-restores');
const apply = process.argv.includes('--apply');

if (!apply) {
  throw new Error('Refusing to modify SQLite without --apply. Pipe the remote /api/state JSON and rerun with --apply.');
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
const remote = JSON.parse(input);
if (!Number.isInteger(remote?.version) || !remote?.payload || typeof remote.payload !== 'object') {
  throw new Error('Remote response does not contain a valid version and payload.');
}

const requiredArrays = ['clients', 'clientGroups', 'clientSubgroups', 'records', 'payments', 'costs', 'dailyExpenses', 'customerInfos', 'permissionGroups', 'feeTypes', 'employees', 'costTypes', 'dailyExpenseTypes', 'reimbursers', 'suppliers', 'auditLogs', 'users'];
for (const key of requiredArrays) {
  if (!Array.isArray(remote.payload[key])) throw new Error(`Remote payload field ${key} is not an array.`);
}
for (const key of ['supplierDetails', 'emailSchedule', 'regionCatalog']) {
  if (!remote.payload[key] || typeof remote.payload[key] !== 'object' || Array.isArray(remote.payload[key])) throw new Error(`Remote payload field ${key} is not an object.`);
}
for (const key of ['records', 'payments', 'costs', 'dailyExpenses']) {
  for (const item of remote.payload[key]) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') throw new Error(`Remote payload ${key} contains an invalid item.`);
    if (item.attachments !== undefined && !Array.isArray(item.attachments)) throw new Error(`Remote payload ${key} contains invalid attachments.`);
  }
}

if (!existsSync(sourcePath)) throw new Error(`SQLite file not found: ${sourcePath}`);
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dbBackupPath = resolve(backupDir, `${basename(sourcePath, '.sqlite')}-before-${stamp}.sqlite`);
const jsonBackupPath = resolve(backupDir, `aliyun-state-${stamp}.json`);
copyFileSync(sourcePath, dbBackupPath);
writeFileSync(jsonBackupPath, JSON.stringify(remote, null, 2) + '\n', 'utf8');

const db = new DatabaseSync(sourcePath);
try {
  const current = db.prepare('SELECT id FROM app_state WHERE id = 1').get();
  const payload = JSON.stringify(remote.payload);
  const updatedAt = String(remote.updatedAt || new Date().toISOString());
  if (current) {
    db.prepare('UPDATE app_state SET version = ?, payload = ?, updated_at = ? WHERE id = 1').run(remote.version, payload, updatedAt);
  } else {
    db.prepare('INSERT INTO app_state (id, version, payload, updated_at) VALUES (1, ?, ?, ?)').run(remote.version, payload, updatedAt);
  }
} finally {
  db.close();
}

console.log(JSON.stringify({
  sourcePath,
  restoredVersion: remote.version,
  updatedAt: remote.updatedAt || null,
  counts: Object.fromEntries(requiredArrays.map(key => [key, remote.payload[key].length])),
  dbBackupPath,
  jsonBackupPath,
}, null, 2));
