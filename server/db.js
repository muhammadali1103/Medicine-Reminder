import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "smart_medicine_reminder",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function query(sql, params = {}) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function execute(sql, params = {}) {
  const [result] = await pool.execute(sql, params);
  return result;
}

export function getPool() {
  return pool;
}

