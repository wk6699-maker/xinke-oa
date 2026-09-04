import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (
      !match ||
      match[1].startsWith("#") ||
      process.env[match[1]] !== undefined
    )
      continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadDotEnv();
const port = Number(process.env.API_PORT || 8788);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const distDir = resolve(projectRoot, "dist");
const uploadsDir = resolve(process.env.UPLOADS_PATH || "./uploads");
const maxUploadBodyBytes = 140 * 1024 * 1024;
const maxUploadFileBytes = 100 * 1024 * 1024;
mkdirSync(uploadsDir, { recursive: true });
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
const databaseName = process.env.MYSQL_DATABASE || "xinke_oa";
const storagePreference = String(
  process.env.STORAGE_MODE || "sqlite",
).toLowerCase();

function getDatabaseConfig() {
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname || "127.0.0.1",
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username || "root"),
      password: decodeURIComponent(url.password || ""),
      database:
        decodeURIComponent(url.pathname.replace(/^\//, "")) || databaseName,
    };
  }
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: databaseName,
  };
}

const dbConfig = getDatabaseConfig();
const sqlitePath = resolve(
  projectRoot,
  process.env.SQLITE_PATH || "./data/xinke-email.sqlite",
);
const allowSqliteFallback =
  String(process.env.LOCAL_SQLITE_FALLBACK || "true").toLowerCase() !== "false";
let sqliteDb;
let storageMode = "mysql";
let pool;
const smtpConfig = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
  user: process.env.SMTP_USER || "",
  password: process.env.SMTP_PASSWORD || "",
  from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
};
let smtpTransport;
let schedulerTimer;
const emailTestAttempts = new Map();
const sessions = new Map();
const pendingUploads = new Map();
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const STATE_MAX_BYTES = 5 * 1024 * 1024;

