<?php
// Copy to config.local.php and fill in your local credentials. Never commit that file.
return [
    'host' => '127.0.0.1',
    'port' => 8889,
    'database' => 'tubongpinoy_db',
    'username' => 'root',
    'password' => '',
    // Local testing only. Real payments must be verified by a payment provider.
    'allow_demo_topups' => false,
];
