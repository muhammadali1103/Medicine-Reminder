import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { execute, getPool, query } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";

const allowedTables = new Set([
  "profiles",
  "user_roles",
  "medications",
  "dose_logs",
  "interaction_warnings",
  "caregiver_links",
  "doctor_profiles",
  "doctor_patient_links",
  "doctor_notes",
  "emergency_profiles",
  "vitals_log",
  "diet_plans",
  "diet_plan_meals",
  "diet_log",
  "health_goals",
  "notification_settings",
  "notification_logs",
  "caregiver_notifications",
]);

const jsonColumns = {
  medications: new Set(["schedule"]),
  interaction_warnings: new Set(["medication_ids"]),
  caregiver_links: new Set(["permissions"]),
  notification_settings: new Set(["snooze_options", "medication_sound_overrides"]),
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  first_reminder_sound: "gentle",
  second_reminder_sound: "medium",
  third_reminder_sound: "urgent",
  snooze_options: [10, 20, 30],
  medication_sound_overrides: {},
  escalate_to_caregiver: true,
  escalate_after_minutes: 30,
  quiet_hours_start: null,
  quiet_hours_end: null,
  vibrate_only: false,
};

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function ensureAppTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS emergency_profiles (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      blood_type VARCHAR(10) NULL,
      allergies TEXT NULL,
      conditions TEXT NULL,
      emergency_contact_name VARCHAR(255) NULL,
      emergency_contact_phone VARCHAR(50) NULL,
      doctor_name VARCHAR(255) NULL,
      doctor_phone VARCHAR(50) NULL,
      card_id VARCHAR(36) NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_emergency_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS vitals_log (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      systolic INT NULL,
      diastolic INT NULL,
      blood_sugar DECIMAL(5,2) NULL,
      heart_rate INT NULL,
      weight DECIMAL(5,2) NULL,
      notes TEXT NULL,
      logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_vitals_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS diet_plans (
      id VARCHAR(36) PRIMARY KEY,
      patient_user_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_by ENUM('patient', 'doctor') NOT NULL,
      doctor_name VARCHAR(255) NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      notes TEXT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_diet_plans_user FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS diet_plan_meals (
      id VARCHAR(36) PRIMARY KEY,
      diet_plan_id VARCHAR(36) NOT NULL,
      meal_type ENUM('breakfast','lunch','dinner','snack') NOT NULL,
      meal_name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      calories INT NULL,
      avoid_foods TEXT NULL,
      recommended_foods TEXT NULL,
      meal_time VARCHAR(50) NULL,
      CONSTRAINT fk_diet_plan_meals_plan FOREIGN KEY (diet_plan_id) REFERENCES diet_plans(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS diet_log (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      diet_plan_id VARCHAR(36) NULL,
      meal_type ENUM('breakfast','lunch','dinner','snack') NOT NULL,
      meal_name VARCHAR(255) NULL,
      followed_plan BOOLEAN DEFAULT FALSE,
      notes TEXT NULL,
      logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_diet_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_diet_log_plan FOREIGN KEY (diet_plan_id) REFERENCES diet_plans(id)
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      specialization VARCHAR(255) NULL,
      license_number VARCHAR(100) NULL,
      hospital VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_doctor_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS doctor_patient_links (
      id VARCHAR(36) PRIMARY KEY,
      doctor_user_id VARCHAR(36) NOT NULL,
      patient_user_id VARCHAR(36) NOT NULL,
      status ENUM('pending','active','revoked') DEFAULT 'pending',
      invite_token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_doctor_patient (doctor_user_id, patient_user_id),
      CONSTRAINT fk_doctor_patient_links_doctor FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_doctor_patient_links_patient FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS doctor_notes (
      id VARCHAR(36) PRIMARY KEY,
      doctor_user_id VARCHAR(36) NOT NULL,
      patient_user_id VARCHAR(36) NOT NULL,
      note TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_doctor_notes_doctor FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_doctor_notes_patient FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS health_goals (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      goal_type ENUM(
        'bp_systolic','bp_diastolic',
        'blood_sugar','weight',
        'heart_rate','medication_adherence',
        'diet_adherence','water_intake'
      ) NOT NULL,
      target_value DECIMAL(8,2) NOT NULL,
      target_direction ENUM('below','above','exact') NOT NULL DEFAULT 'below',
      start_date DATE NOT NULL,
      target_date DATE NULL,
      is_achieved BOOLEAN DEFAULT FALSE,
      achieved_at DATETIME NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_health_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL UNIQUE,
      first_reminder_sound VARCHAR(100) DEFAULT 'gentle',
      second_reminder_sound VARCHAR(100) DEFAULT 'medium',
      third_reminder_sound VARCHAR(100) DEFAULT 'urgent',
      snooze_options JSON DEFAULT ('[10,20,30]'),
      medication_sound_overrides JSON NULL,
      escalate_to_caregiver BOOLEAN DEFAULT TRUE,
      escalate_after_minutes INT DEFAULT 30,
      quiet_hours_start TIME NULL,
      quiet_hours_end TIME NULL,
      vibrate_only BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      medication_id VARCHAR(36) NOT NULL,
      dose_log_id VARCHAR(36) NOT NULL,
      reminder_number INT DEFAULT 1,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      action_taken ENUM('taken','snoozed','dismissed','escalated','ignored') NULL,
      snooze_minutes INT NULL,
      action_at TIMESTAMP NULL,
      CONSTRAINT fk_notification_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_logs_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_logs_dose FOREIGN KEY (dose_log_id) REFERENCES dose_logs(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS caregiver_notifications (
      id VARCHAR(36) PRIMARY KEY,
      caregiver_id VARCHAR(36) NOT NULL,
      patient_id VARCHAR(36) NOT NULL,
      medication_id VARCHAR(36) NULL,
      dose_log_id VARCHAR(36) NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('escalation','health_alert','missed_dose','system') NOT NULL DEFAULT 'escalation',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_caregiver_notifications_caregiver FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_caregiver_notifications_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_caregiver_notifications_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL,
      CONSTRAINT fk_caregiver_notifications_dose FOREIGN KEY (dose_log_id) REFERENCES dose_logs(id) ON DELETE SET NULL
    )
  `);
}

function signSession(user) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      full_name: user.full_name,
    },
    jwtSecret,
    { expiresIn: "7d" }
  );

  return {
    access_token: token,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        full_name: user.full_name,
      },
    },
  };
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  try {
    const token = header.slice("Bearer ".length);
    req.auth = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: { message: "Invalid session" } });
  }
}

function normalizeValue(table, column, value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (jsonColumns[table]?.has(column) && typeof value !== "string") {
    return JSON.stringify(value);
  }

  return value;
}

function normalizeRow(table, row) {
  if (!row) {
    return row;
  }

  const normalized = { ...row };
  for (const column of jsonColumns[table] || []) {
    const value = normalized[column];
    if (typeof value === "string") {
      try {
        normalized[column] = JSON.parse(value);
      } catch {
        normalized[column] = value;
      }
    }
  }

  return normalized;
}

function buildWhere(filters = []) {
  if (!filters.length) {
    return { clause: "", params: [] };
  }

  const params = [];
  const parts = filters.map((filter) => {
    const operatorMap = {
      eq: "=",
      neq: "!=",
      gte: ">=",
      lte: "<=",
      gt: ">",
      lt: "<",
    };
    const sqlOperator = operatorMap[filter.operator] || "=";
    params.push(filter.value);
    return `\`${filter.column}\` ${sqlOperator} ?`;
  });

  return {
    clause: ` WHERE ${parts.join(" AND ")}`,
    params,
  };
}

function buildSelectColumns(select) {
  if (!select || select === "*") {
    return "*";
  }

  return select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map((column) => `\`${column}\``)
    .join(", ");
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBloodPressureStatus(systolic, diastolic) {
  if (systolic == null && diastolic == null) {
    return null;
  }

  if (systolic != null && systolic < 90) {
    return "Low";
  }

  if ((systolic != null && systolic >= 130) || (diastolic != null && diastolic >= 80)) {
    return "High";
  }

  if (systolic != null && systolic >= 120 && systolic <= 129 && (diastolic == null || diastolic < 80)) {
    return "Elevated";
  }

  return "Normal";
}

function getBloodSugarStatus(bloodSugar) {
  if (bloodSugar == null) {
    return null;
  }

  if (bloodSugar < 70) {
    return "Low";
  }

  if (bloodSugar > 180) {
    return "High";
  }

  return "Normal";
}

function getHeartRateStatus(heartRate) {
  if (heartRate == null) {
    return null;
  }

  if (heartRate < 60) {
    return "Low";
  }

  if (heartRate > 100) {
    return "High";
  }

  return "Normal";
}

function getWeightStatus(weight) {
  if (weight == null) {
    return null;
  }

  return "Logged";
}

function buildCriticalAlertMessages({ systolic, bloodSugar }) {
  const alerts = [];

  if (systolic != null && systolic > 160) {
    alerts.push({
      type: "high_blood_pressure",
      severity: "high",
      message: "Your blood pressure is very high. Please rest and consult your doctor.",
    });
  }

  if (bloodSugar != null && bloodSugar > 300) {
    alerts.push({
      type: "critical_blood_sugar",
      severity: "high",
      message: "Critical sugar level detected. Contact your doctor immediately.",
    });
  } else if (bloodSugar != null && bloodSugar < 70) {
    alerts.push({
      type: "low_blood_sugar",
      severity: "medium",
      message: "Low blood sugar detected. Have something sweet immediately.",
    });
  }

  return alerts;
}

async function ensureCaregiverAccess(caregiverId, patientId) {
  const links = await query(
    `SELECT id
     FROM caregiver_links
     WHERE caregiver_id = ? AND patient_id = ? AND status = 'active'
     LIMIT 1`,
    [caregiverId, patientId]
  );

  return links.length > 0;
}

async function resolveTargetUserId(req, res) {
  const requestedUserId = req.query.patientId;

  if (!requestedUserId || requestedUserId === req.auth.sub) {
    return req.auth.sub;
  }

  const role = await getUserRoleFromDb(req.auth.sub);
  const canCaregiverAccess = await ensureCaregiverAccess(req.auth.sub, requestedUserId);
  const canDoctorAccess = role === "doctor" ? await ensureDoctorPatientAccess(req.auth.sub, requestedUserId) : false;

  if (!canCaregiverAccess && !canDoctorAccess) {
    res.status(403).json({
      data: null,
      error: { message: "You do not have access to this patient's health data." },
    });
    return null;
  }

  return requestedUserId;
}

function validateVitalsPayload({ systolic, diastolic, bloodSugar, heartRate, weight }) {
  const normalized = {
    systolic: toNullableNumber(systolic),
    diastolic: toNullableNumber(diastolic),
    bloodSugar: toNullableNumber(bloodSugar),
    heartRate: toNullableNumber(heartRate),
    weight: toNullableNumber(weight),
  };

  const hasMetric = Object.values(normalized).some((value) => value != null);
  if (!hasMetric) {
    return { error: "Enter at least one vital reading." };
  }

  if (normalized.systolic != null && (normalized.systolic < 60 || normalized.systolic > 250)) {
    return { error: "Systolic pressure must be between 60 and 250." };
  }

  if (normalized.diastolic != null && (normalized.diastolic < 40 || normalized.diastolic > 150)) {
    return { error: "Diastolic pressure must be between 40 and 150." };
  }

  if (normalized.bloodSugar != null && (normalized.bloodSugar < 50 || normalized.bloodSugar > 500)) {
    return { error: "Blood sugar must be between 50 and 500 mg/dL." };
  }

  if (normalized.heartRate != null && (normalized.heartRate < 30 || normalized.heartRate > 240)) {
    return { error: "Heart rate must be between 30 and 240 bpm." };
  }

  if (normalized.weight != null && (normalized.weight < 1 || normalized.weight > 500)) {
    return { error: "Weight must be between 1 and 500 kg." };
  }

  return { values: normalized };
}

function normalizeFoodsField(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function normalizeMeal(meal) {
  return {
    id: meal.id,
    meal_type: meal.meal_type,
    meal_name: meal.meal_name,
    description: meal.description || "",
    calories: meal.calories == null ? null : Number(meal.calories),
    avoid_foods: meal.avoid_foods || "",
    recommended_foods: meal.recommended_foods || "",
    meal_time: meal.meal_time || "",
  };
}

function getDietAdherenceSummary(logs) {
  const total = logs.length;
  const followed = logs.filter((log) => Boolean(log.followed_plan)).length;
  const percentage = total > 0 ? Math.round((followed / total) * 100) : 0;

  const byMealType = ["breakfast", "lunch", "dinner", "snack"].map((mealType) => {
    const mealLogs = logs.filter((log) => log.meal_type === mealType);
    const mealFollowed = mealLogs.filter((log) => Boolean(log.followed_plan)).length;
    return {
      meal_type: mealType,
      total: mealLogs.length,
      followed: mealFollowed,
      percentage: mealLogs.length > 0 ? Math.round((mealFollowed / mealLogs.length) * 100) : 0,
    };
  });

  return {
    total,
    followed,
    percentage,
    by_meal_type: byMealType,
  };
}

function getDateRange(from, to) {
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000`) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function formatDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

const GOAL_TYPES = new Set([
  "bp_systolic",
  "bp_diastolic",
  "blood_sugar",
  "weight",
  "heart_rate",
  "medication_adherence",
  "diet_adherence",
  "water_intake",
]);

const GOAL_LABELS = {
  bp_systolic: "Blood Pressure Systolic",
  bp_diastolic: "Blood Pressure Diastolic",
  blood_sugar: "Blood Sugar",
  weight: "Weight",
  heart_rate: "Heart Rate",
  medication_adherence: "Medication Adherence",
  diet_adherence: "Diet Adherence",
  water_intake: "Water Intake",
};

function validateGoalPayload(payload = {}) {
  const targetValue = toNullableNumber(payload.target_value);
  if (!GOAL_TYPES.has(payload.goal_type)) {
    return { error: "Choose a valid goal type." };
  }

  if (targetValue == null) {
    return { error: "Target value is required." };
  }

  const ranges = {
    bp_systolic: [80, 200],
    bp_diastolic: [50, 130],
    blood_sugar: [50, 400],
    weight: [20, 300],
    heart_rate: [30, 220],
    medication_adherence: [1, 100],
    diet_adherence: [1, 100],
    water_intake: [1, 10000],
  };

  const [min, max] = ranges[payload.goal_type] || [1, 1000];
  if (targetValue < min || targetValue > max) {
    return { error: `${GOAL_LABELS[payload.goal_type]} target must be between ${min} and ${max}.` };
  }

  const targetDirection = ["below", "above", "exact"].includes(payload.target_direction)
    ? payload.target_direction
    : "below";

  if (!payload.start_date) {
    return { error: "Start date is required." };
  }

  return {
    values: {
      goal_type: payload.goal_type,
      target_value: targetValue,
      target_direction: targetDirection,
      start_date: payload.start_date,
      target_date: payload.target_date || null,
    },
  };
}

function meetsGoal(direction, currentValue, targetValue) {
  if (currentValue == null || targetValue == null) {
    return false;
  }

  if (direction === "above") {
    return currentValue >= targetValue;
  }

  if (direction === "exact") {
    return Math.abs(currentValue - targetValue) < 0.01;
  }

  return currentValue <= targetValue;
}

function calculateGoalProgress(direction, currentValue, targetValue) {
  if (currentValue == null || targetValue == null || targetValue === 0) {
    return 0;
  }

  if (meetsGoal(direction, currentValue, targetValue)) {
    return 100;
  }

  if (direction === "above") {
    return Math.max(0, Math.min(99, Math.round((currentValue / targetValue) * 100)));
  }

  if (direction === "exact") {
    const distance = Math.abs(currentValue - targetValue);
    return Math.max(0, Math.min(99, Math.round((1 - distance / Math.abs(targetValue)) * 100)));
  }

  return Math.max(0, Math.min(99, Math.round((targetValue / currentValue) * 100)));
}

function calculateDaysRemaining(targetDate) {
  if (!targetDate) {
    return null;
  }

  const end = new Date(`${targetDate}T23:59:59`);
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

async function getUserRoleFromDb(userId) {
  const rows = await query(
    `SELECT role
     FROM user_roles
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0]?.role || "patient";
}

async function ensureDoctorRole(userId) {
  return (await getUserRoleFromDb(userId)) === "doctor";
}

async function ensureDoctorPatientAccess(doctorUserId, patientUserId) {
  const rows = await query(
    `SELECT id
     FROM doctor_patient_links
     WHERE doctor_user_id = ? AND patient_user_id = ? AND status = 'active'
     LIMIT 1`,
    [doctorUserId, patientUserId]
  );

  return rows.length > 0;
}

function doctorRoute(handler) {
  return wrapAsync(async (req, res, next) => {
    const isDoctor = await ensureDoctorRole(req.auth.sub);
    if (!isDoctor) {
      return res.status(403).json({
        data: null,
        error: { message: "Doctor access required." },
      });
    }

    return handler(req, res, next);
  });
}

async function resolveDoctorPatientId(req, res) {
  const patientId = req.params.patientId || req.body?.patientId || req.query.patientId;
  if (!patientId) {
    res.status(400).json({ data: null, error: { message: "Patient is required." } });
    return null;
  }

  const allowed = await ensureDoctorPatientAccess(req.auth.sub, patientId);
  if (!allowed) {
    res.status(403).json({ data: null, error: { message: "You do not have access to this patient." } });
    return null;
  }

  return patientId;
}

async function resolveGoalTargetUserId(req, res, { allowWrite = false } = {}) {
  const requestedUserId = req.method === "GET" ? req.query.patientId : req.body?.patientId || req.query.patientId;
  if (!requestedUserId || requestedUserId === req.auth.sub) {
    return req.auth.sub;
  }

  const role = await getUserRoleFromDb(req.auth.sub);
  const hasCaregiverAccess = await ensureCaregiverAccess(req.auth.sub, requestedUserId);
  const hasDoctorAccess = role === "doctor" ? await ensureDoctorPatientAccess(req.auth.sub, requestedUserId) : false;

  if (!hasCaregiverAccess && !hasDoctorAccess) {
    res.status(403).json({
      data: null,
      error: { message: "You do not have access to this patient's goals." },
    });
    return null;
  }

  if (allowWrite && role !== "doctor") {
    res.status(403).json({
      data: null,
      error: { message: "Only a doctor can manage goals for another patient." },
    });
    return null;
  }

  return requestedUserId;
}

async function getGoalCurrentValue(userId, goalType) {
  if (goalType === "medication_adherence") {
    const rows = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('taken', 'late') THEN 1 ELSE 0 END) AS followed
       FROM dose_logs
       WHERE user_id = ?
         AND scheduled_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [userId]
    );
    const total = Number(rows[0]?.total || 0);
    const followed = Number(rows[0]?.followed || 0);
    return total > 0 ? Math.round((followed / total) * 100) : 0;
  }

  if (goalType === "diet_adherence") {
    const rows = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN followed_plan THEN 1 ELSE 0 END) AS followed
       FROM diet_log
       WHERE user_id = ?
         AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [userId]
    );
    const total = Number(rows[0]?.total || 0);
    const followed = Number(rows[0]?.followed || 0);
    return total > 0 ? Math.round((followed / total) * 100) : 0;
  }

  if (goalType === "water_intake") {
    return null;
  }

  const columnMap = {
    bp_systolic: "systolic",
    bp_diastolic: "diastolic",
    blood_sugar: "blood_sugar",
    weight: "weight",
    heart_rate: "heart_rate",
  };
  const column = columnMap[goalType];

  const rows = await query(
    `SELECT ${column} AS current_value
     FROM vitals_log
     WHERE user_id = ? AND ${column} IS NOT NULL
     ORDER BY logged_at DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0]?.current_value == null ? null : Number(rows[0].current_value);
}

async function getGoalTrend(userId, goalType) {
  if (goalType === "medication_adherence") {
    return query(
      `SELECT
         DATE(scheduled_time) AS date,
         ROUND(
           (
             SUM(CASE WHEN status IN ('taken', 'late') THEN 1 ELSE 0 END) /
             NULLIF(COUNT(*), 0)
           ) * 100,
           1
         ) AS value
       FROM dose_logs
       WHERE user_id = ?
         AND scheduled_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(scheduled_time)
       ORDER BY date ASC`,
      [userId]
    );
  }

  if (goalType === "diet_adherence") {
    return query(
      `SELECT
         DATE(logged_at) AS date,
         ROUND(
           (
             SUM(CASE WHEN followed_plan THEN 1 ELSE 0 END) /
             NULLIF(COUNT(*), 0)
           ) * 100,
           1
         ) AS value
       FROM diet_log
       WHERE user_id = ?
         AND logged_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(logged_at)
       ORDER BY date ASC`,
      [userId]
    );
  }

  if (goalType === "water_intake") {
    return [];
  }

  const columnMap = {
    bp_systolic: "systolic",
    bp_diastolic: "diastolic",
    blood_sugar: "blood_sugar",
    weight: "weight",
    heart_rate: "heart_rate",
  };
  const column = columnMap[goalType];

  return query(
    `SELECT
       DATE(logged_at) AS date,
       ROUND(AVG(${column}), 1) AS value
     FROM vitals_log
     WHERE user_id = ?
       AND logged_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND ${column} IS NOT NULL
     GROUP BY DATE(logged_at)
     ORDER BY date ASC`,
    [userId]
  );
}

function buildGoalStatus({ progressPercentage, isAchieved, targetDate, trend }) {
  if (isAchieved) {
    return "achieved";
  }

  if (targetDate && calculateDaysRemaining(targetDate) != null && calculateDaysRemaining(targetDate) < 0) {
    return "needs_attention";
  }

  if ((trend || []).length >= 2) {
    const last = Number(trend[trend.length - 1]?.value ?? 0);
    const first = Number(trend[0]?.value ?? 0);
    if (Math.abs(last - first) < 0.1) {
      return "needs_attention";
    }
  }

  return progressPercentage >= 80 ? "on_track" : "needs_attention";
}

async function buildGoalResponse(goal) {
  const currentValue = await getGoalCurrentValue(goal.user_id, goal.goal_type);
  const progressPercentage = calculateGoalProgress(goal.target_direction, currentValue, Number(goal.target_value));
  const trend = await getGoalTrend(goal.user_id, goal.goal_type);
  const achieved = Boolean(goal.is_achieved) || meetsGoal(goal.target_direction, currentValue, Number(goal.target_value));

  return {
    ...goal,
    goal_label: GOAL_LABELS[goal.goal_type] || goal.goal_type,
    current_value: currentValue,
    target_value: Number(goal.target_value),
    progress_percentage: progressPercentage,
    status: buildGoalStatus({
      progressPercentage,
      isAchieved: achieved,
      targetDate: goal.target_date,
      trend,
    }),
    days_remaining: calculateDaysRemaining(goal.target_date),
    trend: trend.map((item) => ({
      date: item.date,
      value: item.value == null ? null : Number(item.value),
    })),
  };
}

async function checkGoalsForUser(userId) {
  const goals = await query(
    `SELECT *
     FROM health_goals
     WHERE user_id = ? AND is_active = TRUE AND is_achieved = FALSE`,
    [userId]
  );

  const achievedGoals = [];
  for (const goal of goals) {
    const currentValue = await getGoalCurrentValue(userId, goal.goal_type);
    if (!meetsGoal(goal.target_direction, currentValue, Number(goal.target_value))) {
      continue;
    }

    await execute(
      `UPDATE health_goals
       SET is_achieved = TRUE,
           achieved_at = NOW()
       WHERE id = ?`,
      [goal.id]
    );

    achievedGoals.push(await buildGoalResponse({
      ...goal,
      is_achieved: true,
      achieved_at: new Date().toISOString(),
    }));
  }

  return achievedGoals;
}

async function buildHealthSummaryReportData(targetUserId, from, to) {
  const { start, end } = getDateRange(from, to);
  const startSql = formatDateOnly(start);
  const endSql = formatDateOnly(end);

  const patients = await query(
    `SELECT id, full_name, email
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [targetUserId]
  );
  const patient = patients[0];

  if (!patient) {
    return null;
  }

  const medications = await query(
    `SELECT id, name, dosage, strength, schedule, instructions
     FROM medications
     WHERE user_id = ? AND is_active = TRUE
     ORDER BY created_at DESC`,
    [targetUserId]
  );

  const doseLogs = await query(
    `SELECT medication_id, status, scheduled_time
     FROM dose_logs
     WHERE user_id = ?
       AND scheduled_time >= ?
       AND scheduled_time <= DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY scheduled_time DESC`,
    [targetUserId, startSql, endSql]
  );

  const vitalsHistory = await query(
    `SELECT id, systolic, diastolic, blood_sugar, heart_rate, weight, notes, logged_at
     FROM vitals_log
     WHERE user_id = ?
       AND logged_at >= ?
       AND logged_at <= DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY logged_at DESC`,
    [targetUserId, startSql, endSql]
  );

  const activePlans = await query(
    `SELECT *
     FROM diet_plans
     WHERE patient_user_id = ? AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [targetUserId]
  );
  const activePlan = activePlans[0] || null;

  const dietMeals = activePlan
    ? await query(
        `SELECT *
         FROM diet_plan_meals
         WHERE diet_plan_id = ?
         ORDER BY FIELD(meal_type, 'breakfast', 'lunch', 'dinner', 'snack'), meal_time ASC`,
        [activePlan.id]
      )
    : [];

  const dietLogs = await query(
    `SELECT id, meal_type, meal_name, followed_plan, notes, logged_at
     FROM diet_log
     WHERE user_id = ?
       AND logged_at >= ?
       AND logged_at <= DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY logged_at DESC`,
    [targetUserId, startSql, endSql]
  );

  const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
  const medicationTotals = new Map();
  let overallTaken = 0;
  let overallMissed = 0;

  for (const log of doseLogs) {
    const medication = medicationById.get(log.medication_id);
    const name = medication?.name || "Unknown";
    const current = medicationTotals.get(log.medication_id) || {
      medication_id: log.medication_id,
      name,
      taken: 0,
      missed: 0,
      total: 0,
    };

    current.total += 1;
    if (log.status === "taken" || log.status === "late") {
      current.taken += 1;
      overallTaken += 1;
    } else if (log.status === "missed") {
      current.missed += 1;
      overallMissed += 1;
    }

    medicationTotals.set(log.medication_id, current);
  }

  const perMedication = Array.from(medicationTotals.values()).map((item) => ({
    name: item.name,
    taken: item.taken,
    missed: item.missed,
    percentage: item.total > 0 ? Math.round((item.taken / item.total) * 100) : 0,
  }));

  const average = (values) => {
    const filtered = values.filter((value) => value != null).map(Number);
    if (!filtered.length) {
      return null;
    }
    return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1));
  };

  const abnormalCount = vitalsHistory.filter((entry) => {
    const bpStatus = getBloodPressureStatus(entry.systolic, entry.diastolic);
    const sugarStatus = getBloodSugarStatus(entry.blood_sugar);
    return bpStatus === "High" || bpStatus === "Low" || sugarStatus === "High" || sugarStatus === "Low";
  }).length;

  const latestVital = vitalsHistory[0]
    ? {
        bp: vitalsHistory[0].systolic != null && vitalsHistory[0].diastolic != null
          ? `${vitalsHistory[0].systolic}/${vitalsHistory[0].diastolic}`
          : null,
        sugar: vitalsHistory[0].blood_sugar,
        heart_rate: vitalsHistory[0].heart_rate,
        weight: vitalsHistory[0].weight,
      }
    : null;

  const dietAdherence = getDietAdherenceSummary(dietLogs);

  return {
    patient: {
      name: patient.full_name || patient.email,
      email: patient.email,
      generated_at: new Date().toISOString(),
    },
    medications: medications.map((medication) => {
      const schedule = typeof medication.schedule === "string" ? JSON.parse(medication.schedule) : medication.schedule;
      return {
        id: medication.id,
        name: medication.name,
        dosage: medication.dosage || medication.strength || null,
        strength: medication.strength || null,
        frequency: schedule?.frequency || "once",
        times: schedule?.times || [],
        instructions: medication.instructions || null,
      };
    }),
    medication_adherence: {
      total_doses: overallTaken + overallMissed,
      taken: overallTaken,
      missed: overallMissed,
      adherence_percentage: overallTaken + overallMissed > 0
        ? Math.round((overallTaken / (overallTaken + overallMissed)) * 100)
        : 0,
      per_medication: perMedication,
    },
    vitals: {
      latest: latestVital,
      history: vitalsHistory.map((entry) => ({
        ...entry,
        bp_status: getBloodPressureStatus(entry.systolic, entry.diastolic),
        sugar_status: getBloodSugarStatus(entry.blood_sugar),
      })),
      averages: {
        avg_systolic: average(vitalsHistory.map((entry) => entry.systolic)),
        avg_diastolic: average(vitalsHistory.map((entry) => entry.diastolic)),
        avg_sugar: average(vitalsHistory.map((entry) => entry.blood_sugar)),
        avg_heart_rate: average(vitalsHistory.map((entry) => entry.heart_rate)),
      },
      abnormal_count: abnormalCount,
    },
    diet: {
      plan_title: activePlan?.title || null,
      doctor_name: activePlan?.doctor_name || null,
      created_by: activePlan?.created_by || null,
      meals: dietMeals.map(normalizeMeal),
      adherence_percentage: dietAdherence.percentage,
      adherence_by_meal_type: dietAdherence.by_meal_type,
    },
  };
}

function normalizeSoundName(value, fallback) {
  const allowed = new Set(["gentle", "medium", "urgent", "success"]);
  return allowed.has(value) ? value : fallback;
}

function normalizeSnoozeOptions(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : [];

  const normalized = source
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 180);

  return normalized.length ? Array.from(new Set(normalized)) : [...DEFAULT_NOTIFICATION_SETTINGS.snooze_options];
}

function normalizeMedicationSoundOverrides(value) {
  const source = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      })()
    : value;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(source)
      .map(([medicationId, sound]) => [medicationId, normalizeSoundName(sound, DEFAULT_NOTIFICATION_SETTINGS.first_reminder_sound)])
      .filter(([, sound]) => Boolean(sound))
  );
}

function normalizeNotificationSettings(row) {
  if (!row) {
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      medication_sound_overrides: {},
      snooze_options: [...DEFAULT_NOTIFICATION_SETTINGS.snooze_options],
    };
  }

  return {
    id: row.id,
    user_id: row.user_id,
    first_reminder_sound: normalizeSoundName(row.first_reminder_sound, DEFAULT_NOTIFICATION_SETTINGS.first_reminder_sound),
    second_reminder_sound: normalizeSoundName(row.second_reminder_sound, DEFAULT_NOTIFICATION_SETTINGS.second_reminder_sound),
    third_reminder_sound: normalizeSoundName(row.third_reminder_sound, DEFAULT_NOTIFICATION_SETTINGS.third_reminder_sound),
    snooze_options: normalizeSnoozeOptions(row.snooze_options),
    medication_sound_overrides: normalizeMedicationSoundOverrides(row.medication_sound_overrides),
    escalate_to_caregiver: row.escalate_to_caregiver !== false,
    escalate_after_minutes: Number(row.escalate_after_minutes) > 0 ? Number(row.escalate_after_minutes) : DEFAULT_NOTIFICATION_SETTINGS.escalate_after_minutes,
    quiet_hours_start: row.quiet_hours_start || null,
    quiet_hours_end: row.quiet_hours_end || null,
    vibrate_only: Boolean(row.vibrate_only),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function getOrCreateNotificationSettings(userId) {
  const rows = await query(
    `SELECT *
     FROM notification_settings
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows[0]) {
    return normalizeNotificationSettings(rows[0]);
  }

  const id = randomUUID();
  await execute(
    `INSERT INTO notification_settings (
      id, user_id, first_reminder_sound, second_reminder_sound, third_reminder_sound,
      snooze_options, medication_sound_overrides, escalate_to_caregiver, escalate_after_minutes,
      quiet_hours_start, quiet_hours_end, vibrate_only
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      DEFAULT_NOTIFICATION_SETTINGS.first_reminder_sound,
      DEFAULT_NOTIFICATION_SETTINGS.second_reminder_sound,
      DEFAULT_NOTIFICATION_SETTINGS.third_reminder_sound,
      JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS.snooze_options),
      JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS.medication_sound_overrides),
      DEFAULT_NOTIFICATION_SETTINGS.escalate_to_caregiver,
      DEFAULT_NOTIFICATION_SETTINGS.escalate_after_minutes,
      DEFAULT_NOTIFICATION_SETTINGS.quiet_hours_start,
      DEFAULT_NOTIFICATION_SETTINGS.quiet_hours_end,
      DEFAULT_NOTIFICATION_SETTINGS.vibrate_only,
    ]
  );

  return {
    id,
    user_id: userId,
    ...DEFAULT_NOTIFICATION_SETTINGS,
  };
}

function parseMedicationSchedule(schedule) {
  if (!schedule) {
    return null;
  }

  if (typeof schedule === "string") {
    try {
      return JSON.parse(schedule);
    } catch {
      return null;
    }
  }

  return schedule;
}

function isMedicationActiveOnDate(medication, date) {
  const check = new Date(date);
  const start = medication.start_date ? new Date(`${medication.start_date}T00:00:00`) : null;
  const end = medication.end_date ? new Date(`${medication.end_date}T23:59:59`) : null;

  if (start && check < start) {
    return false;
  }

  if (end && check > end) {
    return false;
  }

  return true;
}

function buildScheduledDate(date, time) {
  const [hours, minutes] = String(time || "08:00")
    .split(":")
    .map((part) => Number(part));
  const scheduled = new Date(date);
  scheduled.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return scheduled;
}

function getReminderLevel(overdueMinutes, escalateAfterMinutes) {
  if (overdueMinutes < 0) {
    return null;
  }

  if (overdueMinutes >= escalateAfterMinutes) {
    return 3;
  }

  if (overdueMinutes >= 15) {
    return 2;
  }

  return 1;
}

function isWithinQuietHours(settings, date) {
  if (!settings.quiet_hours_start || !settings.quiet_hours_end) {
    return false;
  }

  const parseTime = (value) => {
    const [hours, minutes] = String(value).split(":").map((part) => Number(part));
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  };

  const start = parseTime(settings.quiet_hours_start);
  const end = parseTime(settings.quiet_hours_end);
  const current = date.getHours() * 60 + date.getMinutes();

  if (start === end) {
    return false;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

async function findOrCreateDoseLog(userId, medicationId, scheduledTime) {
  const existing = await query(
    `SELECT *
     FROM dose_logs
     WHERE user_id = ?
       AND medication_id = ?
       AND scheduled_time BETWEEN DATE_SUB(?, INTERVAL 1 MINUTE) AND DATE_ADD(?, INTERVAL 1 MINUTE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, medicationId, scheduledTime, scheduledTime]
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = randomUUID();
  await execute(
    `INSERT INTO dose_logs (id, medication_id, user_id, scheduled_time, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [id, medicationId, userId, scheduledTime]
  );

  return {
    id,
    medication_id: medicationId,
    user_id: userId,
    scheduled_time: scheduledTime,
    taken_time: null,
    status: "pending",
  };
}

async function createCaregiverEscalationNotifications({ patientId, medicationId, doseLogId, medicationName, scheduledTime }) {
  const caregivers = await query(
    `SELECT caregiver_id
     FROM caregiver_links
     WHERE patient_id = ? AND status = 'active'`,
    [patientId]
  );

  if (!caregivers.length) {
    return 0;
  }

  const patient = await query(
    `SELECT full_name, email
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [patientId]
  );

  const patientName = patient[0]?.full_name || patient[0]?.email || "Patient";
  const reminderTime = new Date(scheduledTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  for (const caregiver of caregivers) {
    await execute(
      `INSERT INTO caregiver_notifications (
        id, caregiver_id, patient_id, medication_id, dose_log_id, title, message, type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'escalation')`,
      [
        randomUUID(),
        caregiver.caregiver_id,
        patientId,
        medicationId,
        doseLogId,
        "Medication overdue alert",
        `${patientName} has not taken ${medicationName} scheduled for ${reminderTime}.`,
      ]
    );
  }

  return caregivers.length;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/notifications/settings", authRequired, wrapAsync(async (req, res) => {
  const settings = await getOrCreateNotificationSettings(req.auth.sub);
  return res.json({ data: settings, error: null });
}));

app.put("/api/notifications/settings", authRequired, wrapAsync(async (req, res) => {
  const current = await getOrCreateNotificationSettings(req.auth.sub);
  const body = req.body || {};

  const nextSettings = {
    first_reminder_sound: normalizeSoundName(body.first_reminder_sound, current.first_reminder_sound),
    second_reminder_sound: normalizeSoundName(body.second_reminder_sound, current.second_reminder_sound),
    third_reminder_sound: normalizeSoundName(body.third_reminder_sound, current.third_reminder_sound),
    snooze_options: normalizeSnoozeOptions(body.snooze_options ?? current.snooze_options),
    medication_sound_overrides: normalizeMedicationSoundOverrides(body.medication_sound_overrides ?? current.medication_sound_overrides),
    escalate_to_caregiver: body.escalate_to_caregiver == null ? current.escalate_to_caregiver : Boolean(body.escalate_to_caregiver),
    escalate_after_minutes: Number(body.escalate_after_minutes) > 0 ? Number(body.escalate_after_minutes) : current.escalate_after_minutes,
    quiet_hours_start: body.quiet_hours_start || null,
    quiet_hours_end: body.quiet_hours_end || null,
    vibrate_only: body.vibrate_only == null ? current.vibrate_only : Boolean(body.vibrate_only),
  };

  await execute(
    `UPDATE notification_settings
     SET first_reminder_sound = ?,
         second_reminder_sound = ?,
         third_reminder_sound = ?,
         snooze_options = ?,
         medication_sound_overrides = ?,
         escalate_to_caregiver = ?,
         escalate_after_minutes = ?,
         quiet_hours_start = ?,
         quiet_hours_end = ?,
         vibrate_only = ?
     WHERE user_id = ?`,
    [
      nextSettings.first_reminder_sound,
      nextSettings.second_reminder_sound,
      nextSettings.third_reminder_sound,
      JSON.stringify(nextSettings.snooze_options),
      JSON.stringify(nextSettings.medication_sound_overrides),
      nextSettings.escalate_to_caregiver,
      nextSettings.escalate_after_minutes,
      nextSettings.quiet_hours_start,
      nextSettings.quiet_hours_end,
      nextSettings.vibrate_only,
      req.auth.sub,
    ]
  );

  return res.json({
    data: {
      ...current,
      ...nextSettings,
    },
    error: null,
  });
}));

app.get("/api/notifications/pending", authRequired, wrapAsync(async (req, res) => {
  const userId = req.auth.sub;
  const settings = await getOrCreateNotificationSettings(userId);
  const medications = await query(
    `SELECT id, name, dosage, strength, schedule, start_date, end_date, is_active
     FROM medications
     WHERE user_id = ? AND is_active = TRUE`,
    [userId]
  );

  const pending = [];
  const now = new Date();
  const datesToCheck = [
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    new Date(now),
  ];

  for (const medication of medications) {
    const schedule = parseMedicationSchedule(medication.schedule);
    const times = Array.isArray(schedule?.times) && schedule.times.length ? schedule.times : ["08:00"];

    for (const baseDate of datesToCheck) {
      if (!isMedicationActiveOnDate(medication, baseDate)) {
        continue;
      }

      for (const time of times) {
        const scheduledTime = buildScheduledDate(baseDate, time);
        if (scheduledTime > now) {
          continue;
        }

        if (now.getTime() - scheduledTime.getTime() > 36 * 60 * 60 * 1000) {
          continue;
        }

        const doseLog = await findOrCreateDoseLog(userId, medication.id, scheduledTime);
        if (!doseLog || doseLog.status !== "pending") {
          continue;
        }

        const history = await query(
          `SELECT reminder_number, sent_at, action_taken, snooze_minutes, action_at
           FROM notification_logs
           WHERE dose_log_id = ?
           ORDER BY sent_at ASC, action_at ASC`,
          [doseLog.id]
        );

        const latestSnooze = [...history]
          .reverse()
          .find((entry) => entry.action_taken === "snoozed" && entry.action_at && entry.snooze_minutes);

        const snoozeUntil = latestSnooze
          ? new Date(new Date(latestSnooze.action_at).getTime() + Number(latestSnooze.snooze_minutes) * 60 * 1000)
          : null;

        if (snoozeUntil && now < snoozeUntil) {
          continue;
        }

        const effectiveStart = snoozeUntil || scheduledTime;
        const overdueMinutes = Math.floor((now.getTime() - effectiveStart.getTime()) / (60 * 1000));
        const reminderLevel = getReminderLevel(overdueMinutes, settings.escalate_after_minutes);
        if (!reminderLevel) {
          continue;
        }

        if (reminderLevel < 3 && isWithinQuietHours(settings, now)) {
          continue;
        }

        const alreadySent = history.some((entry) => {
          if (Number(entry.reminder_number) !== reminderLevel || entry.action_taken) {
            return false;
          }

          if (!latestSnooze) {
            return true;
          }

          return new Date(entry.sent_at) > new Date(latestSnooze.action_at);
        });

        if (alreadySent) {
          continue;
        }

        const notificationLogId = randomUUID();
        await execute(
          `INSERT INTO notification_logs (id, user_id, medication_id, dose_log_id, reminder_number)
           VALUES (?, ?, ?, ?, ?)`,
          [notificationLogId, userId, medication.id, doseLog.id, reminderLevel]
        );

        pending.push({
          notification_log_id: notificationLogId,
          dose_log_id: doseLog.id,
          medication_id: medication.id,
          medication_name: medication.name,
          dosage: medication.dosage || medication.strength || "1 dose",
          scheduled_time: new Date(doseLog.scheduled_time).toISOString(),
          overdue_minutes: overdueMinutes,
          reminder_number: reminderLevel,
          sound:
            settings.medication_sound_overrides?.[medication.id] ||
            (reminderLevel === 1
              ? settings.first_reminder_sound
              : reminderLevel === 2
                ? settings.second_reminder_sound
                : settings.third_reminder_sound),
          snooze_options: settings.snooze_options,
          escalate_to_caregiver: settings.escalate_to_caregiver,
          escalate_after_minutes: settings.escalate_after_minutes,
          vibrate_only: settings.vibrate_only,
          quiet_hours_active: reminderLevel < 3 && isWithinQuietHours(settings, now),
        });
      }
    }
  }

  pending.sort((a, b) => {
    if (b.reminder_number !== a.reminder_number) {
      return b.reminder_number - a.reminder_number;
    }
    return new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime();
  });

  return res.json({ data: pending, error: null });
}));

app.post("/api/notifications/snooze", authRequired, wrapAsync(async (req, res) => {
  const { dose_log_id: doseLogId, snooze_minutes: snoozeMinutes } = req.body || {};
  const settings = await getOrCreateNotificationSettings(req.auth.sub);
  const allowedSnoozeOptions = normalizeSnoozeOptions(settings.snooze_options);
  const snoozeValue = Number(snoozeMinutes);

  if (!doseLogId || !allowedSnoozeOptions.includes(snoozeValue)) {
    return res.status(400).json({
      data: null,
      error: { message: "Invalid snooze request." },
    });
  }

  const rows = await query(
    `SELECT dl.id, dl.user_id, dl.medication_id, m.name AS medication_name
     FROM dose_logs dl
     INNER JOIN medications m ON m.id = dl.medication_id
     WHERE dl.id = ? AND dl.user_id = ?
     LIMIT 1`,
    [doseLogId, req.auth.sub]
  );
  const doseLog = rows[0];

  if (!doseLog) {
    return res.status(404).json({
      data: null,
      error: { message: "Dose reminder not found." },
    });
  }

  const lastSent = await query(
    `SELECT reminder_number
     FROM notification_logs
     WHERE dose_log_id = ? AND action_taken IS NULL
     ORDER BY sent_at DESC
     LIMIT 1`,
    [doseLogId]
  );

  await execute(
    `INSERT INTO notification_logs (
      id, user_id, medication_id, dose_log_id, reminder_number, action_taken, snooze_minutes, action_at
    ) VALUES (?, ?, ?, ?, ?, 'snoozed', ?, CURRENT_TIMESTAMP)`,
    [
      randomUUID(),
      req.auth.sub,
      doseLog.medication_id,
      doseLogId,
      Number(lastSent[0]?.reminder_number || 1),
      snoozeValue,
    ]
  );

  const snoozedUntil = new Date(Date.now() + snoozeValue * 60 * 1000).toISOString();
  return res.json({
    data: {
      dose_log_id: doseLogId,
      medication_name: doseLog.medication_name,
      snoozed_until: snoozedUntil,
      snooze_minutes: snoozeValue,
    },
    error: null,
  });
}));

app.post("/api/notifications/escalate", authRequired, wrapAsync(async (req, res) => {
  const { dose_log_id: doseLogId } = req.body || {};
  if (!doseLogId) {
    return res.status(400).json({ data: null, error: { message: "Dose log is required." } });
  }

  const settings = await getOrCreateNotificationSettings(req.auth.sub);
  const rows = await query(
    `SELECT dl.id, dl.user_id, dl.medication_id, dl.status, dl.scheduled_time,
            m.name AS medication_name
     FROM dose_logs dl
     INNER JOIN medications m ON m.id = dl.medication_id
     WHERE dl.id = ? AND dl.user_id = ?
     LIMIT 1`,
    [doseLogId, req.auth.sub]
  );
  const doseLog = rows[0];

  if (!doseLog) {
    return res.status(404).json({ data: null, error: { message: "Dose reminder not found." } });
  }

  const existingEscalation = await query(
    `SELECT id
     FROM notification_logs
     WHERE dose_log_id = ? AND action_taken = 'escalated'
     LIMIT 1`,
    [doseLogId]
  );

  if (doseLog.status === "pending") {
    await execute(
      `UPDATE dose_logs
       SET status = 'missed'
       WHERE id = ?`,
      [doseLogId]
    );
  }

  if (existingEscalation[0]) {
    return res.json({
      data: { escalated: true, caregiver_count: 0, already_sent: true },
      error: null,
    });
  }

  const caregiverCount = settings.escalate_to_caregiver
    ? await createCaregiverEscalationNotifications({
        patientId: req.auth.sub,
        medicationId: doseLog.medication_id,
        doseLogId,
        medicationName: doseLog.medication_name,
        scheduledTime: doseLog.scheduled_time,
      })
    : 0;

  await execute(
    `INSERT INTO notification_logs (
      id, user_id, medication_id, dose_log_id, reminder_number, action_taken, action_at
    ) VALUES (?, ?, ?, ?, 3, 'escalated', CURRENT_TIMESTAMP)`,
    [randomUUID(), req.auth.sub, doseLog.medication_id, doseLogId]
  );

  return res.json({
    data: {
      escalated: true,
      caregiver_count: caregiverCount,
      dose_log_id: doseLogId,
    },
    error: null,
  });
}));

app.get("/api/public/emergency-card/:cardId", wrapAsync(async (req, res) => {
  const { cardId } = req.params;

  const cards = await query(
    `SELECT id, user_id, name, blood_type, allergies, conditions,
            emergency_contact_name, emergency_contact_phone,
            doctor_name, doctor_phone, card_id, is_active, updated_at
     FROM emergency_profiles
     WHERE card_id = ?
     LIMIT 1`,
    [cardId]
  );

  const card = cards[0];
  if (!card) {
    return res.status(404).json({
      data: null,
      error: { message: "Emergency card not found" },
    });
  }

  if (!card.is_active) {
    return res.json({
      data: {
        card_id: card.card_id,
        is_active: false,
      },
      error: null,
    });
  }

  const medications = await query(
    `SELECT id, name, strength, dosage, form
     FROM medications
     WHERE user_id = ? AND is_active = TRUE
     ORDER BY created_at DESC`,
    [card.user_id]
  );

  return res.json({
    data: {
      ...card,
      medications,
    },
    error: null,
  });
}));

app.post("/api/goals", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveGoalTargetUserId(req, res, { allowWrite: true });
  if (!targetUserId) {
    return;
  }

  const validation = validateGoalPayload(req.body || {});
  if (validation.error) {
    return res.status(400).json({ data: null, error: { message: validation.error } });
  }

  const goalId = randomUUID();
  await execute(
    `INSERT INTO health_goals
      (id, user_id, goal_type, target_value, target_direction, start_date, target_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      goalId,
      targetUserId,
      validation.values.goal_type,
      validation.values.target_value,
      validation.values.target_direction,
      validation.values.start_date,
      validation.values.target_date,
    ]
  );

  const rows = await query("SELECT * FROM health_goals WHERE id = ? LIMIT 1", [goalId]);
  return res.json({ data: await buildGoalResponse(rows[0]), error: null });
}));

app.get("/api/goals", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveGoalTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const [activeGoals, achievedGoals] = await Promise.all([
    query(
      `SELECT *
       FROM health_goals
       WHERE user_id = ? AND is_active = TRUE AND is_achieved = FALSE
       ORDER BY is_achieved ASC, created_at DESC`,
      [targetUserId]
    ),
    query(
      `SELECT *
       FROM health_goals
       WHERE user_id = ? AND is_achieved = TRUE
       ORDER BY achieved_at DESC, created_at DESC`,
      [targetUserId]
    ),
  ]);

  const active = [];
  for (const goal of activeGoals) {
    active.push(await buildGoalResponse(goal));
  }

  const achieved = [];
  for (const goal of achievedGoals) {
    achieved.push(await buildGoalResponse(goal));
  }

  return res.json({
    data: {
      active,
      achieved,
    },
    error: null,
  });
}));

app.put("/api/goals/:id", authRequired, wrapAsync(async (req, res) => {
  const { id } = req.params;
  const targetUserId = await resolveGoalTargetUserId(req, res, { allowWrite: true });
  if (!targetUserId) {
    return;
  }

  const existing = await query(
    `SELECT *
     FROM health_goals
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [id, targetUserId]
  );

  if (!existing[0]) {
    return res.status(404).json({ data: null, error: { message: "Goal not found." } });
  }

  const merged = {
    ...existing[0],
    ...req.body,
    start_date: req.body?.start_date || existing[0].start_date,
  };
  const validation = validateGoalPayload(merged);
  if (validation.error) {
    return res.status(400).json({ data: null, error: { message: validation.error } });
  }

  await execute(
    `UPDATE health_goals
     SET goal_type = ?,
         target_value = ?,
         target_direction = ?,
         start_date = ?,
         target_date = ?,
         is_achieved = FALSE,
         achieved_at = NULL
     WHERE id = ? AND user_id = ?`,
    [
      validation.values.goal_type,
      validation.values.target_value,
      validation.values.target_direction,
      validation.values.start_date,
      validation.values.target_date,
      id,
      targetUserId,
    ]
  );

  const rows = await query("SELECT * FROM health_goals WHERE id = ? LIMIT 1", [id]);
  return res.json({ data: await buildGoalResponse(rows[0]), error: null });
}));

app.delete("/api/goals/:id", authRequired, wrapAsync(async (req, res) => {
  const { id } = req.params;
  const targetUserId = await resolveGoalTargetUserId(req, res, { allowWrite: true });
  if (!targetUserId) {
    return;
  }

  await execute(
    `UPDATE health_goals
     SET is_active = FALSE
     WHERE id = ? AND user_id = ?`,
    [id, targetUserId]
  );

  return res.json({ data: { success: true }, error: null });
}));

app.post("/api/goals/check", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveGoalTargetUserId(req, res, { allowWrite: true });
  if (!targetUserId) {
    return;
  }

  const achieved = await checkGoalsForUser(targetUserId);
  return res.json({ data: achieved, error: null });
}));

