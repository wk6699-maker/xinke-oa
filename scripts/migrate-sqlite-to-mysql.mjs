import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadDotEnv();
const sourcePath = resolve(process.env.SQLITE_PATH || './data/xinke-email.sqlite');
const replace = process.argv.includes('--replace');
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
const databaseName = process.env.MYSQL_DATABASE || 'xinke_oa';

function getDatabaseConfig() {
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return { host: url.hostname || '127.0.0.1', port: Number(url.port || 3306), user: decodeURIComponent(url.username || 'root'), password: decodeURIComponent(url.password || ''), database: decodeURIComponent(url.pathname.replace(/^\//, '')) || databaseName };
  }
  return { host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '', database: databaseName };
}

if (!existsSync(sourcePath)) throw new Error(`SQLite file not found: ${sourcePath}`);
const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
const source = sqlite.prepare('SELECT version, payload, updated_at FROM app_state WHERE id = 1').get();
sqlite.close();
if (!source) throw new Error('SQLite app_state is empty. Nothing to migrate.');

function toMySqlDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SQLite updated_at value: ${value}`);
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

const pool = mysql.createPool({ ...getDatabaseConfig(), waitForConnections: true, connectionLimit: 2, charset: 'utf8mb4', dateStrings: true });
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, version BIGINT UNSIGNED NOT NULL, payload LONGTEXT NOT NULL, updated_at DATETIME(3) NOT NULL, CONSTRAINT app_state_singleton CHECK (id = 1)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [rows] = await pool.query('SELECT id FROM app_state WHERE id = 1');
  if (rows.length && !replace) throw new Error('MySQL app_state already contains data. Use --replace to overwrite it.');
  await pool.query('INSERT INTO app_state (id, version, payload, updated_at) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE version = VALUES(version), payload = VALUES(payload), updated_at = VALUES(updated_at)', [Number(source.version), source.payload, toMySqlDateTime(source.updated_at)]);
  console.log(`Migrated version ${source.version} from ${sourcePath} to MySQL.`);
} finally {
  await pool.end();
}
