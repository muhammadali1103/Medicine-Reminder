<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $schemaPath = base_path('../server/schema.sql');

        if (file_exists($schemaPath)) {
            DB::unprepared(file_get_contents($schemaPath));
        }

        $columns = collect(DB::select('SHOW COLUMNS FROM users'))->pluck('Field')->all();
        if (! in_array('remember_token', $columns, true)) {
            DB::statement('ALTER TABLE users ADD remember_token VARCHAR(100) NULL');
        }
    }

    public function down(): void
    {
        // The existing MySQL database is shared with the previous Node backend,
        // so rollback intentionally avoids dropping application data.
    }
};
