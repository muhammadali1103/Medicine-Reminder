import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  multipleStatements: true,
});

const databaseName = process.env.MYSQL_DATABASE || "smart_medicine_reminder";
const schemaPath = path.join(process.cwd(), "server", "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");

await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
await connection.query(`USE \`${databaseName}\``);
await connection.query(schemaSql);
await connection.query(`
  ALTER TABLE profiles
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS carrier,
  DROP COLUMN IF EXISTS country_code
`);
await connection.query(`
  ALTER TABLE emergency_profiles
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS blood_type VARCHAR(10) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS allergies TEXT NULL AFTER blood_type,
  ADD COLUMN IF NOT EXISTS conditions TEXT NULL AFTER allergies,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255) NULL AFTER conditions,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50) NULL AFTER emergency_contact_name,
  ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255) NULL AFTER emergency_contact_phone,
  ADD COLUMN IF NOT EXISTS doctor_phone VARCHAR(50) NULL AFTER doctor_name,
  ADD COLUMN IF NOT EXISTS card_id VARCHAR(36) NOT NULL AFTER doctor_phone,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER card_id
`);

console.log(`Database "${databaseName}" is ready.`);

await connection.end();