app.post("/api/vitals/log", authRequired, wrapAsync(async (req, res) => {
  const { notes } = req.body || {};
  const validation = validateVitalsPayload(req.body || {});

  if (validation.error) {
    return res.status(400).json({
      data: null,
      error: { message: validation.error },
    });
  }

  const { systolic, diastolic, bloodSugar, heartRate, weight } = validation.values;
  const id = randomUUID();

  await execute(
    `INSERT INTO vitals_log
      (id, user_id, systolic, diastolic, blood_sugar, heart_rate, weight, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.auth.sub, systolic, diastolic, bloodSugar, heartRate, weight, notes || null]
  );

  const alerts = buildCriticalAlertMessages({ systolic, bloodSugar });
  const achievedGoals = await checkGoalsForUser(req.auth.sub);
  const data = {
    id,
    user_id: req.auth.sub,
    systolic,
    diastolic,
    blood_sugar: bloodSugar,
    heart_rate: heartRate,
    weight,
    notes: notes || null,
    logged_at: new Date().toISOString(),
    bp_status: getBloodPressureStatus(systolic, diastolic),
    sugar_status: getBloodSugarStatus(bloodSugar),
    heart_rate_status: getHeartRateStatus(heartRate),
    weight_status: getWeightStatus(weight),
    alerts,
    achieved_goals: achievedGoals,
  };

  return res.json({ data, error: null });
}));

app.get("/api/vitals/history", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const rows = await query(
    `SELECT
        DATE(logged_at) AS log_date,
        MIN(systolic) AS systolic_min,
        MAX(systolic) AS systolic_max,
        ROUND(AVG(systolic), 1) AS systolic_avg,
        MIN(diastolic) AS diastolic_min,
        MAX(diastolic) AS diastolic_max,
        ROUND(AVG(diastolic), 1) AS diastolic_avg,
        MIN(blood_sugar) AS sugar_min,
        MAX(blood_sugar) AS sugar_max,
        ROUND(AVG(blood_sugar), 1) AS sugar_avg,
        MIN(heart_rate) AS heart_rate_min,
        MAX(heart_rate) AS heart_rate_max,
        ROUND(AVG(heart_rate), 1) AS heart_rate_avg,
        MIN(weight) AS weight_min,
        MAX(weight) AS weight_max,
        ROUND(AVG(weight), 1) AS weight_avg,
        COUNT(*) AS entries_count
      FROM vitals_log
      WHERE user_id = ?
        AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(logged_at)
      ORDER BY log_date DESC`,
    [targetUserId]
  );

  const entries = await query(
    `SELECT id, user_id, systolic, diastolic, blood_sugar, heart_rate, weight, notes, logged_at
     FROM vitals_log
     WHERE user_id = ?
       AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     ORDER BY logged_at DESC
     LIMIT 30`,
    [targetUserId]
  );

  return res.json({
    data: {
      grouped: rows,
      entries: entries.map((entry) => ({
        ...entry,
        bp_status: getBloodPressureStatus(entry.systolic, entry.diastolic),
        sugar_status: getBloodSugarStatus(entry.blood_sugar),
        heart_rate_status: getHeartRateStatus(entry.heart_rate),
        weight_status: getWeightStatus(entry.weight),
      })),
    },
    error: null,
  });
}));

app.get("/api/vitals/latest", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const rows = await query(
    `SELECT id, user_id, systolic, diastolic, blood_sugar, heart_rate, weight, notes, logged_at
     FROM vitals_log
     WHERE user_id = ?
     ORDER BY logged_at DESC
     LIMIT 1`,
    [targetUserId]
  );

  const latest = rows[0] || null;

  return res.json({
    data: latest
      ? {
          ...latest,
          bp_status: getBloodPressureStatus(latest.systolic, latest.diastolic),
          sugar_status: getBloodSugarStatus(latest.blood_sugar),
          heart_rate_status: getHeartRateStatus(latest.heart_rate),
          weight_status: getWeightStatus(latest.weight),
          alerts: buildCriticalAlertMessages({
            systolic: latest.systolic,
            bloodSugar: latest.blood_sugar,
          }),
        }
      : null,
    error: null,
  });
}));

app.delete("/api/vitals/:id", authRequired, wrapAsync(async (req, res) => {
  const { id } = req.params;

  await execute("DELETE FROM vitals_log WHERE id = ? AND user_id = ?", [id, req.auth.sub]);

  return res.json({ data: { success: true }, error: null });
}));

app.post("/api/diet/plan", authRequired, wrapAsync(async (req, res) => {
  const {
    title,
    created_by,
    doctor_name,
    start_date,
    end_date,
    notes,
    meals = [],
  } = req.body || {};

  if (!title?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Plan title is required." } });
  }

  if (!["patient", "doctor"].includes(created_by)) {
    return res.status(400).json({ data: null, error: { message: "created_by must be patient or doctor." } });
  }

  if (created_by === "doctor" && !doctor_name?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Doctor name is required for doctor recommended plans." } });
  }

  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ data: null, error: { message: "Add at least one meal to the plan." } });
  }

  const invalidMeal = meals.find((meal) =>
    !["breakfast", "lunch", "dinner", "snack"].includes(meal.meal_type) || !meal.meal_name?.trim()
  );
  if (invalidMeal) {
    return res.status(400).json({ data: null, error: { message: "Each meal needs a valid type and name." } });
  }

  const connection = await getPool().getConnection();
  const planId = randomUUID();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE diet_plans
       SET is_active = FALSE
       WHERE patient_user_id = ?`,
      [req.auth.sub]
    );

    await connection.execute(
      `INSERT INTO diet_plans
        (id, patient_user_id, title, created_by, doctor_name, start_date, end_date, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        planId,
        req.auth.sub,
        title.trim(),
        created_by,
        doctor_name?.trim() || null,
        start_date || null,
        end_date || null,
        notes?.trim() || null,
      ]
    );

    for (const meal of meals) {
      await connection.execute(
        `INSERT INTO diet_plan_meals
          (id, diet_plan_id, meal_type, meal_name, description, calories, avoid_foods, recommended_foods, meal_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          planId,
          meal.meal_type,
          meal.meal_name.trim(),
          meal.description?.trim() || null,
          toNullableNumber(meal.calories),
          normalizeFoodsField(meal.avoid_foods) || null,
          normalizeFoodsField(meal.recommended_foods) || null,
          meal.meal_time?.trim() || null,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return res.json({ data: { id: planId, success: true }, error: null });
}));

app.get("/api/diet/plan/active", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const plans = await query(
    `SELECT *
     FROM diet_plans
     WHERE patient_user_id = ? AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [targetUserId]
  );

  const plan = plans[0] || null;
  if (!plan) {
    return res.json({ data: null, error: null });
  }

  const meals = await query(
    `SELECT *
     FROM diet_plan_meals
     WHERE diet_plan_id = ?
     ORDER BY FIELD(meal_type, 'breakfast', 'lunch', 'dinner', 'snack'), meal_time ASC`,
    [plan.id]
  );

  return res.json({
    data: {
      ...plan,
      meals: meals.map(normalizeMeal),
    },
    error: null,
  });
}));

app.put("/api/diet/plan/:id", authRequired, wrapAsync(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    created_by,
    doctor_name,
    start_date,
    end_date,
    notes,
    meals = [],
  } = req.body || {};

  const existingPlans = await query(
    `SELECT *
     FROM diet_plans
     WHERE id = ? AND patient_user_id = ?
     LIMIT 1`,
    [id, req.auth.sub]
  );

  if (!existingPlans[0]) {
    return res.status(404).json({ data: null, error: { message: "Diet plan not found." } });
  }

  if (!title?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Plan title is required." } });
  }

  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ data: null, error: { message: "Add at least one meal to the plan." } });
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE diet_plans
       SET title = ?, created_by = ?, doctor_name = ?, start_date = ?, end_date = ?, notes = ?
       WHERE id = ?`,
      [
        title.trim(),
        created_by === "doctor" ? "doctor" : "patient",
        doctor_name?.trim() || null,
        start_date || null,
        end_date || null,
        notes?.trim() || null,
        id,
      ]
    );

    await connection.execute("DELETE FROM diet_plan_meals WHERE diet_plan_id = ?", [id]);

    for (const meal of meals) {
      await connection.execute(
        `INSERT INTO diet_plan_meals
          (id, diet_plan_id, meal_type, meal_name, description, calories, avoid_foods, recommended_foods, meal_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          id,
          meal.meal_type,
          meal.meal_name.trim(),
          meal.description?.trim() || null,
          toNullableNumber(meal.calories),
          normalizeFoodsField(meal.avoid_foods) || null,
          normalizeFoodsField(meal.recommended_foods) || null,
          meal.meal_time?.trim() || null,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return res.json({ data: { success: true }, error: null });
}));

app.delete("/api/diet/plan/:id", authRequired, wrapAsync(async (req, res) => {
  const { id } = req.params;

  await execute(
    `UPDATE diet_plans
     SET is_active = FALSE
     WHERE id = ? AND patient_user_id = ?`,
    [id, req.auth.sub]
  );

  return res.json({ data: { success: true }, error: null });
}));

app.post("/api/diet/log", authRequired, wrapAsync(async (req, res) => {
  const { diet_plan_id, meal_type, meal_name, followed_plan, notes } = req.body || {};

  if (!["breakfast", "lunch", "dinner", "snack"].includes(meal_type)) {
    return res.status(400).json({ data: null, error: { message: "Choose a valid meal type." } });
  }

  await execute(
    `INSERT INTO diet_log
      (id, user_id, diet_plan_id, meal_type, meal_name, followed_plan, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      req.auth.sub,
      diet_plan_id || null,
      meal_type,
      meal_name?.trim() || null,
      Boolean(followed_plan),
      notes?.trim() || null,
    ]
  );

  return res.json({ data: { success: true }, error: null });
}));

app.get("/api/diet/log/history", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const rows = await query(
    `SELECT *
     FROM diet_log
     WHERE user_id = ?
       AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     ORDER BY logged_at DESC`,
    [targetUserId]
  );

  const weekRows = rows.filter((row) => new Date(row.logged_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  return res.json({
    data: {
      entries: rows,
      adherence: getDietAdherenceSummary(rows),
      weekly_adherence: getDietAdherenceSummary(weekRows),
    },
    error: null,
  });
}));

app.get("/api/health/summary", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }

  const [latestVitals] = await query(
    `SELECT id, user_id, systolic, diastolic, blood_sugar, heart_rate, weight, notes, logged_at
     FROM vitals_log
     WHERE user_id = ?
     ORDER BY logged_at DESC
     LIMIT 1`,
    [targetUserId]
  );

  const todayLogs = await query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN followed_plan THEN 1 ELSE 0 END) AS followed
     FROM diet_log
     WHERE user_id = ? AND DATE(logged_at) = CURDATE()`,
    [targetUserId]
  );

  const activePlans = await query(
    `SELECT id, title
     FROM diet_plans
     WHERE patient_user_id = ? AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [targetUserId]
  );

  const mealCount = activePlans[0]
    ? await query(
        `SELECT COUNT(*) AS total
         FROM diet_plan_meals
         WHERE diet_plan_id = ?`,
        [activePlans[0].id]
      )
    : [{ total: 0 }];

  return res.json({
    data: {
      vitals: latestVitals
        ? {
            ...latestVitals,
            bp_status: getBloodPressureStatus(latestVitals.systolic, latestVitals.diastolic),
            sugar_status: getBloodSugarStatus(latestVitals.blood_sugar),
          }
        : null,
      diet_today: {
        followed: Number(todayLogs[0]?.followed || 0),
        logged: Number(todayLogs[0]?.total || 0),
        planned: Number(mealCount[0]?.total || 0),
      },
      active_plan: activePlans[0] || null,
    },
    error: null,
  });
}));

