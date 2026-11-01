
"use strict";
require("dotenv").config({ quiet: true });
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const mysql = require("mysql2/promise");
const { isIP } = require("node:net");

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0100-01-01" || value > "9998-12-31") return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validate(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw problem(400, "ข้อมูลต้องเป็น JSON object");
  const allowed = ["subject", "detail", "deadline", "done", "importKey"];
  if (Object.keys(body).some(key => !allowed.includes(key)) || !Object.keys(body).length) throw problem(400, "พบข้อมูลที่ไม่รองรับ");
  if (partial && Object.hasOwn(body, "importKey")) throw problem(400, "แก้ไข importKey ไม่ได้");
  const result = {};
  if (!partial || Object.hasOwn(body, "subject")) {
    if (typeof body.subject !== "string" || !body.subject.trim() || body.subject.length > 80) throw problem(400, "กรุณากรอกชื่อวิชาไม่เกิน 80 ตัวอักษร");
    result.subject = body.subject.trim();
  }
  if (!partial || Object.hasOwn(body, "detail")) {
    const detail = body.detail === undefined ? "" : body.detail;
    if (typeof detail !== "string" || detail.length > 2000) throw problem(400, "รายละเอียดต้องไม่เกิน 2000 ตัวอักษร");
    result.detail = detail.trim();
  }
  if (!partial || Object.hasOwn(body, "deadline")) {
    if (!validDate(body.deadline)) throw problem(400, "กรุณาระบุวันกำหนดส่งให้ถูกต้อง");
    result.deadline = body.deadline;
  }
  if (Object.hasOwn(body, "done")) {
    if (typeof body.done !== "boolean") throw problem(400, "สถานะ done ต้องเป็น true หรือ false");
    result.done = body.done;
  }
  if (Object.hasOwn(body, "importKey")) {
    if (typeof body.importKey !== "string" || !/^[a-f0-9]{64}$/.test(body.importKey)) throw problem(400, "รหัสนำเข้าไม่ถูกต้อง");
    result.importKey = body.importKey;
  }
  return result;
}
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
}

