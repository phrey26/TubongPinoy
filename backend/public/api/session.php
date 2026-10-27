<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require_method('GET');
respond(['user' => current_user(), 'csrfToken' => $_SESSION['csrf']]);