app.get("/api/report/health-summary", authRequired, wrapAsync(async (req, res) => {
  const targetUserId = await resolveTargetUserId(req, res);
  if (!targetUserId) {
    return;
  }
  const data = await buildHealthSummaryReportData(targetUserId, req.query.from, req.query.to);
  if (!data) {
    return res.status(404).json({
      data: null,
      error: { message: "Patient not found." },
    });
  }

  return res.json({ data, error: null });
}));

app.post("/api/doctor/invite", authRequired, doctorRoute(async (req, res) => {
  const { patientEmail } = req.body || {};
  if (!patientEmail?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Patient email is required." } });
  }

  const patients = await query(
    `SELECT u.id, p.full_name, u.email
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    [patientEmail.trim()]
  );
  const patient = patients[0];

  if (!patient) {
    return res.status(404).json({ data: null, error: { message: "Patient account not found." } });
  }

  const patientRole = await getUserRoleFromDb(patient.id);
  if (patientRole !== "patient") {
    return res.status(400).json({ data: null, error: { message: "Invites can only be sent to patient accounts." } });
  }

  const existing = await query(
    `SELECT id, status, invite_token
     FROM doctor_patient_links
     WHERE doctor_user_id = ? AND patient_user_id = ?
     LIMIT 1`,
    [req.auth.sub, patient.id]
  );

  const inviteToken = randomUUID();
  if (existing[0]) {
    await execute(
      `UPDATE doctor_patient_links
       SET status = 'pending', invite_token = ?
       WHERE id = ?`,
      [inviteToken, existing[0].id]
    );
  } else {
    await execute(
      `INSERT INTO doctor_patient_links
        (id, doctor_user_id, patient_user_id, status, invite_token)
       VALUES (?, ?, ?, 'pending', ?)`,
      [randomUUID(), req.auth.sub, patient.id, inviteToken]
    );
  }

  return res.json({
    data: {
      patient_id: patient.id,
      patient_name: patient.full_name || patient.email,
      invite_token: inviteToken,
      invite_link: `${req.protocol}://${req.get("host")}/doctor/accept/${inviteToken}`,
    },
    error: null,
  });
}));

