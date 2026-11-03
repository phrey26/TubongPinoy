"""HTTP input boundaries and production configuration regressions; no account required."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

BASE = os.environ.get('TUBONG_TEST_API_URL', 'http://127.0.0.1:8888/tubongpinoy-api/api')
PHP = os.environ.get('TUBONG_PHP_BIN', '/Applications/MAMP/bin/php/php8.3.30/bin/php')
ROOT = Path(__file__).resolve().parents[1]
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with client.open(BASE + '/session.php') as response:
    token = json.load(response)['csrfToken']
    assert 'no-store' in response.headers['Cache-Control']
    assert response.headers['X-Content-Type-Options'] == 'nosniff'

cases = [
    (b'{', 'application/json', token, 400),
    (b'[]', 'application/json', token, 400),
    (b'null', 'application/json', token, 400),
    (b'"string"', 'application/json', token, 400),
    (b'{' + b' ' * 8192 + b'}', 'application/json', token, 413),
    (b'{}', 'text/plain', token, 415),
    (b'{}', 'application/json', 'forged', 403),
]
for body, content_type, csrf, expected in cases:
    request = urllib.request.Request(BASE + '/login.php', data=body,
                                     headers={'Content-Type': content_type, 'X-CSRF-Token': csrf})
    try:
        response = client.open(request)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, (response.status, expected)
        result = json.load(response)
        assert isinstance(result.get('message'), str)

for mode, demo, secure, expected in [
    ('production', '1', '0', [False, True]),
    ('production', '0', '1', [False, True]),
    ('development', '1', '0', [True, False]),
    ('development', '0', '1', [False, True]),
]:
    code = "require $argv[1] . '/configuration.php'; $c = app_config(); echo json_encode([$c['allow_demo_topups'], $c['secure_cookies']]);"
    result = subprocess.run([PHP, '-r', code, str(ROOT)], check=True, capture_output=True, text=True,
                            env={**os.environ, 'TUBONG_ENV': mode,
                                 'TUBONG_ALLOW_DEMO_TOPUPS': demo, 'TUBONG_SECURE_COOKIES': secure})
    assert json.loads(result.stdout) == expected

print('13 HTTP security and production configuration checks passed.', flush=True)
