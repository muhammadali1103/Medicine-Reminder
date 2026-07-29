<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Throwable;

class ApiController extends Controller
{
    private array $allowedTables = [
        'profiles', 'user_roles', 'medications', 'dose_logs', 'interaction_warnings',
        'caregiver_links', 'doctor_profiles', 'doctor_patient_links', 'doctor_notes',
        'emergency_profiles', 'vitals_log', 'diet_plans', 'diet_plan_meals', 'diet_log',
        'health_goals', 'notification_settings', 'notification_logs', 'caregiver_notifications',
    ];

    private array $jsonColumns = [
        'medications' => ['schedule'],
        'interaction_warnings' => ['medication_ids'],
        'caregiver_links' => ['permissions'],
        'notification_settings' => ['snooze_options', 'medication_sound_overrides'],
    ];

    private array $defaultNotificationSettings = [
        'first_reminder_sound' => 'gentle',
        'second_reminder_sound' => 'medium',
        'third_reminder_sound' => 'urgent',
        'snooze_options' => [10, 20, 30],
        'medication_sound_overrides' => [],
        'escalate_to_caregiver' => true,
        'escalate_after_minutes' => 30,
        'quiet_hours_start' => null,
        'quiet_hours_end' => null,
        'vibrate_only' => false,
    ];

    public function health(): JsonResponse
    {
        return $this->ok(['status' => 'ok']);
    }