function sessionCookie(
  token,
  maxAge = Math.floor(SESSION_IDLE_TIMEOUT_MS / 1000),
) {
  return `xinke_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
}

function sendUnauthorized(res) {
  send(res, 401, { error: "Authentication required" });
}

function passwordHash(password) {
  const salt = randomUUID();
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored) return false;
  if (!stored.startsWith("scrypt$")) {
    const supplied = Buffer.from(password);
    const expected = Buffer.from(stored);
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  }
  const [, salt, encoded] = stored.split("$");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validPassword(value) {
  const password = String(value || "");
  const kinds = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ].filter(Boolean).length;
  return password.length >= 8 && kinds >= 3;
}

function cleanExpiredSecurityState() {
  const now = Date.now();
  for (const [token, session] of sessions)
    if (session.lastActivity + SESSION_IDLE_TIMEOUT_MS <= now)
      sessions.delete(token);
  for (const [id, upload] of pendingUploads)
    if (upload.expiresAt <= now) pendingUploads.delete(id);
}

function currentSession(req, res) {
  cleanExpiredSecurityState();
  const bearer = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const cookieToken =
    String(req.headers.cookie || "")
      .split(/;\s*/)
      .find((value) => value.startsWith("xinke_session="))
      ?.slice("xinke_session=".length) || "";
  const token = bearer || cookieToken;
  const session = token ? sessions.get(token) : undefined;
  if (!session) return null;
  session.lastActivity = Date.now();
  if (res && !res.headersSent)
    res.setHeader("set-cookie", sessionCookie(token));
  return { token, ...session };
}

function publicUser(user) {
  if (!user || typeof user !== "object") return user;
  const { password, passwordHash: ignoredHash, ...safe } = user;
  return safe;
}

function publicPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    users: Array.isArray(payload.users) ? payload.users.map(publicUser) : [],
  };
}

function permissionSet(payload, userId) {
  const user = Array.isArray(payload?.users)
    ? payload.users.find((item) => item.id === userId)
    : null;
  if (!user) return { user: null, permissions: new Set() };
  if (user.role === "管理员") return { user, permissions: new Set(["*"]) };
  const group = Array.isArray(payload?.permissionGroups)
    ? payload.permissionGroups.find(
        (item) => item.id === user.permissionGroupId,
      )
    : null;
  return {
    user,
    permissions: new Set(
      Array.isArray(group?.permissions) ? group.permissions : [],
    ),
  };
}

function hasAnyPermission(payload, userId, permissions) {
  const current = permissionSet(payload, userId);
  return (
    current.permissions.has("*") ||
    permissions.some((permission) => current.permissions.has(permission))
  );
}

function requireAnyPermission(payload, userId, permissions) {
  if (!hasAnyPermission(payload, userId, permissions)) {
    const error = new Error("FORBIDDEN");
    throw error;
  }
}
function requireArrayChangePermission(current, next, key, userId, permissions) {
  const before = Array.isArray(current?.[key]) ? current[key] : [];
  const after = Array.isArray(next?.[key]) ? next[key] : [];
  const beforeMap = new Map(
    before
      .filter((item) => item && item.id != null)
      .map((item) => [String(item.id), item]),
  );
  const afterMap = new Map(
    after
      .filter((item) => item && item.id != null)
      .map((item) => [String(item.id), item]),
  );
  const added = [...afterMap.keys()].some((id) => !beforeMap.has(id));
  const removed = [...beforeMap.keys()].some((id) => !afterMap.has(id));
  const changed = [...afterMap.keys()].some(
    (id) =>
      beforeMap.has(id) && !sameValue(beforeMap.get(id), afterMap.get(id)),
  );
  if (added) requireAnyPermission(current, userId, permissions.create);
  if (changed) requireAnyPermission(current, userId, permissions.edit);
  if (removed) requireAnyPermission(current, userId, permissions.delete);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeCompanyName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function ensureUniqueClientCompanies(clients) {
  const companies = new Map();
  for (const client of Array.isArray(clients) ? clients : []) {
    const normalized = normalizeCompanyName(client?.company);
    if (!normalized) continue;
    if (companies.has(normalized)) throw new Error("DUPLICATE_CLIENT_COMPANY");
    companies.set(normalized, client?.id);
  }
}

function ensureDocumentIdsImmutable(currentPayload, nextPayload, key) {
  const currentItems = Array.isArray(currentPayload?.[key])
    ? currentPayload[key]
    : [];
  const nextItems = Array.isArray(nextPayload?.[key]) ? nextPayload[key] : [];
  const nextById = new Map(
    nextItems
      .filter((item) => item && item.id != null)
      .map((item) => [String(item.id), item]),
  );
  for (const item of currentItems) {
    if (!item || item.id == null || !item.docId) continue;
    const updated = nextById.get(String(item.id));
    if (updated && String(updated.docId || "") !== String(item.docId))
      throw new Error("DOCUMENT_ID_IMMUTABLE");
  }
}

function preserveAndHashUsers(currentUsers, incomingUsers) {
  const previous = new Map(
    (Array.isArray(currentUsers) ? currentUsers : []).map((user) => [
      user.id,
      user,
    ]),
  );
  if (!Array.isArray(incomingUsers)) throw new Error("INVALID_USERS");
  return incomingUsers.map((incoming) => {
    const current = previous.get(incoming?.id);
    const next = { ...incoming };
    const submittedPassword =
      typeof incoming?.password === "string" ? incoming.password : "";
    delete next.password;
    if (current) {
      next.passwordHash = submittedPassword
        ? passwordHash(submittedPassword)
        : current.passwordHash?.startsWith?.("scrypt$")
          ? current.passwordHash
          : current.password
            ? passwordHash(current.password)
            : "";
    } else {
      if (!validPassword(submittedPassword))
        throw new Error("INVALID_NEW_USER_PASSWORD");
      next.passwordHash = passwordHash(submittedPassword);
    }
    return next;
  });
}

function normalizeIncomingPayload(currentPayload, incomingPayload, userId) {
  if (
    !incomingPayload ||
    typeof incomingPayload !== "object" ||
    Array.isArray(incomingPayload)
  )
    throw new Error("INVALID_STATE");
  const current = currentPayload || {};
  const next = { ...incomingPayload };
  next.users = preserveAndHashUsers(current.users, incomingPayload.users);
  const actor = (current.users || []).find((item) => item.id === userId);
  const actorIsAdmin = actor?.role === "管理员";
  if (!actorIsAdmin) {
    const before = (current.users || []).find((item) => item.id === userId);
    const after = (next.users || []).find((item) => item.id === userId);
    if (
      !before ||
      !after ||
      before.role !== after.role ||
      before.permissionGroupId !== after.permissionGroupId ||
      before.status !== after.status
    )
      throw new Error("FORBIDDEN");
  }
  const changed = (key) => !sameValue(current[key], next[key]);

  // A fee document is the parent key for payments and costs. Keep it stable so
  // historical links and arrears references cannot be broken by an edit.
  ensureDocumentIdsImmutable(current, next, "records");
  ensureDocumentIdsImmutable(current, next, "dailyExpenses");

  if (changed("users") || changed("permissionGroups"))
    requireAnyPermission(current, userId, ["users"]);
  if (changed("clients"))
    ensureUniqueClientCompanies(next.clients);
  if (changed("clients"))
    requireArrayChangePermission(current, next, "clients", userId, {
      create: ["clientCreate"],
      edit: ["clientEdit"],
      delete: ["clientDelete"],
    });
  if (changed("clientGroups") || changed("clientSubgroups"))
    requireAnyPermission(current, userId, ["clientGroups"]);
  if (changed("regionCatalog"))
    requireAnyPermission(current, userId, [
      "clientProvince",
      "clientCity",
      "clientDistrict",
    ]);
  if (changed("records"))
    requireArrayChangePermission(current, next, "records", userId, {
      create: ["feeCreate"],
      edit: ["feeEdit"],
      delete: ["feeDelete"],
    });
  if (changed("payments"))
    requireArrayChangePermission(current, next, "payments", userId, {
      create: ["paymentCreate", "feePayment"],
      edit: ["paymentEdit"],
      delete: ["paymentDelete"],
    });
  if (changed("costs"))
    requireArrayChangePermission(current, next, "costs", userId, {
      create: ["costCreate"],
      edit: ["costEdit"],
      delete: ["costDelete"],
    });
  if (changed("dailyExpenses"))
    requireArrayChangePermission(current, next, "dailyExpenses", userId, {
      create: ["dailyExpenseCreate"],
      edit: ["dailyExpenseEdit"],
      delete: ["dailyExpenseDelete"],
    });
  if (changed("customerInfos"))
    requireArrayChangePermission(current, next, "customerInfos", userId, {
      create: ["infoCreate"],
      edit: ["infoEdit"],
      delete: ["infoDelete"],
    });
  if (changed("feeTypes")) requireAnyPermission(current, userId, ["feeTypes"]);
  if (changed("employees"))
    requireAnyPermission(current, userId, ["employees"]);
  if (changed("costTypes"))
    requireAnyPermission(current, userId, ["costTypes"]);
  if (changed("suppliers") || changed("supplierDetails"))
    requireAnyPermission(current, userId, ["costSuppliers"]);
  if (changed("reimbursers"))
    requireAnyPermission(current, userId, [
      "costReimbursers",
      "dailyExpenseReimbursers",
    ]);
  if (changed("dailyExpenseTypes"))
    requireAnyPermission(current, userId, ["dailyExpenseTypes"]);
  if (changed("emailSchedule"))
    requireAnyPermission(current, userId, ["users"]);
  return next;
}

async function getPool() {
  if (!pool) {
    const mysqlModule = await import("mysql2/promise");
    const mysql = mysqlModule.default;
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      queueLimit: 0,
      charset: "utf8mb4",
      dateStrings: true,
    });
  }
  return pool;
}

async function getSmtpTransport() {
  if (
    !smtpConfig.host ||
    !smtpConfig.user ||
    !smtpConfig.password ||
    !smtpConfig.from
  )
    throw new Error("SMTP_NOT_CONFIGURED");
  if (!smtpTransport) {
    const nodemailerModule = await import("nodemailer");
    const nodemailer = nodemailerModule.default;
    smtpTransport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user
        ? { user: smtpConfig.user, pass: smtpConfig.password }
        : undefined,
      tls: {
        rejectUnauthorized:
          String(
            process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true",
          ).toLowerCase() !== "false",
      },
    });
  }
  return smtpTransport;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeRecipients(value) {
  const recipients = [
    ...new Set(
      (Array.isArray(value) ? value : String(value || "").split(/[;,\s]+/))
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (
    !recipients.length ||
    recipients.length > 100 ||
    recipients.some((item) => !emailPattern.test(item))
  )
    throw new Error("INVALID_RECIPIENTS");
  return recipients;
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reminderRecords(payload, now = new Date()) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const clients = Array.isArray(payload?.clients) ? payload.clients : [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 10);
  return records
    .filter((record) => {
      const paid =
        Number(record.paid || 0) +
        payments
          .filter((payment) => payment.docId === record.docId)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      if (Number(record.fee || 0) <= paid || !record.paymentDate) return false;
      const due = new Date(`${record.paymentDate}T00:00:00`);
      return !Number.isNaN(due.getTime()) && due <= limit;
    })
    .map((record) => {
      const paid =
        Number(record.paid || 0) +
        payments
          .filter((payment) => payment.docId === record.docId)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const client = clients.find((item) => item.id === record.clientId);
      return `${client?.company || "未知客户"} | 单据ID ${record.docId || record.id} | 预计支付 ${record.paymentDate || "待定"} | 未付款 ${money(Number(record.fee || 0) - paid)}`;
    });
}

function scheduleBucket(frequency, date) {
  if (frequency === "monthly")
    return `${date.getFullYear()}-${date.getMonth() + 1}`;
  if (frequency === "weekly") {
    const monday = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
  }
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function isScheduleDue(schedule, now) {
  if (
    !schedule?.enabled ||
    !Array.isArray(schedule.recipients) ||
    !schedule.recipients.length
  )
    return false;
  const [hour, minute] = String(schedule.sendTime || "09:00")
    .split(":")
    .map(Number);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    now.getHours() * 60 + now.getMinutes() < hour * 60 + minute
  )
    return false;
  if (schedule.frequency === "weekly") {
    const selectedDay = Math.min(7, Math.max(1, Number(schedule.weekDay || 1)));
    const currentDay = now.getDay() || 7;
    if (currentDay !== selectedDay) return false;
  }
  if (schedule.frequency === "monthly") {
    const selectedDay = Math.min(
      31,
      Math.max(1, Number(schedule.monthDay || 1)),
    );
    const lastDayOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    if (now.getDate() !== Math.min(selectedDay, lastDayOfMonth)) return false;
  }
  const currentBucket = scheduleBucket(schedule.frequency, now);
  return (
    !schedule.lastAutoSentAt ||
    scheduleBucket(schedule.frequency, new Date(schedule.lastAutoSentAt)) !==
      currentBucket
  );
}

async function sendReminderEmail(
  payload,
  recipients,
  now,
  reason = "scheduled",
) {
  const lines = reminderRecords(payload, now);
  const body = `昕科OA系统收款提醒\n\n${lines.length ? lines.join("\n") : "当前没有预计支付时间在10天内或已过期的未付款记录。"}\n\n此邮件由昕科OA系统自动生成。`;
  const subject = `收款提醒 · ${now.toLocaleDateString("zh-CN")}`;
  await (
    await getSmtpTransport()
  ).sendMail({
    from: smtpConfig.from,
    to: recipients.join(", "),
    subject,
    text: body,
    headers: { "X-Xinke-OA-Email": reason },
  });
  return { subject, count: lines.length };
}

async function initDatabase() {
  if (storagePreference === "sqlite") {
    const sqliteModule = await import("node:sqlite").catch(() => null);
    if (!sqliteModule?.DatabaseSync)
      throw new Error("SQLite runtime is unavailable");
    if (!existsSync(sqlitePath))
      throw new Error(`SQLite file not found: ${sqlitePath}`);
    sqliteDb = new sqliteModule.DatabaseSync(sqlitePath);
    storageMode = "sqlite";
    console.log(`Using local SQLite state at ${sqlitePath}.`);
    return;
  }
  try {
    await (
      await getPool()
    ).query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        version BIGINT UNSIGNED NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        CONSTRAINT app_state_singleton CHECK (id = 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return;
  } catch (error) {
    if (!allowSqliteFallback || !existsSync(sqlitePath)) throw error;
    // Load SQLite only when the fallback is actually needed so MySQL deployments
    // remain compatible with server runtimes that do not provide node:sqlite.
    const sqliteModule = await import("node:sqlite").catch(() => null);
    if (!sqliteModule?.DatabaseSync) throw error;
    sqliteDb = new sqliteModule.DatabaseSync(sqlitePath);
    storageMode = "sqlite";
    console.warn(
      `MySQL unavailable (${error.message}); using local SQLite state at ${sqlitePath}.`,
    );
  }
}

async function readState(connection, forUpdate = false) {
  if (storageMode === "sqlite") {
    const row = sqliteDb
      .prepare(
        "SELECT version, payload, updated_at FROM app_state WHERE id = 1",
      )
      .get();
    if (!row) return { version: 0, payload: null, updatedAt: null };
    return {
      version: Number(row.version),
      payload: JSON.parse(row.payload),
      updatedAt: row.updated_at,
    };
  }
  const activeConnection = connection || (await getPool());
  const [rows] = await activeConnection.query(
    `SELECT version, payload, updated_at FROM app_state WHERE id = 1${forUpdate ? " FOR UPDATE" : ""}`,
  );
  const row = rows[0];
  if (!row) return { version: 0, payload: null, updatedAt: null };
  return {
    version: Number(row.version),
    payload: JSON.parse(row.payload),
    updatedAt: row.updated_at,
  };
}

async function writeState(expectedVersion, payload) {
  if (storageMode === "sqlite") {
    const current = await readState();
    if (current.version !== expectedVersion) return null;
    const nextVersion = current.version + 1;
    const updatedAt = new Date().toISOString();
    sqliteDb
      .prepare(
        "UPDATE app_state SET version = ?, payload = ?, updated_at = ? WHERE id = 1",
      )
      .run(nextVersion, JSON.stringify(payload), updatedAt);
    return { version: nextVersion, payload, updatedAt };
  }
  const connection = await (await getPool()).getConnection();
  try {
    await connection.beginTransaction();
    const current = await readState(connection, true);
    if (current.version !== expectedVersion) {
      await connection.rollback();
      return null;
    }
    const nextVersion = current.version + 1;
    const updatedAt = new Date();
    if (current.payload === null) {
      await connection.query(
        "INSERT INTO app_state (id, version, payload, updated_at) VALUES (1, ?, ?, ?)",
        [nextVersion, JSON.stringify(payload), updatedAt],
      );
    } else {
      await connection.query(
        "UPDATE app_state SET version = ?, payload = ?, updated_at = ? WHERE id = 1",
        [nextVersion, JSON.stringify(payload), updatedAt],
      );
    }
    await connection.commit();
    return {
      version: nextVersion,
      payload,
      updatedAt: updatedAt.toISOString(),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

const send = (res, status, body) => {
  const json = JSON.stringify(body);
  // currentSession() may set a renewal cookie before the route serializes its body.
  // Preserve headers already queued on the response so writeHead() cannot drop it.
  res.writeHead(status, {
    ...res.getHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(json);
};

const sendWithHeaders = (res, status, body, headers = {}) => {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...res.getHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(json);
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const allowedUploadExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
]);
function isAllowedUpload(name, mime) {
  const extension = extname(String(name || "")).toLowerCase();
  return allowedUploadExtensions.has(extension);
}
function uploadFilePath(filename) {
  const decoded = decodeURIComponent(filename);
  const filePath = resolve(uploadsDir, decoded);
  return filePath.startsWith(`${uploadsDir}${sep}`) ? filePath : null;
}
function attachmentPermission(payload, userId, attachmentId) {
  const collections = [
    ["records", ["fee", "feeCreate", "feeEdit", "feeDelete"]],
    [
      "payments",
      [
        "payment",
        "paymentCreate",
        "paymentEdit",
        "paymentDelete",
        "feePayment",
      ],
    ],
    ["costs", ["cost", "costCreate", "costEdit", "costDelete"]],
    [
      "dailyExpenses",
      [
        "dailyExpenses",
        "dailyExpenseCreate",
        "dailyExpenseEdit",
        "dailyExpenseDelete",
      ],
    ],
  ];
  for (const [key, permissions] of collections) {
    const item = (payload?.[key] || []).find((record) =>
      (record.attachments || []).some(
        (attachment) => attachment.id === attachmentId,
      ),
    );
    if (item) return hasAnyPermission(payload, userId, permissions);
  }
  return false;
}

async function serveUpload(req, res, pathname) {
  const session = currentSession(req, res);
  if (!session) {
    sendUnauthorized(res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }
  let filename;
  try {
    filename = decodeURIComponent(pathname.slice("/uploads/".length));
  } catch {
    send(res, 400, { error: "Invalid URL" });
    return;
  }
  const filePath = uploadFilePath(filename);
  const state = await readState();
  const pending = pendingUploads.get(filename);
  if (
    !attachmentPermission(state.payload, session.userId, filename) &&
    pending?.userId !== session.userId
  ) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  if (!filePath || basename(filePath) !== filename || !existsSync(filePath)) {
    send(res, 404, { error: "File not found" });
    return;
  }
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, {
      ...res.getHeaders(),
      "content-type":
        contentTypes[extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "content-disposition": "inline",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
  } catch {
    send(res, 404, { error: "File not found" });
  }
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      .pathname;
  } catch {
    return "/";
  }
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }
  const pathname = requestPath(req);
  let relativePath;
  try {
    relativePath = decodeURIComponent(
      pathname === "/" ? "/index.html" : pathname,
    );
  } catch {
    send(res, 400, { error: "Invalid URL" });
    return;
  }
  let filePath = resolve(distDir, `.${relativePath}`);
  const isInsideDist =
    filePath === distDir || filePath.startsWith(`${distDir}${sep}`);
  if (!isInsideDist || !existsSync(filePath))
    filePath = resolve(distDir, "index.html");
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, {
      ...res.getHeaders(),
      "content-type":
        contentTypes[extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "cache-control":
        extname(filePath) === ".html"
          ? "no-cache"
          : "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
  } catch {
    send(res, 404, { error: "Not found" });
  }
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      reject(new Error("PAYLOAD_TOO_LARGE"));
      return;
    }
    let raw = "";
    let rejected = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (rejected) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) {
        rejected = true;
        reject(new Error("PAYLOAD_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolveBody(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function runScheduledEmail() {
  try {
    const state = await readState();
    if (
      !state.payload ||
      !isScheduleDue(state.payload.emailSchedule, new Date())
    )
      return;
    const schedule = state.payload.emailSchedule;
    const now = new Date();
    const recipients = normalizeRecipients(schedule.recipients);
    await sendReminderEmail(state.payload, recipients, now, "scheduled");
    const nextPayload = {
      ...state.payload,
      emailSchedule: {
        ...schedule,
        recipients,
        lastAutoSentAt: now.toISOString(),
        lastSentAt: now.toISOString(),
        lastError: undefined,
      },
    };
    if (!(await writeState(state.version, nextPayload)))
      console.warn(
        "Scheduled email sent, but state version changed before last-send timestamp could be saved.",
      );
    else
      console.log(
        `Scheduled reminder email sent to ${recipients.length} recipient(s).`,
      );
  } catch (error) {
    if (error?.message === "SMTP_NOT_CONFIGURED") return;
    console.error("Scheduled reminder email failed:", error?.message || error);
  }
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, if-match, authorization",
    });
    res.end();
    return;
  }
  const pathname = requestPath(req);
  if (pathname === "/api/auth/login" && req.method === "POST") {
    readJsonBody(req)
      .then(async (body) => {
        try {
          const state = await readState();
          const identifier = String(body.identifier || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "");
          const password = String(body.password || "");
          const user = (state.payload?.users || []).find((item) =>
            [item.username, item.email, item.phone].some(
              (value) =>
                String(value || "")
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, "") === identifier,
            ),
          );
          const credential = user?.passwordHash || user?.password || "";
          if (
            !user ||
            user.status === "停用" ||
            !verifyPassword(password, credential)
          ) {
            send(res, 401, { error: "Invalid credentials" });
            return;
          }
          if (!user.passwordHash) {
            const payload = {
              ...state.payload,
              users: state.payload.users.map((item) =>
                item.id === user.id
                  ? {
                      ...item,
                      passwordHash: passwordHash(password),
                      password: undefined,
                    }
                  : item,
              ),
            };
            const saved = await writeState(state.version, payload);
            if (saved)
              Object.assign(
                user,
                saved.payload.users.find((item) => item.id === user.id),
              );
          }
          const token = randomUUID();
          sessions.set(token, { userId: user.id, lastActivity: Date.now() });
          sendWithHeaders(
            res,
            200,
            { user: publicUser(user) },
            { "set-cookie": sessionCookie(token) },
          );
        } catch (error) {
          console.error("Login failed:", error?.message || error);
          send(res, 500, { error: "Login unavailable" });
        }
      })
      .catch(() => send(res, 400, { error: "Invalid login payload" }));
    return;
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const session = currentSession(req);
    if (session) sessions.delete(session.token);
    sendWithHeaders(res, 204, null, { "set-cookie": sessionCookie("", 0) });
    return;
  }
  if (pathname === "/api/auth/me" && req.method === "GET") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    readState()
      .then((state) => {
        const { user } = permissionSet(state.payload, session.userId);
        if (!user || user.status === "停用") {
          sessions.delete(session.token);
          sendUnauthorized(res);
          return;
        }
        send(res, 200, { user: publicUser(user) });
      })
      .catch(() => send(res, 503, { error: "Database unavailable" }));
    return;
  }
  if (pathname === "/api/auth/password" && req.method === "POST") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    readJsonBody(req)
      .then(async (body) => {
        try {
          const password = String(body.password || "");
          if (!validPassword(password)) {
            send(res, 400, { error: "INVALID_PASSWORD" });
            return;
          }
          const state = await readState();
          const { user } = permissionSet(state.payload, session.userId);
          if (!user) {
            sendUnauthorized(res);
            return;
          }
          const payload = {
            ...state.payload,
            users: state.payload.users.map((item) =>
              item.id === user.id
                ? {
                    ...item,
                    passwordHash: passwordHash(password),
                    password: undefined,
                    mustChangePassword: false,
                  }
                : item,
            ),
          };
          const saved = await writeState(state.version, payload);
          if (!saved) {
            send(res, 409, { error: "State conflict" });
            return;
          }
          send(res, 200, {
            user: publicUser(
              saved.payload.users.find((item) => item.id === user.id),
            ),
          });
        } catch (error) {
          send(res, error?.message === "FORBIDDEN" ? 403 : 400, {
            error: "Password update failed",
          });
        }
      })
      .catch(() => send(res, 400, { error: "Invalid password payload" }));
    return;
  }
  const resetPasswordMatch = pathname.match(
    /^\/api\/users\/([^/]+)\/reset-password$/,
  );
  if (resetPasswordMatch && req.method === "POST") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    readJsonBody(req)
      .then(async (body) => {
        try {
          const password = String(body.password || "");
          if (!validPassword(password)) {
            send(res, 400, { error: "INVALID_PASSWORD" });
            return;
          }
          const state = await readState();
          requireAnyPermission(state.payload, session.userId, ["users"]);
          const userId = decodeURIComponent(resetPasswordMatch[1]);
          if (!state.payload.users.some((item) => item.id === userId)) {
            send(res, 404, { error: "User not found" });
            return;
          }
          const payload = {
            ...state.payload,
            users: state.payload.users.map((item) =>
              item.id === userId
                ? {
                    ...item,
                    passwordHash: passwordHash(password),
                    password: undefined,
                    mustChangePassword: true,
                  }
                : item,
            ),
          };
          const saved = await writeState(state.version, payload);
          if (!saved) {
            send(res, 409, { error: "State conflict" });
            return;
          }
          send(res, 200, {
            user: publicUser(
              saved.payload.users.find((item) => item.id === userId),
            ),
          });
        } catch (error) {
          send(res, error?.message === "FORBIDDEN" ? 403 : 400, {
            error: "Password reset failed",
          });
        }
      })
      .catch(() => send(res, 400, { error: "Invalid password payload" }));
    return;
  }
  if (pathname.startsWith("/uploads/")) {
    void serveUpload(req, res, pathname).catch((error) => {
      console.error("Upload read failed:", error?.message || error);
      send(res, 500, { error: "File read failed" });
    });
    return;
  }
  if (pathname === "/api/uploads" && req.method === "POST") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    readJsonBody(req, maxUploadBodyBytes)
      .then((body) => {
        try {
          const name = basename(String(body.name || "附件"));
          const mime = String(body.mime || "").toLowerCase();
          const dataUrl = String(body.dataUrl || "");
          const match = dataUrl.match(/^data:[^;,]+;base64,([\s\S]+)$/);
          if (!name || !match || !isAllowedUpload(name, mime)) {
            send(res, 400, { error: "Unsupported file type" });
            return;
          }
          const buffer = Buffer.from(match[1], "base64");
          if (!buffer.length || buffer.length > maxUploadFileBytes) {
            send(res, 413, { error: "File too large" });
            return;
          }
          const extension = extname(name).toLowerCase();
          const filename = `upload-${randomUUID()}${extension}`;
          writeFileSync(resolve(uploadsDir, filename), buffer, { flag: "wx" });
          pendingUploads.set(filename, {
            userId: session.userId,
            expiresAt: Date.now() + SESSION_IDLE_TIMEOUT_MS,
          });
          send(res, 201, {
            attachment: {
              id: filename,
              name,
              mime:
                contentTypes[extension] || mime || "application/octet-stream",
              size: buffer.length,
              url: `/uploads/${encodeURIComponent(filename)}`,
            },
          });
        } catch (error) {
          console.error("Upload failed:", error?.message || error);
          send(res, 400, { error: "File upload failed" });
        }
      })
      .catch((error) =>
        send(res, error?.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
          error:
            error?.message === "PAYLOAD_TOO_LARGE"
              ? "Request too large"
              : "Invalid upload",
        }),
      );
    return;
  }
  if (pathname.startsWith("/api/uploads/") && req.method === "DELETE") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    let filename;
    try {
      filename = decodeURIComponent(pathname.slice("/api/uploads/".length));
    } catch {
      send(res, 400, { error: "Invalid URL" });
      return;
    }
    const filePath = uploadFilePath(filename);
    if (!filePath || basename(filePath) !== filename) {
      send(res, 400, { error: "Invalid file path" });
      return;
    }
    readState()
      .then((state) => {
        const pending = pendingUploads.get(filename);
        if (
          !attachmentPermission(state.payload, session.userId, filename) &&
          pending?.userId !== session.userId
        ) {
          send(res, 403, { error: "Forbidden" });
          return;
        }
        try {
          if (existsSync(filePath)) unlinkSync(filePath);
          pendingUploads.delete(filename);
          send(res, 204, null);
        } catch {
          send(res, 500, { error: "File delete failed" });
        }
      })
      .catch(() => send(res, 503, { error: "Database unavailable" }));
    return;
  }
  if (pathname === "/api/email/status" && req.method === "GET") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    send(res, 200, {
      configured: Boolean(
        smtpConfig.host &&
          smtpConfig.user &&
          smtpConfig.password &&
          smtpConfig.from,
      ),
      provider:
        smtpConfig.host === "smtp.qiye.aliyun.com"
          ? "aliyun-enterprise"
          : "custom",
      from: smtpConfig.from || null,
    });
    return;
  }
  if (pathname === "/api/email/test" && req.method === "POST") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    const clientAddress = req.socket.remoteAddress || "unknown";
    const nowMs = Date.now();
    const recentAttempts = (emailTestAttempts.get(clientAddress) || []).filter(
      (timestamp) => nowMs - timestamp < 10 * 60 * 1000,
    );
    if (recentAttempts.length >= 5) {
      send(res, 429, { error: "测试发送次数过多，请10分钟后再试" });
      return;
    }
    recentAttempts.push(nowMs);
    emailTestAttempts.set(clientAddress, recentAttempts);
    readJsonBody(req)
      .then(async (body) => {
        try {
          const state = await readState();
          requireAnyPermission(state.payload, session.userId, ["users"]);
          const recipients = normalizeRecipients(body.recipients);
          const result = await sendReminderEmail(
            state.payload || {},
            recipients,
            new Date(),
            "test",
          );
          if (state.payload) {
            const nextPayload = {
              ...state.payload,
              emailSchedule: {
                ...state.payload.emailSchedule,
                recipients,
                lastTestAt: new Date().toISOString(),
                lastError: undefined,
              },
            };
            await writeState(state.version, nextPayload);
          }
          send(res, 200, { sent: true, recipients, ...result });
        } catch (error) {
          const code = error?.message;
          const status =
            code === "SMTP_NOT_CONFIGURED"
              ? 503
              : code === "INVALID_RECIPIENTS"
                ? 400
                : code === "FORBIDDEN"
                  ? 403
                  : 502;
          const messages = {
            SMTP_NOT_CONFIGURED:
              "SMTP尚未配置，请联系管理员补充企业邮箱SMTP信息",
            INVALID_RECIPIENTS: "收件邮箱格式不正确",
          };
          send(res, status, { error: messages[code] || "邮件发送失败" });
        }
      })
      .catch((error) =>
        send(res, error?.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
          error:
            error?.message === "PAYLOAD_TOO_LARGE"
              ? "Request too large"
              : "Invalid JSON",
        }),
      );
    return;
  }
  if (pathname === "/api/state" && req.method === "GET") {
    const session = currentSession(req, res);
    if (!session) {
      sendUnauthorized(res);
      return;
    }
    readState()
      .then((state) => {
        if (!permissionSet(state.payload, session.userId).user) {
          sessions.delete(session.token);
          sendUnauthorized(res);
          return;
        }
        send(res, 200, { ...state, payload: publicPayload(state.payload) });
      })
      .catch((error) => {
        console.error("MySQL read failed:", error.message);
        send(res, 503, { error: "Database unavailable" });
      });
    return;
  }
  if (pathname === "/api/state" && req.method !== "PUT") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }
  if (pathname !== "/api/state") {
    serveStatic(req, res);
    return;
  }
  const session = currentSession(req, res);
  if (!session) {
    sendUnauthorized(res);
    return;
  }
  readJsonBody(req, STATE_MAX_BYTES)
    .then((body) => {
      (async () => {
        try {
          // Accept both the application's numeric header and the quoted ETag form
          // produced by standards-compliant HTTP clients.
          const expectedVersion = Number(
            String(req.headers["if-match"] || "")
              .trim()
              .replace(/^"|"$/g, ""),
          );
          if (
            !Number.isInteger(expectedVersion) ||
            !body.payload ||
            typeof body.payload !== "object"
          ) {
            send(res, 400, { error: "Invalid state payload" });
            return;
          }
          const current = await readState();
          if (current.version !== expectedVersion) {
            send(res, 409, {
              error: "State conflict",
              version: current.version,
              payload: publicPayload(current.payload),
              updatedAt: current.updatedAt,
            });
            return;
          }
          const payload = normalizeIncomingPayload(
            current.payload,
            body.payload,
            session.userId,
          );
          const saved = await writeState(expectedVersion, payload);
          if (!saved) {
            const latest = await readState();
            send(res, 409, {
              error: "State conflict",
              ...latest,
              payload: publicPayload(latest.payload),
            });
            return;
          }
          send(res, 200, { ...saved, payload: publicPayload(saved.payload) });
        } catch (error) {
          console.error("MySQL write failed:", error.message);
          const databaseError =
            typeof error?.code === "string" && error.code.startsWith("ER_");
          const forbidden = error?.message === "FORBIDDEN";
          const invalidUser = [
            "INVALID_NEW_USER_PASSWORD",
            "INVALID_USERS",
            "INVALID_STATE",
            "DOCUMENT_ID_IMMUTABLE",
            "DUPLICATE_CLIENT_COMPANY",
          ].includes(error?.message);
          send(
            res,
            databaseError ? 503 : forbidden ? 403 : invalidUser ? 400 : 400,
            {
              error: databaseError
                ? "Database unavailable"
                : forbidden
                  ? "Forbidden"
                  : invalidUser
                    ? error.message
                    : "Invalid JSON",
            },
          );
        }
      })();
    })
    .catch((error) =>
      send(res, error?.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
        error:
          error?.message === "PAYLOAD_TOO_LARGE"
            ? "Request too large"
            : "Invalid JSON",
      }),
    );
});

async function shutdown(signal) {
  console.log(`${signal} received, closing ${storageMode} storage`);
  if (schedulerTimer) clearInterval(schedulerTimer);
  server.close(() =>
    Promise.all([pool?.end?.(), sqliteDb?.close?.()]).finally(() =>
      process.exit(0),
    ),
  );
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

initDatabase()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      const storageLabel =
        storageMode === "sqlite"
          ? `SQLite ${sqlitePath}`
          : `MySQL ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
      console.log(
        `Xinke state API listening on http://127.0.0.1:${port} (${storageLabel})`,
      );
      void runScheduledEmail();
      schedulerTimer = setInterval(() => {
        void runScheduledEmail();
      }, 60000);
    });
  })
  .catch((error) => {
    console.error(
      `Unable to initialize MySQL database ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port}:`,
      error.message,
    );
    console.error(
      "Set MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE, or DATABASE_URL.",
    );
    void (pool?.end?.() ?? Promise.resolve()).finally(() => process.exit(1));
  });
