<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any?}', function () {
    return file_exists(public_path('index.html'))
        ? response()->file(public_path('index.html'))
        : view('welcome');
})->where('any', '^(?!api).*$');