    public function signup(Request $request): JsonResponse
    {
        try {
            $email = $request->string('email')->lower()->trim()->toString();
            $password = (string) $request->input('password', '');
            $fullName = $request->input('fullName');
            $role = $request->input('role', 'patient') ?: 'patient';
            $doctorProfile = $request->input('doctorProfile', []);

            if ($email === '' || $password === '') {
                return $this->fail('Email and password are required', 400);
            }

            if (DB::table('users')->where('email', $email)->exists()) {
                return $this->fail('User already registered', 409);
            }

            $id = (string) Str::uuid();
            DB::transaction(function () use ($id, $email, $password, $fullName, $role, $doctorProfile): void {
                DB::table('users')->insert([
                    'id' => $id,
                    'email' => $email,
                    'password_hash' => Hash::make($password),
                    'full_name' => $fullName ?: null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                DB::table('profiles')->insert(['id' => $id, 'full_name' => $fullName ?: null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('user_roles')->insert(['id' => (string) Str::uuid(), 'user_id' => $id, 'role' => in_array($role, ['patient', 'caregiver', 'doctor'], true) ? $role : 'patient']);

                if ($role === 'doctor') {
                    DB::table('doctor_profiles')->insert([
                        'id' => (string) Str::uuid(),
                        'user_id' => $id,
                        'full_name' => $fullName ?: $email,
                        'specialization' => $doctorProfile['specialization'] ?? null,
                        'license_number' => $doctorProfile['license_number'] ?? null,
                        'hospital' => $doctorProfile['hospital'] ?? null,
                        'phone' => $doctorProfile['phone'] ?? null,
                        'created_at' => now(),
                    ]);
                }
            });

            return response()->json(['data' => $this->signSession((object) ['id' => $id, 'email' => $email, 'full_name' => $fullName ?: null]), 'error' => null]);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function login(Request $request): JsonResponse
    {
        try {
            $user = DB::table('users')->where('email', $request->input('email'))->first();
            if (! $user || ! Hash::check((string) $request->input('password', ''), $user->password_hash)) {
                return $this->fail('Invalid login credentials', 401);
            }

            return response()->json(['data' => $this->signSession($user), 'error' => null]);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function session(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $user = DB::table('users')->select('id', 'email', 'full_name')->where('id', $auth->sub)->first();
        return $user ? $this->ok(['session' => $this->signSession($user)]) : $this->fail('User not found', 404);
    }

    public function user(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $user = DB::table('users')->select('id', 'email', 'full_name')->where('id', $auth->sub)->first();
        if (! $user) {
            return $this->fail('User not found', 404);
        }

        return $this->ok(['user' => $this->publicUser($user)]);
    }

    public function logout(): JsonResponse
    {
        return $this->ok(['success' => true]);
    }

    public function dbQuery(Request $request, string $table): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        if (! in_array($table, $this->allowedTables, true)) {
            return $this->fail('Unknown table', 404);
        }

        try {
            $query = DB::table($table);
            $this->applyFilters($query, $request->input('filters', []));
            if ($request->input('head') && $request->input('count') === 'exact') {
                return response()->json(['data' => null, 'count' => $query->count(), 'error' => null]);
            }
            $this->applySelect($query, $request->input('select', '*'));
            if ($order = $request->input('order')) {
                $query->orderBy($order['column'], ($order['ascending'] ?? true) === false ? 'desc' : 'asc');
            }
            if (is_numeric($request->input('limit'))) {
                $query->limit((int) $request->input('limit'));
            }
            $rows = $query->get()->map(fn ($row) => $this->normalizeRow($table, (array) $row))->values()->all();
            if ($request->boolean('single')) {
                return $rows ? $this->ok($rows[0]) : response()->json(['data' => null, 'error' => ['message' => 'No rows found', 'code' => 'PGRST116']]);
            }

            return $this->ok($rows);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function dbInsert(Request $request, string $table): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        if (! in_array($table, $this->allowedTables, true)) {
            return $this->fail('Unknown table', 404);
        }

        try {
            $payload = $request->input('values', []);
            $rows = array_is_list($payload) ? $payload : [$payload];
            $inserted = [];
            foreach ($rows as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $row = array_merge(['id' => (string) Str::uuid()], $row);
                $dbRow = $this->normalizeForDb($table, $row);
                DB::table($table)->insert($dbRow);
                $inserted[] = $this->normalizeRow($table, $row);
            }

            return $this->ok($request->boolean('single') ? ($inserted[0] ?? null) : $inserted);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function dbUpdate(Request $request, string $table): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        if (! in_array($table, $this->allowedTables, true)) {
            return $this->fail('Unknown table', 404);
        }

        try {
            $values = array_filter((array) $request->input('values', []), fn ($value) => $value !== null || true);
            $query = DB::table($table);
            $this->applyFilters($query, $request->input('filters', []));
            $query->update($this->normalizeForDb($table, $values));

            if ($request->input('select')) {
                $selectQuery = DB::table($table);
                $this->applyFilters($selectQuery, $request->input('filters', []));
                $this->applySelect($selectQuery, $request->input('select', '*'));
                return $this->ok($selectQuery->get()->map(fn ($row) => $this->normalizeRow($table, (array) $row))->all());
            }

            return $this->ok(null);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function dbDelete(Request $request, string $table): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        if (! in_array($table, $this->allowedTables, true)) {
            return $this->fail('Unknown table', 404);
        }

        try {
            $query = DB::table($table);
            $this->applyFilters($query, $request->input('filters', []));
            $query->delete();
            return $this->ok(null);
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function functionInvoke(Request $request, string $name): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        if ($name === 'check-interactions') {
            return $this->ok(['success' => true, 'interactions' => []]);
        }
        if ($name === 'generate-insights') {
            return $this->ok(['insights' => []]);
        }
        if ($name === 'pill-identify') {
            return $this->ok(['success' => false, 'error' => 'AI pill identification is not configured in local MySQL mode yet.']);
        }
        if ($name === 'invite-caregiver') {
            $caregiver = DB::table('users')->where('email', $request->input('caregiverEmail'))->first();
            if (! $caregiver) {
                return $this->ok(['pendingEmail' => true]);
            }
            DB::table('caregiver_links')->updateOrInsert(
                ['patient_id' => $request->input('patientId'), 'caregiver_id' => $caregiver->id],
                [
                    'id' => (string) Str::uuid(),
                    'permissions' => json_encode(['view_adherence' => true, 'receive_alerts' => true, 'modify_medications' => false]),
                    'status' => 'pending',
                    'created_at' => now(),
                ]
            );
            return $this->ok(['success' => true]);
        }

        return $this->ok(['success' => false, 'error' => "$name is not implemented in local MySQL mode."]);
    }

    public function publicEmergencyCard(string $cardId): JsonResponse
    {
        try {
            $profile = DB::table('emergency_profiles')->where('card_id', $cardId)->where('is_active', true)->first();
            if (! $profile) {
                return $this->fail('Emergency card not found', 404);
            }

            $medications = DB::table('medications')->where('user_id', $profile->user_id)->where('is_active', true)->get();
            return $this->ok(array_merge((array) $profile, ['medications' => $medications]));
        } catch (Throwable $error) {
            return $this->serverError($error);
        }
    }

    public function notificationSettings(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $settings = DB::table('notification_settings')->where('user_id', $auth->sub)->first();
        if (! $settings) {
            $settings = array_merge(['id' => (string) Str::uuid(), 'user_id' => $auth->sub], $this->defaultNotificationSettings);
            DB::table('notification_settings')->insert($this->normalizeForDb('notification_settings', $settings));
        }

        return $this->ok($this->normalizeRow('notification_settings', (array) $settings));
    }

    public function updateNotificationSettings(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $values = $request->only(array_keys($this->defaultNotificationSettings));
        DB::table('notification_settings')->updateOrInsert(
            ['user_id' => $auth->sub],
            array_merge(['id' => (string) Str::uuid(), 'updated_at' => now()], $this->normalizeForDb('notification_settings', $values))
        );

        return $this->notificationSettings($request);
    }

    public function pendingNotifications(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $rows = DB::table('dose_logs as dl')
            ->join('medications as m', 'm.id', '=', 'dl.medication_id')
            ->where('dl.user_id', $auth->sub)
            ->where('dl.status', 'pending')
            ->where('dl.scheduled_time', '<=', now()->addMinutes(5))
            ->orderBy('dl.scheduled_time')
            ->select('dl.*', 'm.name as medication_name', 'm.dosage', 'm.strength')
            ->get();

        return $this->ok($rows);
    }

    public function snoozeNotification(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $minutes = max(1, (int) $request->input('snoozeMinutes', 10));
        $dose = DB::table('dose_logs')->where('id', $request->input('doseLogId'))->where('user_id', $auth->sub)->first();
        if (! $dose) {
            return $this->fail('Dose log not found', 404);
        }
        $until = now()->addMinutes($minutes);
        DB::table('dose_logs')->where('id', $dose->id)->update(['scheduled_time' => $until]);
        return $this->ok(['snoozed_until' => $until->toDateTimeString(), 'snooze_minutes' => $minutes]);
    }

    public function escalateNotification(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $caregivers = DB::table('caregiver_links')->where('patient_id', $auth->sub)->where('status', 'active')->get();
        foreach ($caregivers as $link) {
            DB::table('caregiver_notifications')->insert([
                'id' => (string) Str::uuid(),
                'caregiver_id' => $link->caregiver_id,
                'patient_id' => $auth->sub,
                'medication_id' => $request->input('medicationId'),
                'dose_log_id' => $request->input('doseLogId'),
                'title' => 'Missed medication alert',
                'message' => $request->input('message', 'A medication reminder needs attention.'),
                'type' => 'escalation',
                'is_read' => false,
                'created_at' => now(),
            ]);
        }
        return $this->ok(['caregiver_count' => $caregivers->count()]);
    }

    public function logVitals(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }

        $values = $this->validateVitals($request);
        if (isset($values['error'])) {
            return $this->fail($values['error'], 400);
        }

        $row = array_merge(['id' => (string) Str::uuid(), 'user_id' => $auth->sub, 'notes' => $request->input('notes'), 'logged_at' => now()], $values);
        DB::table('vitals_log')->insert($row);
        return $this->ok(array_merge($row, ['alerts' => $this->criticalAlerts($row)]));
    }

    public function vitalsHistory(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $userId = $this->resolveTargetUserId($request, $auth->sub);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        $query = DB::table('vitals_log')->where('user_id', $userId);
        $this->applyDateRange($query, 'logged_at', $request);
        $entries = $query->orderByDesc('logged_at')->get()->map(fn ($row) => $this->vitalStatuses((array) $row))->values();
        return $this->ok(['grouped' => $this->groupVitals($entries), 'entries' => $entries]);
    }

    public function latestVitals(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $userId = $this->resolveTargetUserId($request, $auth->sub);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }
        $row = DB::table('vitals_log')->where('user_id', $userId)->orderByDesc('logged_at')->first();
        return $this->ok($row ? array_merge($this->vitalStatuses((array) $row), ['alerts' => $this->criticalAlerts((array) $row)]) : null);
    }

    public function deleteVitals(Request $request, string $id): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('vitals_log')->where('id', $id)->where('user_id', $auth->sub)->delete();
        return $this->ok(['success' => true]);
    }

    public function createGoal(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $row = array_merge($request->only(['goal_type', 'target_value', 'target_direction', 'start_date', 'target_date']), [
            'id' => (string) Str::uuid(),
            'user_id' => $auth->sub,
            'is_achieved' => false,
            'is_active' => true,
            'created_at' => now(),
        ]);
        DB::table('health_goals')->insert($row);
        return $this->ok($row);
    }

    public function goals(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $rows = DB::table('health_goals')->where('user_id', $auth->sub)->where('is_active', true)->orderByDesc('created_at')->get()
            ->map(fn ($goal) => $this->shapeGoal((array) $goal));
        return $this->ok([
            'active' => $rows->where('is_achieved', false)->values(),
            'achieved' => $rows->where('is_achieved', true)->values(),
        ]);
    }

    public function updateGoal(Request $request, string $id): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('health_goals')->where('id', $id)->where('user_id', $auth->sub)->update($request->only(['goal_type', 'target_value', 'target_direction', 'start_date', 'target_date', 'is_achieved', 'achieved_at', 'is_active']));
        $goal = DB::table('health_goals')->where('id', $id)->first();
        return $this->ok($goal ? $this->shapeGoal((array) $goal) : null);
    }

    public function deleteGoal(Request $request, string $id): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('health_goals')->where('id', $id)->where('user_id', $auth->sub)->update(['is_active' => false]);
        return $this->ok(['success' => true]);
    }

    public function checkGoals(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->ok(DB::table('health_goals')->where('user_id', $auth->sub)->where('is_active', true)->get()->map(fn ($goal) => $this->shapeGoal((array) $goal)));
    }

    public function createDietPlan(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->saveDietPlan($request, $auth->sub);
    }

    public function activeDietPlan(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $userId = $this->resolveTargetUserId($request, $auth->sub);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }
        $plan = DB::table('diet_plans')->where('patient_user_id', $userId)->where('is_active', true)->orderByDesc('created_at')->first();
        if (! $plan) {
            return $this->ok(null);
        }
        $plan->meals = DB::table('diet_plan_meals')->where('diet_plan_id', $plan->id)->get();
        return $this->ok($plan);
    }

    public function updateDietPlan(Request $request, string $id): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->saveDietPlan($request, $auth->sub, $id);
    }

    public function deleteDietPlan(Request $request, string $id): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('diet_plans')->where('id', $id)->where('patient_user_id', $auth->sub)->update(['is_active' => false]);
        return $this->ok(['success' => true]);
    }

    public function logDiet(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('diet_log')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $auth->sub,
            'diet_plan_id' => $request->input('diet_plan_id'),
            'meal_type' => $request->input('meal_type'),
            'meal_name' => $request->input('meal_name'),
            'followed_plan' => $request->boolean('followed_plan'),
            'notes' => $request->input('notes'),
            'logged_at' => now(),
        ]);
        return $this->ok(['success' => true]);
    }

    public function dietHistory(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $userId = $this->resolveTargetUserId($request, $auth->sub);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }
        $query = DB::table('diet_log')->where('user_id', $userId);
        $this->applyDateRange($query, 'logged_at', $request);
        $entries = $query->orderByDesc('logged_at')->get();
        $followed = $entries->where('followed_plan', true)->count();
        $summary = $this->dietSummary($entries);
        return $this->ok(['entries' => $entries, 'adherence' => $summary, 'weekly_adherence' => $summary, 'summary' => ['total' => $entries->count(), 'followed' => $followed, 'percentage' => $entries->count() ? round($followed / $entries->count() * 100) : 0]]);
    }

