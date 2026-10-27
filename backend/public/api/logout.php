<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
json_input();
$_SESSION = [];
session_destroy();
$cookie = session_get_cookie_params();
unset($cookie['lifetime']);
setcookie(session_name(), '', $cookie + ['expires' => time() - 3600]);
respond(['message' => 'Logged out.']);