app.get("/api/doctor/accept/:token", authRequired, wrapAsync(async (req, res) => {
  const { token } = req.params;
  const rows = await query(
    `SELECT *
     FROM doctor_patient_links
     WHERE invite_token = ?
     LIMIT 1`,
    [token]
  );
  const link = rows[0];

  if (!link) {
    return res.status(404).json({ data: null, error: { message: "Invite not found." } });
  }

  if (link.patient_user_id !== req.auth.sub) {
    return res.status(403).json({ data: null, error: { message: "This invite is not for your account." } });
  }

  await execute(
    `UPDATE doctor_patient_links
     SET status = 'active'
     WHERE id = ?`,
    [link.id]
  );

  return res.json({ data: { success: true }, error: null });
}));

app.get("/api/doctor/patients", authRequired, doctorRoute(async (req, res) => {
  const rows = await query(
    `SELECT dpl.patient_user_id AS id, u.email, p.full_name
     FROM doctor_patient_links dpl
     INNER JOIN users u ON u.id = dpl.patient_user_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE dpl.doctor_user_id = ? AND dpl.status = 'active'
     ORDER BY dpl.created_at DESC`,
    [req.auth.sub]
  );

  const patients = [];
  for (const row of rows) {
    const [adherenceRow] = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('taken', 'late') THEN 1 ELSE 0 END) AS taken
       FROM dose_logs
       WHERE user_id = ?
         AND DATE(scheduled_time) = CURDATE()`,
      [row.id]
    );
    const [latestVitals] = await query(
      `SELECT systolic, diastolic, blood_sugar, logged_at
       FROM vitals_log
       WHERE user_id = ?
       ORDER BY logged_at DESC
       LIMIT 1`,
      [row.id]
    );
    const [lastSeen] = await query(
      `SELECT scheduled_time
       FROM dose_logs
       WHERE user_id = ?
       ORDER BY scheduled_time DESC
       LIMIT 1`,
      [row.id]
    );

    const total = Number(adherenceRow?.total || 0);
    const taken = Number(adherenceRow?.taken || 0);

    patients.push({
      id: row.id,
      name: row.full_name || row.email,
      email: row.email,
      today_adherence: total > 0 ? Math.round((taken / total) * 100) : 0,
      latest_vitals: latestVitals
        ? {
            systolic: latestVitals.systolic,
            diastolic: latestVitals.diastolic,
            blood_sugar: latestVitals.blood_sugar,
          }
        : null,
      last_seen: lastSeen?.scheduled_time || null,
    });
  }

  return res.json({ data: patients, error: null });
}));

app.get("/api/doctor/patient/:patientId/vitals", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;

  const grouped = await query(
    `SELECT
       DATE(logged_at) AS log_date,
       MIN(systolic) AS systolic_min,
       MAX(systolic) AS systolic_max,
       ROUND(AVG(systolic), 1) AS systolic_avg,
       MIN(diastolic) AS diastolic_min,
       MAX(diastolic) AS diastolic_max,
       ROUND(AVG(diastolic), 1) AS diastolic_avg,
       MIN(blood_sugar) AS sugar_min,
       MAX(blood_sugar) AS sugar_max,
       ROUND(AVG(blood_sugar), 1) AS sugar_avg,
       MIN(heart_rate) AS heart_rate_min,
       MAX(heart_rate) AS heart_rate_max,
       ROUND(AVG(heart_rate), 1) AS heart_rate_avg,
       MIN(weight) AS weight_min,
       MAX(weight) AS weight_max,
       ROUND(AVG(weight), 1) AS weight_avg,
       COUNT(*) AS entries_count
     FROM vitals_log
     WHERE user_id = ?
       AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY DATE(logged_at)
     ORDER BY log_date DESC`,
    [patientId]
  );

  const entries = await query(
    `SELECT id, user_id, systolic, diastolic, blood_sugar, heart_rate, weight, notes, logged_at
     FROM vitals_log
     WHERE user_id = ?
       AND logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     ORDER BY logged_at DESC`,
    [patientId]
  );

  const abnormalCount = entries.filter((entry) => {
    const bpStatus = getBloodPressureStatus(entry.systolic, entry.diastolic);
    const sugarStatus = getBloodSugarStatus(entry.blood_sugar);
    return bpStatus === "High" || bpStatus === "Low" || sugarStatus === "High" || sugarStatus === "Low";
  }).length;

  return res.json({
    data: {
      grouped,
      entries: entries.map((entry) => ({
        ...entry,
        bp_status: getBloodPressureStatus(entry.systolic, entry.diastolic),
        sugar_status: getBloodSugarStatus(entry.blood_sugar),
        heart_rate_status: getHeartRateStatus(entry.heart_rate),
        weight_status: getWeightStatus(entry.weight),
      })),
      abnormal_count: abnormalCount,
    },
    error: null,
  });
}));

app.get("/api/doctor/patient/:patientId/adherence", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;

  const medications = await query(
    `SELECT id, name, dosage, strength
     FROM medications
     WHERE user_id = ? AND is_active = TRUE`,
    [patientId]
  );
  const logs = await query(
    `SELECT medication_id, status
     FROM dose_logs
     WHERE user_id = ?
       AND scheduled_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [patientId]
  );

  const perMedication = medications.map((medication) => {
    const medicationLogs = logs.filter((log) => log.medication_id === medication.id);
    const taken = medicationLogs.filter((log) => log.status === "taken" || log.status === "late").length;
    const missed = medicationLogs.filter((log) => log.status === "missed").length;
    const total = medicationLogs.length;
    return {
      medication_id: medication.id,
      name: medication.name,
      dosage: medication.dosage || medication.strength || null,
      taken,
      missed,
      percentage: total > 0 ? Math.round((taken / total) * 100) : 0,
    };
  });

  const totalDoses = perMedication.reduce((sum, item) => sum + item.taken + item.missed, 0);
  const takenDoses = perMedication.reduce((sum, item) => sum + item.taken, 0);

  return res.json({
    data: {
      overall_percentage: totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0,
      per_medication: perMedication,
    },
    error: null,
  });
}));

