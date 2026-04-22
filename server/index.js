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
  "emergency_profiles",
  "vitals_log",
  "diet_plans",
  "diet_plan_meals",
  "diet_log",
]);

const jsonColumns = {
  medications: new Set(["schedule"]),
  interaction_warnings: new Set(["medication_ids"]),
  caregiver_links: new Set(["permissions"]),
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

  const canAccess = await ensureCaregiverAccess(req.auth.sub, requestedUserId);
  if (!canAccess) {
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

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

  const { from, to } = req.query;
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
    return res.status(404).json({
      data: null,
      error: { message: "Patient not found." },
    });
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

  return res.json({
    data: {
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
    },
    error: null,
  });
}));

app.post("/api/auth/signup", wrapAsync(async (req, res) => {
  const { email, password, fullName, role } = req.body || {};

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

  const session = signSession({ id, email, full_name: fullName || null });
  res.json({ data: session, error: null });
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