// Keep the storage adapter separate from HTTP handlers; one process owns this JSON file.
function createStore(directory) {
  const root = path.resolve(directory);
  const file = path.join(root, "homework.json");
  let queue = Promise.resolve();
  async function safePath(target, allowMissing = false) {
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Unsafe data path");
      const real = await fs.realpath(target);
      if (path.dirname(real) !== root) throw new Error("Data outside storage root");
    } catch (error) {
      if (!(allowMissing && error.code === "ENOENT")) throw error;
    }
  }
  async function read() {
    await safePath(file);
    const stat = await fs.stat(file);
    if (stat.size > 8 * 1024 * 1024) throw new Error("Data capacity exceeded");
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(data)) throw new Error("Invalid database");
    const ids = new Set();
    for (const item of data) {
      if (!item || typeof item.id !== "string" || ids.has(item.id) || typeof item.done !== "boolean") throw new Error("Invalid stored item");
      validate({ subject: item.subject, detail: item.detail, deadline: item.deadline, done: item.done });
      ids.add(item.id);
    }
    return data;
  }
  async function initialize() {
    await fs.mkdir(root, { recursive: true });
    if ((await fs.realpath(root)) !== root || (await fs.lstat(root)).isSymbolicLink()) throw new Error("Unsafe storage directory");
    await safePath(file, true);
    try { await fs.writeFile(file, "[]\n", { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    await read();
  }
  function mutate(change) {
    const operation = queue.then(async () => {
      const data = await read();
      const result = change(data);
      const content = JSON.stringify(data, null, 2) + "\n";
      if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw problem(507, "พื้นที่จัดเก็บเต็ม กรุณาสำรองข้อมูล");
      const temp = path.join(root, ".homework-" + randomUUID() + ".tmp");
      await safePath(file);
      await safePath(file + ".bak", true);
      // Preserve the previous committed version, then atomically replace the database.
      await fs.copyFile(file, file + ".bak");
      try {
        const handle = await fs.open(temp, "wx", 0o600);
        try { await handle.writeFile(content, "utf8"); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temp, file);
      } finally { await fs.rm(temp, { force: true }); }
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { initialize, read: async () => { await queue; return read(); }, mutate };
}
function createDatabaseStore() {
  for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[key]) throw new Error("Missing database configuration");
  }
  // Runtime DB users are platform-managed and can differ from the owner's LAN account.
  if (process.env.DB_NAME !== "db_std11_p01") throw new Error("Project database mismatch");
  const dbPort = Number(process.env.DB_PORT);
  if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error("Invalid database port");
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: dbPort, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4, maxIdle: 2, idleTimeout: 30000, connectTimeout: 10000, waitForConnections: true, queueLimit: 32, dateStrings: true, charset: "utf8mb4", multipleStatements: false, enableKeepAlive: true });
  let writes = Promise.resolve(), pendingWrites = 0;
  const serialize = operation => {
    if (pendingWrites >= 32) return Promise.reject(problem(503, "มีคำขอจำนวนมาก กรุณาลองใหม่ภายหลัง"));
    pendingWrites++;
    const result = writes.then(operation).finally(() => { pendingWrites--; });
    writes = result.catch(() => {});
    return result;
  };
  const columns = "id, subject, detail, deadline, done, import_key, created_at, updated_at";
  const map = row => ({ id: row.id, subject: row.subject, detail: row.detail, deadline: row.deadline, done: Boolean(row.done), createdAt: row.created_at, ...(row.updated_at ? { updatedAt: row.updated_at } : {}), ...(row.import_key ? { importKey: row.import_key } : {}) });
  const ownerCheck = owner => { if (typeof owner !== "string" || !/^[a-f0-9]{64}$/.test(owner)) throw problem(401, "กรุณาเปิดคุกกี้แล้วโหลดหน้าเว็บใหม่"); };
  async function health() {
    const [rows] = await pool.query("SELECT DATABASE() AS db");
    if (rows[0].db !== "db_std11_p01") throw new Error("Wrong database");
    await pool.query("SELECT " + columns + ", owner_hash FROM homework_entries LIMIT 0");
  }
  async function get(owner, id) {
    ownerCheck(owner);
    const [rows] = await pool.execute("SELECT " + columns + " FROM homework_entries WHERE owner_hash = ? AND id = ?", [owner, id]);
    if (!rows.length) throw problem(404, "ไม่พบการบ้านรายการนี้");
    return map(rows[0]);
  }
  return {
    initialize: health, health, close: () => pool.end(),
    async read(owner) {
      ownerCheck(owner);
      const [rows] = await pool.execute("SELECT " + columns + " FROM homework_entries WHERE owner_hash = ? ORDER BY deadline, id LIMIT 5001", [owner]);
      if (rows.length > 5000) throw problem(507, "จำนวนงานเกินขีดจำกัด กรุณาติดต่อเจ้าของโปรเจกต์");
      return rows.map(map);
    },
    async stats(owner) {
      ownerCheck(owner);
      const day = today();
      const [rows] = await pool.execute("SELECT COUNT(*) AS total, COALESCE(SUM(done = 1), 0) AS done, COALESCE(SUM(done = 0 AND deadline < ?), 0) AS overdue FROM homework_entries WHERE owner_hash = ?", [day, owner]);
      const total = Number(rows[0].total), done = Number(rows[0].done);
      return { total, done, pending: total - done, overdue: Number(rows[0].overdue), completion: total ? Math.round(done / total * 100) : 0, today: day };
    },
    get,
    create(owner, fields) {
      ownerCheck(owner);
      return serialize(async () => {
        if (fields.importKey) {
          const [existing] = await pool.execute("SELECT " + columns + " FROM homework_entries WHERE owner_hash = ? AND import_key = ?", [owner, fields.importKey]);
          if (existing.length) return { item: map(existing[0]), created: false };
        }
        const [counts] = await pool.query("SELECT COUNT(*) AS total FROM homework_entries");
        if (Number(counts[0].total) >= 5000) throw problem(507, "โปรเจกต์รองรับการบ้านรวมสูงสุด 5,000 รายการ");
        const id = randomUUID();
        try {
          await pool.execute("INSERT INTO homework_entries (id, owner_hash, subject, detail, deadline, done, import_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, owner, fields.subject, fields.detail, fields.deadline, fields.done === true ? 1 : 0, fields.importKey || null, new Date().toISOString()]);
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY" && fields.importKey) {
            const [rows] = await pool.execute("SELECT " + columns + " FROM homework_entries WHERE owner_hash = ? AND import_key = ?", [owner, fields.importKey]);
            if (rows.length) return { item: map(rows[0]), created: false };
          }
          throw error;
        }
        return { item: await get(owner, id), created: true };
      });
    },
    async update(owner, id, fields) {
      ownerCheck(owner);
      const keys = Object.keys(fields);
      if (!keys.length || keys.some(key => !["subject", "detail", "deadline", "done"].includes(key))) throw problem(400, "พบข้อมูลที่ไม่รองรับ");
      const [result] = await pool.execute("UPDATE homework_entries SET subject = COALESCE(?, subject), detail = COALESCE(?, detail), deadline = COALESCE(?, deadline), done = COALESCE(?, done), updated_at = ? WHERE owner_hash = ? AND id = ?", [fields.subject ?? null, fields.detail ?? null, fields.deadline ?? null, fields.done === undefined ? null : Number(fields.done), new Date().toISOString(), owner, id]);
      if (!result.affectedRows) throw problem(404, "ไม่พบการบ้านรายการนี้");
      return get(owner, id);
    },
    async remove(owner, id) {
      ownerCheck(owner);
      const [result] = await pool.execute("DELETE FROM homework_entries WHERE owner_hash = ? AND id = ?", [owner, id]);
      if (!result.affectedRows) throw problem(404, "ไม่พบการบ้านรายการนี้");
    }
  };
}
function calendar(item) {
  const compact = value => value.replaceAll("-", "");
  const next = new Date(item.deadline + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const escape = value => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//My Homework//p01//TH", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", "UID:" + createHash("sha256").update(item.id).digest("hex") + "@my-homework", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), "DTSTART;VALUE=DATE:" + compact(item.deadline), "DTEND;VALUE=DATE:" + compact(next.toISOString().slice(0, 10)), "SUMMARY:" + escape("การบ้าน: " + item.subject), "DESCRIPTION:" + escape(item.detail), "END:VEVENT", "END:VCALENDAR"];
  // RFC 5545 folding counts UTF-8 octets, not JavaScript string characters.
  return lines.map(line => {
    const chunks = []; let chunk = ""; let size = 0;
    for (const char of line) {
      const bytes = Buffer.byteLength(char);
      if (size + bytes > 75) { chunks.push(chunk); chunk = " "; size = 1; }
      chunk += char; size += bytes;
    }
    chunks.push(chunk); return chunks.join("\r\n");
  }).join("\r\n") + "\r\n";
}
function createApp(store) {
  const app = express();
  const authMode = process.env.AUTH_MODE ?? "cookie";
  if (!["cookie", "bearer"].includes(authMode)) throw new Error("Invalid AUTH_MODE");
  let appOrigin = null;
  if (process.env.APP_ORIGIN !== undefined) {
    appOrigin = new URL(process.env.APP_ORIGIN);
    if (!["http:", "https:"].includes(appOrigin.protocol) || appOrigin.origin !== process.env.APP_ORIGIN || appOrigin.username || appOrigin.password) throw new Error("APP_ORIGIN must be an exact HTTP(S) origin without path or credentials");
    if (authMode === "cookie" && (appOrigin.protocol !== "https:" || isIP(appOrigin.hostname.replace(/^\[|\]$/g, "")) || !appOrigin.hostname.includes(".") || appOrigin.port || process.env.COOKIE_SECURE !== "true")) throw new Error("Cookie APP_ORIGIN requires a dedicated HTTPS hostname and COOKIE_SECURE=true");
    if (authMode === "bearer" && appOrigin.protocol === "http:") {
      const octets = appOrigin.hostname.split(".").map(Number);
      const lan = isIP(appOrigin.hostname) === 4 && (octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168 || octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
      if (!lan || !appOrigin.port) throw new Error("Bearer HTTP requires an approved private LAN IPv4 origin with explicit non-default port");
    }
  }
  if (authMode === "bearer" && !appOrigin) throw new Error("Bearer mode requires APP_ORIGIN");
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" });
    next();
  });
  app.use((req, res, next) => {
    // Never trust forwarded headers: the private proxy must preserve the approved Host.
    const host = req.get("Host") || "";
    const hostCount = req.rawHeaders.filter((header, index) => index % 2 === 0 && header.toLowerCase() === "host").length;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host);
    if (hostCount !== 1 || (appOrigin ? host !== appOrigin.host : !local)) return next(problem(403, "Host ไม่ได้รับอนุญาต"));
    if (req.get("Sec-Fetch-Site") === "cross-site") return next(problem(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์"));
    const origin = req.get("Origin");
    if (origin !== undefined) {
      const expected = appOrigin ? appOrigin.origin : (req.secure ? "https://" : "http://") + host;
      if (origin !== expected) return next(problem(403, "Origin ไม่ได้รับอนุญาต"));
    }
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("Sec-Fetch-Site") === "cross-site") return next(problem(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์"));
      const origin = req.get("Origin");
      if (origin) {
        try {
          const source = new URL(origin);
          if (appOrigin ? source.origin !== appOrigin.origin : source.host !== req.get("host")) return next(problem(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์"));
        } catch { return next(problem(403, "Origin ไม่ถูกต้อง")); }
      }
      if ((req.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") return next(problem(415, "กรุณาส่ง application/json"));
    }
    next();
  });
  app.use(express.json({ limit: "16kb", strict: false }));
  const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  const cookieName = appOrigin ? "__Host-homework_p01" : "homework_p01";
  function tokenFrom(req) {
    const matches = (req.get("Cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(cookieName + "="));
    if (matches.length !== 1) return null;
    const token = matches[0].slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
  app.get("/api/health", route(async (req, res) => {
    await store.health();
    res.json({ success: true, status: "ready" });
  }));
  app.get("/api/session", (req, res, next) => {
    if (req.get("Sec-Fetch-Site") === "cross-site") return next(problem(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์"));
    if (authMode === "bearer" || req.get("X-Session-Mode") === "only") return res.json({ success: true, authMode });
    if (!tokenFrom(req)) {
      const token = randomBytes(32).toString("hex");
      res.cookie(cookieName, token, { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true" || req.secure, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    }
    res.json({ success: true, authMode });
  });
  app.use("/api", (req, res, next) => {
    const authorization = req.get("Authorization") || "";
    const authorizationCount = req.rawHeaders.filter((header, index) => index % 2 === 0 && header.toLowerCase() === "authorization").length;
    const token = authMode === "bearer" ? (authorizationCount === 1 && /^Bearer [a-f0-9]{64}$/.test(authorization) ? authorization.slice(7) : null) : tokenFrom(req);
    if (!token) return next(problem(401, "ไม่พบตัวตนสมุดส่วนตัวที่ถูกต้อง กรุณาตรวจการจัดเก็บของเบราว์เซอร์"));
    req.owner = createHash("sha256").update(token).digest("hex");
    next();
  });
  app.param("id", (req, res, next, id) => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) return next(problem(404, "ไม่พบการบ้านรายการนี้"));
    next();
  });
  app.get("/api/homework", route(async (req, res) => {
    const data = await store.read(req.owner);
    res.json({ success: true, count: data.length, today: today(), data });
  }));
  app.get("/api/stats", route(async (req, res) => {
    res.json({ success: true, data: await store.stats(req.owner) });
  }));
  app.get("/api/homework/:id/calendar.ics", route(async (req, res) => {
    const item = await store.get(req.owner, req.params.id);
    res.set({ "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=homework.ics" }).send(calendar(item));
  }));
  app.get("/api/homework/:id", route(async (req, res) => res.json({ success: true, data: await store.get(req.owner, req.params.id) })));
  app.post("/api/homework", route(async (req, res) => {
    const result = await store.create(req.owner, validate(req.body));
    res.status(result.created ? 201 : 200).json({ success: true, data: result.item });
  }));
  app.patch("/api/homework/:id", route(async (req, res) => {
    const item = await store.update(req.owner, req.params.id, validate(req.body, true));
    res.json({ success: true, data: item });
  }));
  app.delete("/api/homework/:id", route(async (req, res) => {
    await store.remove(req.owner, req.params.id);
    res.json({ success: true });
  }));
  app.use("/api", (req, res) => res.status(404).json({ success: false, message: "ไม่พบ API ที่ร้องขอ" }));
  const assets = { "/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/index.js": "index.js" };
  const publicRoot = path.join(__dirname, "public");
  app.get(["/", "/index.html", "/style.css", "/index.js"], route(async (req, res) => {
    const file = path.join(publicRoot, assets[req.path]);
    if ((await fs.realpath(file)) !== file) throw problem(404, "ไม่พบไฟล์");
    res.sendFile(file, { dotfiles: "deny", maxAge: 0 });
  }));
  app.use((req, res) => res.status(404).json({ success: false, message: "ไม่พบหน้าที่ร้องขอ" }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === "entity.too.large" ? 413 : error.type === "entity.parse.failed" ? 400 : error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500) console.error("Request failed:", error.code || error.name);
    const message = status === 413 ? "ข้อมูลมีขนาดใหญ่เกินไป" : status === 400 && error.type === "entity.parse.failed" ? "JSON ไม่ถูกต้อง" : status >= 500 ? "ไม่สามารถบันทึกหรืออ่านข้อมูลได้ กรุณาลองใหม่" : error.message;
    res.status(status).json({ success: false, message });
  });
  return app;
}
async function startServer() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Set a valid PORT in .env");
  if (process.env.COOKIE_SECURE !== undefined && !["true", "false"].includes(process.env.COOKIE_SECURE)) throw new Error("Invalid COOKIE_SECURE");
  const store = createDatabaseStore();
  try { await store.initialize(); }
  catch (error) { await store.close(); throw error; }
  const server = createApp(store).listen(port, process.env.HOST || "0.0.0.0", () => console.log("My Homework p01 listening on configured port"));
  server.on("error", () => { console.error("Unable to listen on configured port"); void store.close(); process.exitCode = 1; });
  server.on("close", () => { void store.close(); });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
  return server;
}
if (require.main === module) startServer().catch(() => { console.error("Startup failed; check project DB configuration and applied schema. No migration was run and existing data was not reset."); process.exitCode = 1; });
module.exports = { createApp, createStore, createDatabaseStore, validDate, calendar, startServer };