app.post("/api/doctor/patient/:patientId/diet", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;

  const doctorProfiles = await query(
    `SELECT full_name
     FROM doctor_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [req.auth.sub]
  );
  const doctorName = doctorProfiles[0]?.full_name;
  const payload = {
    ...req.body,
    created_by: "doctor",
    doctor_name: doctorName || req.body?.doctor_name || "Doctor",
  };

  const {
    title,
    created_by,
    doctor_name,
    start_date,
    end_date,
    notes,
    meals = [],
  } = payload || {};

  if (!title?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Plan title is required." } });
  }
  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ data: null, error: { message: "Add at least one meal to the plan." } });
  }

  const connection = await getPool().getConnection();
  const planId = randomUUID();
  try {
    await connection.beginTransaction();
    await connection.execute(`UPDATE diet_plans SET is_active = FALSE WHERE patient_user_id = ?`, [patientId]);
    await connection.execute(
      `INSERT INTO diet_plans
        (id, patient_user_id, title, created_by, doctor_name, start_date, end_date, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [planId, patientId, title.trim(), created_by, doctor_name || null, start_date || null, end_date || null, notes?.trim() || null]
    );
    for (const meal of meals) {
      await connection.execute(
        `INSERT INTO diet_plan_meals
          (id, diet_plan_id, meal_type, meal_name, description, calories, avoid_foods, recommended_foods, meal_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          planId,
          meal.meal_type,
          meal.meal_name.trim(),
          meal.description?.trim() || null,
          toNullableNumber(meal.calories),
          normalizeFoodsField(meal.avoid_foods) || null,
          normalizeFoodsField(meal.recommended_foods) || null,
          meal.meal_time?.trim() || null,
        ]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return res.json({ data: { success: true, id: planId }, error: null });
}));

app.put("/api/doctor/patient/:patientId/diet/:planId", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;
  const { planId } = req.params;
  const doctorProfiles = await query(`SELECT full_name FROM doctor_profiles WHERE user_id = ? LIMIT 1`, [req.auth.sub]);
  req.body = {
    ...req.body,
    created_by: "doctor",
    doctor_name: doctorProfiles[0]?.full_name || req.body?.doctor_name || "Doctor",
  };

  const {
    title,
    created_by,
    doctor_name,
    start_date,
    end_date,
    notes,
    meals = [],
  } = req.body || {};

  await execute(
    `UPDATE diet_plans
     SET title = ?, created_by = ?, doctor_name = ?, start_date = ?, end_date = ?, notes = ?
     WHERE id = ? AND patient_user_id = ?`,
    [title?.trim(), created_by, doctor_name || null, start_date || null, end_date || null, notes?.trim() || null, planId, patientId]
  );
  await execute(`DELETE FROM diet_plan_meals WHERE diet_plan_id = ?`, [planId]);
  for (const meal of meals) {
    await execute(
      `INSERT INTO diet_plan_meals
        (id, diet_plan_id, meal_type, meal_name, description, calories, avoid_foods, recommended_foods, meal_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        planId,
        meal.meal_type,
        meal.meal_name.trim(),
        meal.description?.trim() || null,
        toNullableNumber(meal.calories),
        normalizeFoodsField(meal.avoid_foods) || null,
        normalizeFoodsField(meal.recommended_foods) || null,
        meal.meal_time?.trim() || null,
      ]
    );
  }

  return res.json({ data: { success: true }, error: null });
}));

