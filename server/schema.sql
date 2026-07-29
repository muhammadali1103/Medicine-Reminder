CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  date_of_birth DATE NULL,
  consent_notifications BOOLEAN DEFAULT TRUE,
  consent_data_sharing BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(100) DEFAULT 'America/New_York',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  role ENUM('patient', 'caregiver', 'doctor') NOT NULL DEFAULT 'patient',
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255) NULL,
  brand_name VARCHAR(255) NULL,
  strength VARCHAR(100) NULL,
  dosage VARCHAR(100) NULL,
  form VARCHAR(100) DEFAULT 'tablet',
  color VARCHAR(50) NULL,
  shape VARCHAR(50) NULL,
  imprint VARCHAR(100) NULL,
  schedule JSON NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  instructions TEXT NULL,
  refill_reminder BOOLEAN DEFAULT TRUE,
  pills_remaining INT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  confidence_score DECIMAL(5,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_medications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id VARCHAR(36) PRIMARY KEY,
  medication_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  scheduled_time DATETIME NOT NULL,
  taken_time DATETIME NULL,
  status ENUM('pending', 'taken', 'missed', 'late', 'skipped') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  verified_by_photo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dose_logs_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  CONSTRAINT fk_dose_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interaction_warnings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  medication_ids JSON NOT NULL,
  interaction_type VARCHAR(255) NOT NULL,
  risk_level ENUM('low', 'medium', 'high') NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_interaction_warnings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS caregiver_links (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  caregiver_id VARCHAR(36) NOT NULL,
  permissions JSON NOT NULL,
  status ENUM('pending', 'active', 'rejected', 'revoked') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_patient_caregiver (patient_id, caregiver_id),
  CONSTRAINT fk_caregiver_links_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_caregiver_links_caregiver FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS vitals_log (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  systolic INT NULL,
  diastolic INT NULL,
  blood_sugar DECIMAL(5,2) NULL,
  heart_rate INT NULL,
  weight DECIMAL(5,2) NULL,
  notes TEXT NULL,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vitals_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diet_plans (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
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
);

CREATE TABLE IF NOT EXISTS diet_plan_meals (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  diet_plan_id VARCHAR(36) NOT NULL,
  meal_type ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  meal_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  calories INT NULL,
  avoid_foods TEXT NULL,
  recommended_foods TEXT NULL,
  meal_time VARCHAR(50) NULL,
  CONSTRAINT fk_diet_plan_meals_plan FOREIGN KEY (diet_plan_id) REFERENCES diet_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diet_log (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  diet_plan_id VARCHAR(36) NULL,
  meal_type ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  meal_name VARCHAR(255) NULL,
  followed_plan BOOLEAN DEFAULT FALSE,
  notes TEXT NULL,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_diet_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_diet_log_plan FOREIGN KEY (diet_plan_id) REFERENCES diet_plans(id)
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  specialization VARCHAR(255) NULL,
  license_number VARCHAR(100) NULL,
  hospital VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctor_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doctor_patient_links (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  doctor_user_id VARCHAR(36) NOT NULL,
  patient_user_id VARCHAR(36) NOT NULL,
  status ENUM('pending','active','revoked') DEFAULT 'pending',
  invite_token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_doctor_patient (doctor_user_id, patient_user_id),
  CONSTRAINT fk_doctor_patient_links_doctor FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctor_patient_links_patient FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doctor_notes (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  doctor_user_id VARCHAR(36) NOT NULL,
  patient_user_id VARCHAR(36) NOT NULL,
  note TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctor_notes_doctor FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctor_notes_patient FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_goals (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
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
);

CREATE TABLE IF NOT EXISTS notification_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
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
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  medication_id VARCHAR(36) NOT NULL,
  dose_log_id VARCHAR(36) NOT NULL,
  reminder_number INT DEFAULT 1,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action_taken ENUM('taken','snoozed','dismissed','escalated','ignored') NULL,
  snooze_minutes INT NULL,
  action_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  FOREIGN KEY (dose_log_id) REFERENCES dose_logs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS caregiver_notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  caregiver_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  medication_id VARCHAR(36) NULL,
  dose_log_id VARCHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('escalation','health_alert','missed_dose','system') NOT NULL DEFAULT 'escalation',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL,
  FOREIGN KEY (dose_log_id) REFERENCES dose_logs(id) ON DELETE SET NULL
);
