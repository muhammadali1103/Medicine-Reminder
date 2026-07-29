<?php

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [ApiController::class, 'health']);

Route::post('/auth/signup', [ApiController::class, 'signup']);
Route::post('/auth/register', [ApiController::class, 'signup']);
Route::post('/auth/login', [ApiController::class, 'login']);
Route::get('/auth/session', [ApiController::class, 'session']);
Route::get('/auth/user', [ApiController::class, 'user']);
Route::post('/auth/logout', [ApiController::class, 'logout']);

Route::get('/public/emergency-card/{cardId}', [ApiController::class, 'publicEmergencyCard']);

Route::post('/db/{table}/query', [ApiController::class, 'dbQuery']);
Route::post('/db/{table}/insert', [ApiController::class, 'dbInsert']);
Route::post('/db/{table}/update', [ApiController::class, 'dbUpdate']);
Route::post('/db/{table}/delete', [ApiController::class, 'dbDelete']);
Route::post('/functions/{name}', [ApiController::class, 'functionInvoke']);

Route::get('/notifications/settings', [ApiController::class, 'notificationSettings']);
Route::put('/notifications/settings', [ApiController::class, 'updateNotificationSettings']);
Route::get('/notifications/pending', [ApiController::class, 'pendingNotifications']);
Route::post('/notifications/snooze', [ApiController::class, 'snoozeNotification']);
Route::post('/notifications/escalate', [ApiController::class, 'escalateNotification']);

Route::post('/vitals/log', [ApiController::class, 'logVitals']);
Route::get('/vitals/history', [ApiController::class, 'vitalsHistory']);
Route::get('/vitals/latest', [ApiController::class, 'latestVitals']);
Route::delete('/vitals/{id}', [ApiController::class, 'deleteVitals']);

Route::post('/diet/plan', [ApiController::class, 'createDietPlan']);
Route::get('/diet/plan/active', [ApiController::class, 'activeDietPlan']);
Route::put('/diet/plan/{id}', [ApiController::class, 'updateDietPlan']);
Route::delete('/diet/plan/{id}', [ApiController::class, 'deleteDietPlan']);
Route::post('/diet/log', [ApiController::class, 'logDiet']);
Route::get('/diet/log/history', [ApiController::class, 'dietHistory']);

Route::post('/goals', [ApiController::class, 'createGoal']);
Route::get('/goals', [ApiController::class, 'goals']);
Route::put('/goals/{id}', [ApiController::class, 'updateGoal']);
Route::delete('/goals/{id}', [ApiController::class, 'deleteGoal']);
Route::post('/goals/check', [ApiController::class, 'checkGoals']);

Route::get('/health/summary', [ApiController::class, 'healthSummary']);
Route::get('/report/health-summary', [ApiController::class, 'healthReport']);

Route::post('/doctor/invite', [ApiController::class, 'doctorInvite']);
Route::get('/doctor/accept/{token}', [ApiController::class, 'doctorAccept']);
Route::get('/doctor/patients', [ApiController::class, 'doctorPatients']);
Route::get('/doctor/patient/{patientId}/vitals', [ApiController::class, 'doctorPatientVitals']);
Route::get('/doctor/patient/{patientId}/adherence', [ApiController::class, 'doctorPatientAdherence']);
Route::post('/doctor/patient/{patientId}/diet', [ApiController::class, 'doctorCreateDiet']);
Route::put('/doctor/patient/{patientId}/diet/{planId}', [ApiController::class, 'doctorUpdateDiet']);
Route::post('/doctor/notes', [ApiController::class, 'doctorNotes']);
Route::get('/doctor/patient/{patientId}/notes', [ApiController::class, 'doctorPatientNotes']);
Route::get('/doctor/patient/{patientId}/report', [ApiController::class, 'doctorPatientReport']);
Route::get('/doctor/profile', [ApiController::class, 'doctorProfile']);
Route::get('/doctor/invites/pending', [ApiController::class, 'pendingDoctorInvites']);
Route::get('/patient/doctor-notes', [ApiController::class, 'patientDoctorNotes']);
Route::post('/patient/doctor-notes/read', [ApiController::class, 'readDoctorNotes']);