app.post("/api/doctor/notes", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;
  const { note } = req.body || {};
  if (!note?.trim()) {
    return res.status(400).json({ data: null, error: { message: "Note is required." } });
  }

  const id = randomUUID();
  await execute(
    `INSERT INTO doctor_notes (id, doctor_user_id, patient_user_id, note, is_read)
     VALUES (?, ?, ?, ?, FALSE)`,
    [id, req.auth.sub, patientId, note.trim()]
  );

  return res.json({ data: { success: true, id }, error: null });
}));

app.get("/api/doctor/patient/:patientId/notes", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;

  const rows = await query(
    `SELECT dn.*, dp.full_name AS doctor_name
     FROM doctor_notes dn
     LEFT JOIN doctor_profiles dp ON dp.user_id = dn.doctor_user_id
     WHERE dn.patient_user_id = ?
     ORDER BY dn.created_at DESC`,
    [patientId]
  );

  return res.json({ data: rows, error: null });
}));

app.get("/api/doctor/patient/:patientId/report", authRequired, doctorRoute(async (req, res) => {
  const patientId = await resolveDoctorPatientId(req, res);
  if (!patientId) return;
  const data = await buildHealthSummaryReportData(patientId, req.query.from, req.query.to);
  return res.json({ data, error: null });
}));