    public function healthSummary(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $userId = $this->resolveTargetUserId($request, $auth->sub);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }
        return $this->ok($this->buildHealthSummary($userId, $request));
    }

    public function healthReport(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->ok($this->buildHealthSummary($auth->sub, $request));
    }

    public function doctorInvite(Request $request): JsonResponse
    {
        $auth = $this->doctorAuth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $patient = DB::table('users')->where('email', $request->input('patientEmail'))->first();
        if (! $patient) {
            return $this->fail('Patient not found', 404);
        }
        $token = Str::random(48);
        DB::table('doctor_patient_links')->updateOrInsert(
            ['doctor_user_id' => $auth->sub, 'patient_user_id' => $patient->id],
            ['id' => (string) Str::uuid(), 'status' => 'pending', 'invite_token' => $token, 'created_at' => now()]
        );
        return $this->ok(['success' => true, 'invite_token' => $token, 'invite_link' => url("/doctor/invite/$token")]);
    }

    public function doctorAccept(Request $request, string $token): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $updated = DB::table('doctor_patient_links')->where('invite_token', $token)->where('patient_user_id', $auth->sub)->update(['status' => 'active']);
        return $updated ? $this->ok(['success' => true]) : $this->fail('Invite not found', 404);
    }

    public function doctorPatients(Request $request): JsonResponse
    {
        $auth = $this->doctorAuth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $rows = DB::table('doctor_patient_links as dpl')
            ->join('users as u', 'u.id', '=', 'dpl.patient_user_id')
            ->leftJoin('profiles as p', 'p.id', '=', 'u.id')
            ->where('dpl.doctor_user_id', $auth->sub)
            ->select('dpl.*', 'u.email', 'u.full_name', 'p.timezone')
            ->orderByDesc('dpl.created_at')
            ->get();
        return $this->ok($rows);
    }

    public function doctorPatientVitals(Request $request, string $patientId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, fn () => $this->vitalsHistory($request->merge(['patientId' => $patientId])));
    }

    public function doctorPatientAdherence(Request $request, string $patientId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, function () use ($patientId) {
            $medications = DB::table('medications')->where('user_id', $patientId)->where('is_active', true)->get();
            $logs = DB::table('dose_logs')->where('user_id', $patientId)->where('scheduled_time', '>=', now()->subDays(30))->get();
            $per = $medications->map(function ($med) use ($logs) {
                $medLogs = $logs->where('medication_id', $med->id);
                $taken = $medLogs->whereIn('status', ['taken', 'late'])->count();
                $missed = $medLogs->where('status', 'missed')->count();
                $total = $medLogs->count();
                return ['medication_id' => $med->id, 'name' => $med->name, 'dosage' => $med->dosage ?: $med->strength, 'taken' => $taken, 'missed' => $missed, 'percentage' => $total ? round($taken / $total * 100) : 0];
            });
            $total = $per->sum(fn ($m) => $m['taken'] + $m['missed']);
            $taken = $per->sum('taken');
            return $this->ok(['overall_percentage' => $total ? round($taken / $total * 100) : 0, 'per_medication' => $per]);
        });
    }

    public function doctorCreateDiet(Request $request, string $patientId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, fn ($auth) => $this->saveDietPlan($request->merge(['created_by' => 'doctor']), $patientId));
    }

    public function doctorUpdateDiet(Request $request, string $patientId, string $planId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, fn () => $this->saveDietPlan($request->merge(['created_by' => 'doctor']), $patientId, $planId));
    }

    public function doctorNotes(Request $request): JsonResponse
    {
        $auth = $this->doctorAuth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $patientId = $request->input('patientId');
        if (! $this->doctorCanAccess($auth->sub, $patientId)) {
            return $this->fail("You do not have access to this patient.", 403);
        }
        DB::table('doctor_notes')->insert(['id' => (string) Str::uuid(), 'doctor_user_id' => $auth->sub, 'patient_user_id' => $patientId, 'note' => $request->input('note'), 'is_read' => false, 'created_at' => now()]);
        return $this->ok(['success' => true]);
    }

    public function doctorPatientNotes(Request $request, string $patientId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, fn () => $this->ok($this->notesForPatient($patientId)));
    }

    public function doctorPatientReport(Request $request, string $patientId): JsonResponse
    {
        return $this->withDoctorPatient($request, $patientId, fn () => $this->ok($this->buildHealthSummary($patientId, $request)));
    }

    public function doctorProfile(Request $request): JsonResponse
    {
        $auth = $this->doctorAuth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->ok(DB::table('doctor_profiles')->where('user_id', $auth->sub)->first());
    }

    public function pendingDoctorInvites(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        $rows = DB::table('doctor_patient_links as dpl')
            ->leftJoin('doctor_profiles as dp', 'dp.user_id', '=', 'dpl.doctor_user_id')
            ->where('dpl.patient_user_id', $auth->sub)
            ->where('dpl.status', 'pending')
            ->select('dpl.id', 'dpl.invite_token', 'dpl.created_at', 'dp.full_name as doctor_name', 'dp.specialization')
            ->orderByDesc('dpl.created_at')
            ->get();
        return $this->ok($rows);
    }

    public function patientDoctorNotes(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->ok($this->notesForPatient($auth->sub));
    }

    public function readDoctorNotes(Request $request): JsonResponse
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        DB::table('doctor_notes')->where('patient_user_id', $auth->sub)->update(['is_read' => true]);
        return $this->ok(['success' => true]);
    }

    private function saveDietPlan(Request $request, string $patientId, ?string $planId = null): JsonResponse
    {
        $meals = $request->input('meals', []);
        if (! $request->filled('title')) {
            return $this->fail('Plan title is required.', 400);
        }
        if (! is_array($meals) || count($meals) === 0) {
            return $this->fail('Add at least one meal to the plan.', 400);
        }
        $id = $planId ?: (string) Str::uuid();
        DB::transaction(function () use ($request, $patientId, $meals, $id, $planId): void {
            if (! $planId) {
                DB::table('diet_plans')->where('patient_user_id', $patientId)->update(['is_active' => false]);
                DB::table('diet_plans')->insert([
                    'id' => $id,
                    'patient_user_id' => $patientId,
                    'title' => $request->input('title'),
                    'created_by' => $request->input('created_by', 'patient'),
                    'doctor_name' => $request->input('doctor_name'),
                    'start_date' => $request->input('start_date'),
                    'end_date' => $request->input('end_date'),
                    'notes' => $request->input('notes'),
                    'is_active' => true,
                    'created_at' => now(),
                ]);
            } else {
                DB::table('diet_plans')->where('id', $id)->where('patient_user_id', $patientId)->update($request->only(['title', 'created_by', 'doctor_name', 'start_date', 'end_date', 'notes']));
                DB::table('diet_plan_meals')->where('diet_plan_id', $id)->delete();
            }
            foreach ($meals as $meal) {
                DB::table('diet_plan_meals')->insert([
                    'id' => (string) Str::uuid(),
                    'diet_plan_id' => $id,
                    'meal_type' => $meal['meal_type'] ?? 'breakfast',
                    'meal_name' => $meal['meal_name'] ?? '',
                    'description' => $meal['description'] ?? null,
                    'calories' => $meal['calories'] ?? null,
                    'avoid_foods' => is_array($meal['avoid_foods'] ?? null) ? implode(', ', $meal['avoid_foods']) : ($meal['avoid_foods'] ?? null),
                    'recommended_foods' => is_array($meal['recommended_foods'] ?? null) ? implode(', ', $meal['recommended_foods']) : ($meal['recommended_foods'] ?? null),
                    'meal_time' => $meal['meal_time'] ?? null,
                ]);
            }
        });

        return $this->ok(['success' => true, 'id' => $id]);
    }

    private function signSession(object $user): array
    {
        $payload = [
            'sub' => $user->id,
            'email' => $user->email,
            'full_name' => $user->full_name ?? null,
            'iat' => time(),
            'exp' => time() + 7 * 24 * 60 * 60,
        ];

        return [
            'access_token' => $this->jwtEncode($payload),
            'token_type' => 'bearer',
            'user' => $this->publicUser($user),
        ];
    }

    private function publicUser(object $user): array
    {
        return ['id' => $user->id, 'email' => $user->email, 'user_metadata' => ['full_name' => $user->full_name ?? null]];
    }

    private function auth(Request $request): mixed
    {
        $header = $request->header('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            return $this->fail('Unauthorized', 401);
        }
        $payload = $this->jwtDecode(substr($header, 7));
        if (! $payload || ($payload->exp ?? 0) < time()) {
            return $this->fail('Invalid session', 401);
        }
        return $payload;
    }

    private function doctorAuth(Request $request): mixed
    {
        $auth = $this->auth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        return $this->userRole($auth->sub) === 'doctor' ? $auth : $this->fail('Doctor access is required.', 403);
    }

    private function jwtEncode(array $payload): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $segments = [$this->b64(json_encode($header)), $this->b64(json_encode($payload))];
        $segments[] = $this->b64(hash_hmac('sha256', implode('.', $segments), $this->jwtSecret(), true));
        return implode('.', $segments);
    }

    private function jwtDecode(string $jwt): ?object
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        $expected = $this->b64(hash_hmac('sha256', "$parts[0].$parts[1]", $this->jwtSecret(), true));
        if (! hash_equals($expected, $parts[2])) {
            return null;
        }
        return json_decode($this->b64decode($parts[1]));
    }

    private function jwtSecret(): string
    {
        return env('JWT_SECRET', 'change-this-secret');
    }

    private function b64(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function b64decode(string $value): string
    {
        return base64_decode(strtr($value, '-_', '+/'));
    }

    private function ok(mixed $data): JsonResponse
    {
        return response()->json(['data' => $data, 'error' => null]);
    }

    private function fail(string $message, int $status = 400): JsonResponse
    {
        return response()->json(['data' => null, 'error' => ['message' => $message]], $status);
    }

    private function serverError(Throwable $error): JsonResponse
    {
        return response()->json(['data' => null, 'error' => ['message' => $error->getMessage(), 'code' => $error->getCode() ?: 'SERVER_ERROR']], 500);
    }

    private function applyFilters($query, array $filters): void
    {
        foreach ($filters as $filter) {
            if (! isset($filter['column'])) {
                continue;
            }
            $operator = ['eq' => '=', 'neq' => '!=', 'gte' => '>=', 'lte' => '<=', 'gt' => '>', 'lt' => '<'][$filter['operator'] ?? 'eq'] ?? '=';
            $query->where($filter['column'], $operator, $filter['value'] ?? null);
        }
    }

    private function applySelect($query, string $select): void
    {
        if ($select !== '*') {
            $query->select(array_map('trim', array_filter(explode(',', $select))));
        }
    }

    private function normalizeForDb(string $table, array $row): array
    {
        foreach (($this->jsonColumns[$table] ?? []) as $column) {
            if (array_key_exists($column, $row) && $row[$column] !== null && ! is_string($row[$column])) {
                $row[$column] = json_encode($row[$column]);
            }
        }
        return $row;
    }

    private function normalizeRow(string $table, array $row): array
    {
        foreach (($this->jsonColumns[$table] ?? []) as $column) {
            if (isset($row[$column]) && is_string($row[$column])) {
                $decoded = json_decode($row[$column], true);
                $row[$column] = json_last_error() === JSON_ERROR_NONE ? $decoded : $row[$column];
            }
        }
        return $row;
    }

    private function validateVitals(Request $request): array
    {
        $values = [
            'systolic' => $this->nullableNumber($request->input('systolic')),
            'diastolic' => $this->nullableNumber($request->input('diastolic')),
            'blood_sugar' => $this->nullableNumber($request->input('bloodSugar', $request->input('blood_sugar'))),
            'heart_rate' => $this->nullableNumber($request->input('heartRate', $request->input('heart_rate'))),
            'weight' => $this->nullableNumber($request->input('weight')),
        ];
        if (! array_filter($values, fn ($value) => $value !== null)) {
            return ['error' => 'Enter at least one vital reading.'];
        }
        return $values;
    }

    private function nullableNumber(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : (float) $value;
    }

    private function vitalStatuses(array $row): array
    {
        $row['bp_status'] = (($row['systolic'] ?? null) >= 130 || ($row['diastolic'] ?? null) >= 80) ? 'High' : ((($row['systolic'] ?? null) < 90 && ($row['systolic'] ?? null) !== null) ? 'Low' : 'Normal');
        $row['sugar_status'] = ($row['blood_sugar'] ?? null) === null ? null : (($row['blood_sugar'] < 70) ? 'Low' : (($row['blood_sugar'] > 180) ? 'High' : 'Normal'));
        $row['heart_rate_status'] = ($row['heart_rate'] ?? null) === null ? null : (($row['heart_rate'] < 60) ? 'Low' : (($row['heart_rate'] > 100) ? 'High' : 'Normal'));
        $row['weight_status'] = ($row['weight'] ?? null) === null ? null : 'Logged';
        return $row;
    }

    private function criticalAlerts(array $row): array
    {
        $alerts = [];
        if (($row['systolic'] ?? 0) > 160) {
            $alerts[] = ['type' => 'high_blood_pressure', 'severity' => 'high', 'message' => 'Your blood pressure is very high. Please rest and consult your doctor.'];
        }
        if (($row['blood_sugar'] ?? 0) > 300) {
            $alerts[] = ['type' => 'critical_blood_sugar', 'severity' => 'high', 'message' => 'Critical sugar level detected. Contact your doctor immediately.'];
        } elseif (($row['blood_sugar'] ?? 999) < 70) {
            $alerts[] = ['type' => 'low_blood_sugar', 'severity' => 'medium', 'message' => 'Low blood sugar detected. Have something sweet immediately.'];
        }
        return $alerts;
    }

    private function isAbnormalVital(array $row): bool
    {
        return in_array($row['bp_status'] ?? null, ['High', 'Low'], true)
            || in_array($row['sugar_status'] ?? null, ['High', 'Low'], true)
            || in_array($row['heart_rate_status'] ?? null, ['High', 'Low'], true);
    }

    private function applyDateRange($query, string $column, Request $request): void
    {
        if ($request->filled('from')) {
            $query->where($column, '>=', $request->query('from').' 00:00:00');
        }
        if ($request->filled('to')) {
            $query->where($column, '<=', $request->query('to').' 23:59:59');
        }
    }

    private function resolveTargetUserId(Request $request, string $authUserId): string|JsonResponse
    {
        $patientId = $request->query('patientId', $request->input('patientId'));
        if (! $patientId || $patientId === $authUserId) {
            return $authUserId;
        }
        if ($this->caregiverCanAccess($authUserId, $patientId) || ($this->userRole($authUserId) === 'doctor' && $this->doctorCanAccess($authUserId, $patientId))) {
            return $patientId;
        }
        return $this->fail("You do not have access to this patient's health data.", 403);
    }

    private function caregiverCanAccess(string $caregiverId, string $patientId): bool
    {
        return DB::table('caregiver_links')->where('caregiver_id', $caregiverId)->where('patient_id', $patientId)->where('status', 'active')->exists();
    }

    private function doctorCanAccess(string $doctorId, string $patientId): bool
    {
        return DB::table('doctor_patient_links')->where('doctor_user_id', $doctorId)->where('patient_user_id', $patientId)->where('status', 'active')->exists();
    }

    private function userRole(string $userId): ?string
    {
        return DB::table('user_roles')->where('user_id', $userId)->value('role');
    }

    private function buildHealthSummary(string $userId, Request $request): array
    {
        $vitalsQuery = DB::table('vitals_log')->where('user_id', $userId);
        $this->applyDateRange($vitalsQuery, 'logged_at', $request);
        $vitals = $vitalsQuery->orderByDesc('logged_at')->get()->map(fn ($row) => $this->vitalStatuses((array) $row));
        $doseLogs = DB::table('dose_logs')->where('user_id', $userId)->where('scheduled_time', '>=', now()->subDays(30))->get();
        $taken = $doseLogs->whereIn('status', ['taken', 'late'])->count();
        $total = $doseLogs->count();
        $todayDiet = DB::table('diet_log')->where('user_id', $userId)->whereDate('logged_at', now()->toDateString())->get();
        $activePlan = DB::table('diet_plans')->where('patient_user_id', $userId)->where('is_active', true)->orderByDesc('created_at')->first();
        $plannedMeals = $activePlan ? DB::table('diet_plan_meals')->where('diet_plan_id', $activePlan->id)->count() : 0;
        return [
            'vitals' => $vitals->first(),
            'diet_today' => [
                'followed' => $todayDiet->where('followed_plan', true)->count(),
                'logged' => $todayDiet->count(),
                'planned' => $plannedMeals,
            ],
            'active_plan' => $activePlan ? ['id' => $activePlan->id, 'title' => $activePlan->title] : null,
            'medications' => ['active_count' => DB::table('medications')->where('user_id', $userId)->where('is_active', true)->count()],
            'adherence' => ['taken' => $taken, 'total' => $total, 'percentage' => $total ? round($taken / $total * 100) : 0],
            'goals' => DB::table('health_goals')->where('user_id', $userId)->where('is_active', true)->get()->map(fn ($goal) => $this->shapeGoal((array) $goal)),
            'doctor_notes' => $this->notesForPatient($userId),
        ];
    }

    private function groupVitals($entries): array
    {
        return $entries->groupBy(fn ($row) => substr((string) ($row['logged_at'] ?? ''), 0, 10))
            ->map(function ($items, $date) {
                $avg = fn (string $key) => $items->whereNotNull($key)->count() ? round($items->whereNotNull($key)->avg($key), 2) : null;
                $min = fn (string $key) => $items->whereNotNull($key)->count() ? $items->whereNotNull($key)->min($key) : null;
                $max = fn (string $key) => $items->whereNotNull($key)->count() ? $items->whereNotNull($key)->max($key) : null;

                return [
                    'log_date' => $date,
                    'systolic_min' => $min('systolic'),
                    'systolic_max' => $max('systolic'),
                    'systolic_avg' => $avg('systolic'),
                    'diastolic_min' => $min('diastolic'),
                    'diastolic_max' => $max('diastolic'),
                    'diastolic_avg' => $avg('diastolic'),
                    'sugar_min' => $min('blood_sugar'),
                    'sugar_max' => $max('blood_sugar'),
                    'sugar_avg' => $avg('blood_sugar'),
                    'heart_rate_min' => $min('heart_rate'),
                    'heart_rate_max' => $max('heart_rate'),
                    'heart_rate_avg' => $avg('heart_rate'),
                    'weight_min' => $min('weight'),
                    'weight_max' => $max('weight'),
                    'weight_avg' => $avg('weight'),
                    'entries_count' => $items->count(),
                ];
            })
            ->values()
            ->all();
    }

    private function dietSummary($entries): array
    {
        $total = $entries->count();
        $followed = $entries->where('followed_plan', true)->count();
        $mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

        return [
            'total' => $total,
            'followed' => $followed,
            'percentage' => $total ? round($followed / $total * 100) : 0,
            'by_meal_type' => collect($mealTypes)->map(function ($mealType) use ($entries) {
                $mealEntries = $entries->where('meal_type', $mealType);
                $followed = $mealEntries->where('followed_plan', true)->count();
                $total = $mealEntries->count();
                return ['meal_type' => $mealType, 'total' => $total, 'followed' => $followed, 'percentage' => $total ? round($followed / $total * 100) : 0];
            })->all(),
        ];
    }

    private function shapeGoal(array $goal): array
    {
        $labels = [
            'bp_systolic' => 'Blood Pressure Systolic',
            'bp_diastolic' => 'Blood Pressure Diastolic',
            'blood_sugar' => 'Blood Sugar',
            'weight' => 'Weight',
            'heart_rate' => 'Heart Rate',
            'medication_adherence' => 'Medication Adherence',
            'diet_adherence' => 'Diet Adherence',
            'water_intake' => 'Water Intake',
        ];
        $targetDate = $goal['target_date'] ?? null;
        $daysRemaining = $targetDate ? now()->startOfDay()->diffInDays(\Carbon\Carbon::parse($targetDate)->startOfDay(), false) : null;

        return array_merge($goal, [
            'goal_label' => $labels[$goal['goal_type']] ?? $goal['goal_type'],
            'target_value' => (float) $goal['target_value'],
            'current_value' => null,
            'progress_percentage' => ! empty($goal['is_achieved']) ? 100 : 0,
            'status' => ! empty($goal['is_achieved']) ? 'achieved' : 'on_track',
            'days_remaining' => $daysRemaining,
            'trend' => [],
        ]);
    }

    private function notesForPatient(string $patientId)
    {
        return DB::table('doctor_notes as dn')
            ->leftJoin('doctor_profiles as dp', 'dp.user_id', '=', 'dn.doctor_user_id')
            ->where('dn.patient_user_id', $patientId)
            ->select('dn.*', 'dp.full_name as doctor_name')
            ->orderByDesc('dn.created_at')
            ->get();
    }

    private function withDoctorPatient(Request $request, string $patientId, callable $callback): JsonResponse
    {
        $auth = $this->doctorAuth($request);
        if ($auth instanceof JsonResponse) {
            return $auth;
        }
        if (! $this->doctorCanAccess($auth->sub, $patientId)) {
            return $this->fail("You do not have access to this patient.", 403);
        }
        return $callback($auth);
    }
}
