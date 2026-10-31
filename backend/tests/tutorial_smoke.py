"""Verify per-account, per-game tutorial preferences using temporary accounts, removed on exit."""
from concurrent.futures import ThreadPoolExecutor
from human_check import answer_signup_challenge
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

BASE = os.environ.get('TUBONG_TEST_API_URL', 'http://127.0.0.1:8888/tubongpinoy-api/api').rstrip('/')
PHP = os.environ.get('TUBONG_PHP_BIN', '/Applications/MAMP/bin/php/php8.3.30/bin/php')
ROOT = Path(__file__).resolve().parents[1]
names = ['tp_tutorial_' + secrets.token_hex(6) for _ in range(2)]
password = secrets.token_urlsafe(20)
passed = 0


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None
        self.request('session.php')

    def request(self, endpoint, data=None, csrf=True):
        if endpoint == 'signup.php' and data is not None and 'challengeId' not in data:
            status, challenge = self.request('signup-challenge.php')
            assert status == 200, challenge
            data = {**data, **answer_signup_challenge(challenge)}
        headers = {'Content-Type': 'application/json'} if data is not None else {}
        if csrf and self.token and data is not None:
            headers['X-CSRF-Token'] = self.token
        req = urllib.request.Request(BASE + '/' + endpoint,
            data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            response = self.opener.open(req, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        body = json.loads(response.read())
        self.token = body.get('csrfToken', self.token)
        return response.status, body

    def login(self, name):
        return self.request('login.php', {'identity': name, 'password': password})


def check(condition, description):
    global passed
    assert condition, description
    passed += 1
    print('PASS:', description, flush=True)


try:
    a, b, guest = Client(), Client(), Client()
    endpoint = 'tutorial.php?game=tumbang-preso'
    check(guest.request(endpoint)[0] == 401, 'Guests cannot read tutorial preferences')
    check(guest.request('tutorial.php', {'game': 'tumbang-preso'})[0] == 401,
          'Guests cannot write tutorial preferences')
    ids = []
    for client, name in zip([a, b], names):
        status, body = client.request('signup.php', {
            'username': name, 'password': password, 'terms': True})
        assert status == 201
        ids.append(body['user']['id'])
    check(not a.request(endpoint)[1]['seen'], 'A new account has not seen Tumbang Preso instructions')
    check(not a.request('tutorial.php?game=jolens-blast')[1]['seen'], 'A new account has not seen Jolens instructions')
    check(a.request('tutorial.php', {'game': 'tumbang-preso'}, csrf=False)[0] == 403,
          'Remembering a tutorial requires CSRF protection')
    check(a.request('tutorial.php?game=unknown')[0] == 422 and
          a.request('tutorial.php', {'game': []})[0] == 422, 'Invalid games are rejected')
    status, body = a.request('tutorial.php', {'game': 'tumbang-preso', 'userId': ids[1]})
    check(status == 200 and body['seen'], 'Dismissing a tutorial records it for the signed-in account')
    check(not b.request(endpoint)[1]['seen'], 'Another account remains unseen despite client-supplied identity')
    check(not a.request('tutorial.php?game=jolens-blast')[1]['seen'], 'Each game keeps its own tutorial status')
    check(a.request(endpoint)[1]['seen'], 'Returning to the game restores seen status')
    check(a.request('tutorial.php', {'game': 'tumbang-preso'})[1]['seen'], 'Repeated dismissals are harmless')
    a.request('logout.php', {})
    a.request('session.php')
    check(a.login(names[0])[0] == 200 and a.request(endpoint)[1]['seen'], 'Seen status survives logout and login')
    second = Client()
    assert second.login(names[0])[0] == 200
    check(second.request(endpoint)[1]['seen'], 'A separate browser session reads the same preference')
    check(a.request('tutorial.php', {'game': 'jolens-blast'})[1]['seen'], 'The second game can be remembered independently')
    print(f'{passed} tutorial checks passed.', flush=True)
finally:
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    foreach (array_slice($argv, 2) as $name) {
        if (!preg_match('/\Atp_tutorial_[a-f0-9]{12}\z/', $name)) exit(2);
        $db->prepare('DELETE FROM users WHERE username = ?')
            ->execute([$name]);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
            ->execute([hash('sha256', 'login-identity:' . $name)]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), *names], check=True, capture_output=True)