app.get("/api/doctor/profile", authRequired, doctorRoute(async (req, res) => {
  const rows = await query(`SELECT * FROM doctor_profiles WHERE user_id = ? LIMIT 1`, [req.auth.sub]);
  return res.json({ data: rows[0] || null, error: null });
}));

app.get("/api/doctor/invites/pending", authRequired, wrapAsync(async (req, res) => {
  const rows = await query(
    `SELECT dpl.id, dpl.invite_token, dpl.created_at, dp.full_name AS doctor_name, dp.specialization
     FROM doctor_patient_links dpl
     LEFT JOIN doctor_profiles dp ON dp.user_id = dpl.doctor_user_id
     WHERE dpl.patient_user_id = ? AND dpl.status = 'pending'
     ORDER BY dpl.created_at DESC`,
    [req.auth.sub]
  );

  return res.json({ data: rows, error: null });
}));

app.get("/api/patient/doctor-notes", authRequired, wrapAsync(async (req, res) => {
  const rows = await query(
    `SELECT dn.*, dp.full_name AS doctor_name
     FROM doctor_notes dn
     LEFT JOIN doctor_profiles dp ON dp.user_id = dn.doctor_user_id
     WHERE dn.patient_user_id = ?
     ORDER BY dn.created_at DESC`,
    [req.auth.sub]
  );

  return res.json({ data: rows, error: null });
}));

