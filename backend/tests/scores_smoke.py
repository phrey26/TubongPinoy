"""Verify account/game high scores using temporary accounts, removed on exit."""
from concurrent.futures import ThreadPoolExecutor
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
names = ['tp_scores_' + secrets.token_hex(6) for _ in range(2)]
password = secrets.token_urlsafe(20)
passed = 0


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None
        self.request('session.php')

    def request(self, endpoint, data=None, csrf=True):
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

    def submit(self, game, points, **extra):
        return self.request('scores.php', {'game': game, 'points': points, **extra})

    def scores(self, game):
        return self.request('scores.php?game=' + game)

    def login(self, name):
        return self.request('login.php', {'identity': name, 'password': password})


def check(condition, description):
    global passed
    assert condition, description
    passed += 1
    print('PASS:', description, flush=True)


try:
    a, b, guest = Client(), Client(), Client()
    check(guest.scores('tumbang-preso')[0] == 401, 'Guests cannot read protected rankings')
    check(guest.submit('tumbang-preso', 100)[0] == 401, 'Guests cannot submit scores')
    ids = []
    for client, name in zip([a, b], names):
        status, body = client.request('signup.php', {
            'username': name, 'email': name + '@example.com', 'password': password, 'terms': True})
        assert status == 201
        ids.append(body['user']['id'])
    check(a.scores('tumbang-preso')[1]['personalBest'] == 0, 'A new player has no personal best')
    check(a.request('scores.php', {'game': 'tumbang-preso', 'points': 100}, csrf=False)[0] == 403,
          'Score submissions require CSRF protection')
    check(a.submit('unknown', 100)[0] == 422, 'Unknown games are rejected')
    check(a.request('scores.php')[0] == 422, 'A game is required for reads')
    for points in [-100, 0, 25, 100.5, '100', True, 1000000100, None]:
        assert a.submit('tumbang-preso', points)[0] == 422
    check(True, 'Invalid types, ranges, and score increments are rejected')
    result = a.submit('tumbang-preso', 300, userId=ids[1], username=names[1])[1]
    check(result['personalBest'] == 300, 'A positive score is saved for the signed-in account')
    check(b.scores('tumbang-preso')[1]['personalBest'] == 0, 'Client-supplied identity cannot affect another account')
    check(a.scores('jolens-blast')[1]['personalBest'] == 0, 'Scores are isolated by game')
    check(a.submit('jolens-blast', 650)[1]['personalBest'] == 650, 'Jolens accepts its own scoring increments')
    check(a.submit('tumbang-preso', 100)[1]['personalBest'] == 300, 'A lower score preserves the personal best')
    check(a.submit('tumbang-preso', 300)[1]['personalBest'] == 300, 'Duplicate submissions are harmless')
    check(a.submit('tumbang-preso', 500)[1]['personalBest'] == 500, 'A higher score replaces the personal best')
    b.submit('tumbang-preso', 500)
    rows = a.scores('tumbang-preso')[1]['highScores']
    check(len(rows) <= 10 and rows == sorted(rows, key=lambda row: (-row['points'], row['userId'])),
          'The leaderboard is capped at 10 and uses stable descending score order')
    check(all(set(row) == {'userId', 'username', 'displayName', 'avatarId', 'points'} for row in rows),
          'Ranking entries expose no email or password information')
    a.request('logout.php', {})
    a.request('session.php')
    check(a.login(names[0])[0] == 200 and a.scores('tumbang-preso')[1]['personalBest'] == 500,
          'Personal best survives logout and login')
    second = Client()
    assert second.login(names[0])[0] == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [pool.submit(a.submit, 'tumbang-preso', 900),
                   pool.submit(second.submit, 'tumbang-preso', 700)]
        assert all(result.result()[0] == 200 for result in results)
    check(a.scores('tumbang-preso')[1]['personalBest'] == 900, 'Concurrent updates retain the highest score')
    check(b.scores('tumbang-preso')[1]['personalBest'] == 500 and
          a.scores('jolens-blast')[1]['personalBest'] == 650,
          'Concurrent updates preserve other users and other games')
    print(f'{passed} score checks passed.', flush=True)
finally:
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    foreach (array_slice($argv, 2) as $name) {
        if (!preg_match('/\Atp_scores_[a-f0-9]{12}\z/', $name)) exit(2);
        $db->prepare('DELETE FROM users WHERE username = ? AND email = ?')
            ->execute([$name, $name . '@example.com']);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
            ->execute([hash('sha256', 'login-identity:' . $name)]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), *names], check=True, capture_output=True)
