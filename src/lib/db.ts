// SQLite（Node 內建 node:sqlite）連線與 schema。零外部相依，單檔即可部署。
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notice TEXT NOT NULL DEFAULT '',
  brand_color TEXT NOT NULL DEFAULT '#0b6b53',
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  slot_interval INTEGER NOT NULL DEFAULT 30,
  min_lead_minutes INTEGER NOT NULL DEFAULT 120,
  max_advance_days INTEGER NOT NULL DEFAULT 30,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_renews_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hours (
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  open_min INTEGER NOT NULL,
  close_min INTEGER NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, weekday)
);
CREATE TABLE IF NOT EXISTS closed_dates (
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (business_id, date)
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, phone)
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  note TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'online',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_biz_date ON bookings (business_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (business_id, created_at);
`;

const g = globalThis as unknown as { __yuehaoDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__yuehaoDb) return g.__yuehaoDb;
  const { DatabaseSync: Ctor } = process.getBuiltinModule("node:sqlite");
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "yuehao.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Ctor(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  conn.exec(SCHEMA);
  g.__yuehaoDb = conn;
  return conn;
}

type P = SQLInputValue;

/** 回傳一般物件（node:sqlite 的列是 null-prototype，無法直接傳給 Client Component） */
export function all<T>(sql: string, ...params: P[]): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}

export function get<T>(sql: string, ...params: P[]): T | undefined {
  const r = db().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...params: P[]): { changes: number; id: number } {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

// ── 型別 ────────────────────────────────────────────────
export type Plan = "free" | "pro" | "business";

export interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
}

export interface Business {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  phone: string;
  address: string;
  notice: string;
  brand_color: string;
  timezone: string;
  slot_interval: number;
  min_lead_minutes: number;
  max_advance_days: number;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_renews_at: number | null;
  created_at: string;
}

export interface Service {
  id: number;
  business_id: number;
  name: string;
  description: string;
  duration_min: number;
  price: number;
  active: number;
  archived: number;
}

export interface Staff {
  id: number;
  business_id: number;
  name: string;
  title: string;
  active: number;
  archived: number;
}

export interface Customer {
  id: number;
  business_id: number;
  name: string;
  phone: string;
  email: string;
  note: string;
  created_at: string;
}

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export interface Booking {
  id: number;
  business_id: number;
  service_id: number;
  staff_id: number;
  customer_id: number;
  date: string;
  start_min: number;
  end_min: number;
  price: number;
  status: BookingStatus;
  note: string;
  token: string;
  source: "online" | "manual";
  created_at: string;
}

export interface BookingRow extends Booking {
  service_name: string;
  staff_name: string;
  customer_name: string;
  customer_phone: string;
}

export const BOOKING_JOIN = `
  SELECT b.*, s.name AS service_name, st.name AS staff_name, c.name AS customer_name, c.phone AS customer_phone
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  JOIN staff st ON st.id = b.staff_id
  JOIN customers c ON c.id = b.customer_id
`;