app.post("/api/patient/doctor-notes/read", authRequired, wrapAsync(async (req, res) => {
  await execute(
    `UPDATE doctor_notes
     SET is_read = TRUE
     WHERE patient_user_id = ?`,
    [req.auth.sub]
  );

  return res.json({ data: { success: true }, error: null });
}));

app.post("/api/auth/signup", wrapAsync(async (req, res) => {
  const { email, password, fullName, role, doctorProfile } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: { message: "Email and password are required" } });
  }

  const existing = await query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: { message: "User already registered" } });
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  await execute(
    "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
    [id, email, passwordHash, fullName || null]
  );

  await execute(
    "INSERT INTO profiles (id, full_name) VALUES (?, ?)",
    [id, fullName || null]
  );

  await execute(
    "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)",
    [randomUUID(), id, role || "patient"]
  );

  if (role === "doctor") {
    await execute(
      `INSERT INTO doctor_profiles
        (id, user_id, full_name, specialization, license_number, hospital, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        fullName || email,
        doctorProfile?.specialization?.trim() || null,
        doctorProfile?.license_number?.trim() || null,
        doctorProfile?.hospital?.trim() || null,
        doctorProfile?.phone?.trim() || null,
      ]
    );
  }

  const session = signSession({ id, email, full_name: fullName || null });
  res.json({ data: session, error: null });
}));

app.post("/api/auth/register", wrapAsync(async (req, res) => {
  const { email, password, fullName, role, doctorProfile } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: { message: "Email and password are required" } });
  }

  const existing = await query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: { message: "User already registered" } });
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  await execute(
    "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
    [id, email, passwordHash, fullName || null]
  );
  await execute("INSERT INTO profiles (id, full_name) VALUES (?, ?)", [id, fullName || null]);
  await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [randomUUID(), id, role || "patient"]);

  if (role === "doctor") {
    await execute(
      `INSERT INTO doctor_profiles
        (id, user_id, full_name, specialization, license_number, hospital, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        fullName || email,
        doctorProfile?.specialization?.trim() || null,
        doctorProfile?.license_number?.trim() || null,
        doctorProfile?.hospital?.trim() || null,
        doctorProfile?.phone?.trim() || null,
      ]
    );
  }

  return res.json({ data: signSession({ id, email, full_name: fullName || null }), error: null });
}));

app.post("/api/auth/login", wrapAsync(async (req, res) => {
  const { email, password } = req.body || {};
  const users = await query("SELECT * FROM users WHERE email = ?", [email]);
  const user = users[0];

  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    return res.status(401).json({ error: { message: "Invalid login credentials" } });
  }

  res.json({ data: signSession(user), error: null });
}));

app.get("/api/auth/session", authRequired, wrapAsync(async (req, res) => {
  const users = await query("SELECT id, email, full_name FROM users WHERE id = ?", [req.auth.sub]);
  const user = users[0];
  if (!user) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  res.json({ data: { session: signSession(user) }, error: null });
}));

app.get("/api/auth/user", authRequired, wrapAsync(async (req, res) => {
  const users = await query("SELECT id, email, full_name FROM users WHERE id = ?", [req.auth.sub]);
  const user = users[0];
  if (!user) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  res.json({
    data: {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          full_name: user.full_name,
        },
      },
    },
    error: null,
  });
}));

app.post("/api/auth/logout", (_req, res) => {
  res.json({ data: { success: true }, error: null });
});

app.post("/api/db/:table/query", authRequired, wrapAsync(async (req, res) => {
  const { table } = req.params;
  if (!allowedTables.has(table)) {
    return res.status(404).json({ error: { message: "Unknown table" } });
  }

  const { filters = [], order, limit, select, single, head, count } = req.body || {};
  const columns = buildSelectColumns(select);
  const where = buildWhere(filters);
  const orderClause = order?.column
    ? ` ORDER BY \`${order.column}\` ${order.ascending === false ? "DESC" : "ASC"}`
    : "";
  const limitClause = Number.isFinite(limit) ? ` LIMIT ${Number(limit)}` : "";

  if (head && count === "exact") {
    const rows = await query(`SELECT COUNT(*) AS total FROM \`${table}\`${where.clause}`, where.params);
    return res.json({ data: null, count: rows[0]?.total || 0, error: null });
  }

  const rows = await query(
    `SELECT ${columns} FROM \`${table}\`${where.clause}${orderClause}${limitClause}`,
    where.params
  );
  const data = rows.map((row) => normalizeRow(table, row));

  if (single) {
    if (!data.length) {
      return res.json({
        data: null,
        error: { message: "No rows found", code: "PGRST116" },
      });
    }
    return res.json({ data: data[0], error: null });
  }

  return res.json({ data, error: null });
}));

app.post("/api/db/:table/insert", authRequired, wrapAsync(async (req, res) => {
  const { table } = req.params;
  if (!allowedTables.has(table)) {
    return res.status(404).json({ error: { message: "Unknown table" } });
  }

  const payload = Array.isArray(req.body?.values) ? req.body.values : [req.body?.values];
  const rowsToInsert = payload
    .filter(Boolean)
    .map((row) => ({ id: row.id || randomUUID(), ...row }));

  for (const row of rowsToInsert) {
    const columns = Object.keys(row);
    const values = columns.map((column) => normalizeValue(table, column, row[column]));
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${placeholders})`;
    await execute(sql, values);
  }

  const inserted = rowsToInsert.map((row) => normalizeRow(table, row));
  res.json({ data: req.body?.single ? inserted[0] : inserted, error: null });
}));

app.post("/api/db/:table/update", authRequired, wrapAsync(async (req, res) => {
  const { table } = req.params;
  if (!allowedTables.has(table)) {
    return res.status(404).json({ error: { message: "Unknown table" } });
  }

  const values = req.body?.values || {};
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const setClause = entries.map(([column]) => `\`${column}\` = ?`).join(", ");
  const setParams = entries.map(([column, value]) => normalizeValue(table, column, value));
  const where = buildWhere(req.body?.filters || []);

  await execute(
    `UPDATE \`${table}\` SET ${setClause}${where.clause}`,
    [...setParams, ...where.params]
  );

  if (req.body?.select) {
    const rows = await query(
      `SELECT ${buildSelectColumns(req.body.select)} FROM \`${table}\`${where.clause}`,
      where.params
    );
    const data = rows.map((row) => normalizeRow(table, row));
    return res.json({ data, error: null });
  }

  return res.json({ data: null, error: null });
}));

app.post("/api/db/:table/delete", authRequired, wrapAsync(async (req, res) => {
  const { table } = req.params;
  if (!allowedTables.has(table)) {
    return res.status(404).json({ error: { message: "Unknown table" } });
  }

  const where = buildWhere(req.body?.filters || []);
  await execute(`DELETE FROM \`${table}\`${where.clause}`, where.params);
  res.json({ data: null, error: null });
}));

app.post("/api/functions/:name", authRequired, wrapAsync(async (req, res) => {
  const { name } = req.params;

  if (name === "check-interactions") {
    return res.json({ data: { success: true, interactions: [] }, error: null });
  }

  if (name === "generate-insights") {
    return res.json({ data: { insights: [] }, error: null });
  }

  if (name === "pill-identify") {
    return res.json({
      data: {
        success: false,
        error: "AI pill identification is not configured in local MySQL mode yet.",
      },
      error: null,
    });
  }

  if (name === "invite-caregiver") {
    const { caregiverEmail, patientId } = req.body || {};
    const users = await query("SELECT id, full_name FROM users WHERE email = ?", [caregiverEmail]);
    const caregiver = users[0];

    if (!caregiver) {
      return res.json({
        data: {
          pendingEmail: true,
        },
        error: null,
      });
    }

    await execute(
      `INSERT INTO caregiver_links (id, patient_id, caregiver_id, permissions, status)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), permissions = VALUES(permissions)`,
      [
        randomUUID(),
        patientId,
        caregiver.id,
        JSON.stringify({
          view_adherence: true,
          receive_alerts: true,
          modify_medications: false,
        }),
        "pending",
      ]
    );

    return res.json({ data: { success: true }, error: null });
  }

  return res.json({
    data: { success: false, error: `${name} is not implemented in local MySQL mode.` },
    error: null,
  });
}));

app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  res.status(500).json({
    data: null,
    error: {
      message: error?.sqlMessage || error?.message || "Internal server error",
      code: error?.code || "SERVER_ERROR",
    },
  });
});

async function startServer() {
  app.listen(port, () => {
    console.log(`MySQL API running on http://localhost:${port}`);
  });

  ensureAppTables().catch((error) => {
    console.warn(
      "App tables could not be verified yet. Start MySQL and run npm run db:init if health or card features fail.",
      error?.message || error
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start MySQL API:", error);
  process.exit(1);
});
