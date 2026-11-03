"""Run backend suites in a disposable database, never the configured application database.

Requires a local MySQL user with CREATE/DROP DATABASE permission and PHP 8.3+.
The random database is removed even when a test fails. No credentials are printed.
"""
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TUBONG_PHP_BIN', '/Applications/MAMP/bin/php/php8.3.30/bin/php')
database_name = 'tp_audit_' + secrets.token_hex(8)
environment = {**os.environ, 'TUBONG_ENV': 'development', 'TUBONG_ALLOW_DEMO_TOPUPS': '0',
               'TUBONG_SECURE_COOKIES': '0', 'TUBONG_PHP_BIN': PHP}
fixture_environment = {**environment, 'TUBONG_DB_DATABASE': database_name}


def php(code, env=fixture_environment, *args):
    return subprocess.run([PHP, '-r', code, str(ROOT), *args], env=env, check=True,
                          capture_output=True, text=True)


server = None
created = False
try:
    php(r'''
        require $argv[1] . '/database.php';
        if (!preg_match('/\Atp_audit_[a-f0-9]{16}\z/', $argv[2])) exit(2);
        database()->exec('CREATE DATABASE `' . $argv[2] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    ''', environment, database_name)
    created = True
    subprocess.run([PHP, str(ROOT / 'bin/setup.php')], env=fixture_environment, check=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    fixture_environment['TUBONG_TEST_API_URL'] = f'http://127.0.0.1:{port}/api'
    with tempfile.TemporaryFile() as log:
        server = subprocess.Popen([PHP, '-S', f'127.0.0.1:{port}', '-t', str(ROOT / 'public')],
                                  env={**fixture_environment, 'PHP_CLI_SERVER_WORKERS': '4'},
                                  stdout=log, stderr=log, start_new_session=True)
        for attempt in range(50):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/session.php', timeout=1):
                    break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('The isolated PHP test server did not start.')
                time.sleep(0.1)
        else:
            raise RuntimeError('The isolated PHP test server did not become ready.')
        for test in ['auth', 'wallet', 'scores', 'tutorial', 'juice', 'profile', 'settings', 'security']:
            # Only the disposable database's test traffic is cleared between suites.
            php("require $argv[1] . '/database.php'; database()->exec('DELETE FROM auth_rate_limits');")
            subprocess.run([sys.executable, str(ROOT / f'tests/{test}_smoke.py')],
                           env=fixture_environment, check=True)
        for test in ['juice', 'signup_challenge', 'catalog_rotation']:
            subprocess.run([PHP, str(ROOT / f'tests/{test}_test.php')],
                           env=fixture_environment, check=True)
finally:
    if server is not None:
        try:
            os.killpg(server.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        server.wait(timeout=10)
    if created:
        php(r'''
            require $argv[1] . '/database.php';
            if (!preg_match('/\Atp_audit_[a-f0-9]{16}\z/', $argv[2])) exit(2);
            database()->exec('DROP DATABASE `' . $argv[2] . '`');
        ''', environment, database_name)
        print('Disposable test database removed.', flush=True)
