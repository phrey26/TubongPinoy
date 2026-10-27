<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require dirname(__DIR__, 2) . '/economy.php';
require_method('GET');
respond(shop_catalog());
