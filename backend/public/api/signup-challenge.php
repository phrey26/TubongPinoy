<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require dirname(__DIR__, 2) . '/signup-challenge.php';
require_method('GET');
rate_limit('signup-challenge:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 40);
respond(create_signup_challenge($_SESSION, time()));
