"""Verify server-authoritative passive Juice recovery using temporary accounts."""
from concurrent.futures import ThreadPoolExecutor
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get('TUBONG_TEST_API_URL', 'http://127.0.0.1:8888/tubongpinoy-api/api').rstrip('/')
PHP = os.environ.get('TUBONG_PHP_BIN', '/Applications/MAMP/bin/php/php8.3.30/bin/php')
ROOT = Path(__file__).resolve().parents[1]
names = ['tp_juice_' + secrets.token_hex(6) for _ in range(2)]
password = secrets.token_urlsafe(20)
passed = 0


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = None
        self.request('session')

    def request(self, endpoint, data=None, csrf=True):
        headers = {}
        if data is not None:
            headers['Content-Type'] = 'application/json'
            if csrf and self.token:
                headers['X-CSRF-Token'] = self.token
        request = urllib.request.Request(BASE + '/' + endpoint + '.php',
            data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if 'csrfToken' in result:
            self.token = result['csrfToken']
        return response.status, result

    def signup(self, name):
        return self.request('signup', {'username': name, 'email': name + '@example.com', 'password': password, 'terms': True})

    def login(self, name):
        self.request('session')
        return self.request('login', {'identity': name, 'password': password})

    def change(self, action, item, request_id=None, **extra):
        return self.request('wallet', {'requestId': request_id or str(uuid.uuid4()), 'action': action, 'item': item, **extra})

    def user(self):
        status, result = self.request('session')
        assert status == 200
        return result['user']


def check(condition, description):
    global passed
    if not condition:
        raise AssertionError(description)
    passed += 1
    print('PASS:', description, flush=True)


def fixture(name, juice, elapsed, permanent=False):
    code = r'''
    require $argv[1] . '/database.php';
    $name = $argv[2];
    if (!preg_match('/\Atp_juice_[a-f0-9]{12}\z/', $name)) exit(2);
    $db = database();
    $db->beginTransaction();
    $db->prepare('UPDATE users SET juice = ?, tansans = 200 WHERE username = ?')->execute([(int) $argv[3], $name]);
    $anchor = time() - (int) $argv[4];
    $db->prepare('UPDATE account_state s JOIN users u ON s.user_id = u.id
        SET s.juice_refill_at = ?, s.permanent_juice = ?, s.version = s.version + 1 WHERE u.username = ?')
        ->execute([$anchor, (int) $argv[5], $name]);
    $db->commit();
    echo $anchor;
    '''
    result = subprocess.run([PHP, '-r', code, str(ROOT), name, str(juice), str(elapsed), str(int(permanent))],
                            check=True, capture_output=True, text=True)
    return int(result.stdout)


try:
    a, b = Client(), Client()
    assert a.signup(names[0])[0] == 201 and b.signup(names[1])[0] == 201
    check(a.user()['juice'] == 100 and a.user()['nextJuiceAt'] == 0, 'Full accounts have no refill time banked')
    status, result = a.change('consume_juice', 'tumbang_retry')
    user = result['user']
    check(status == 200 and user['juice'] == 80 and 140000 <= user['nextJuiceAt'] - user['serverTime'] <= 144000,
          'Spending from full starts a fresh 144-second interval')
    anchor = fixture(names[0], 80, 120)
    user = a.user()
    check(user['juice'] == 80 and user['nextJuiceAt'] == (anchor + 144) * 1000,
          'Partial elapsed intervals do not grant Juice early')
    anchor = fixture(names[0], 80, 300)
    user = a.user()
    check(user['juice'] == 82 and user['nextJuiceAt'] == (anchor + 432) * 1000,
          'Elapsed offline intervals award points and preserve the remainder')
    repeated = a.user()
    check(repeated['juice'] == 82 and repeated['walletVersion'] == user['walletVersion'],
          'Refreshing does not duplicate credits or restart the countdown')
    fixture(names[0], 99, 100000)
    user = a.user()
    check(user['juice'] == 100 and user['nextJuiceAt'] == 0, 'Long offline periods cap at 100 Juice')
    user = a.change('consume_juice', 'jolens_round')[1]['user']
    check(user['juice'] == 80 and 140000 <= user['nextJuiceAt'] - user['serverTime'] <= 144000,
          'Time spent at full cannot immediately refill a new spend')
    anchor = fixture(names[0], 80, 70)
    user = a.change('consume_juice', 'tumbang_retry')[1]['user']
    check(user['juice'] == 60 and user['nextJuiceAt'] == (anchor + 144) * 1000,
          'Additional gameplay preserves progress toward the next point')
    anchor = fixture(names[0], 50, 70)
    user = a.change('purchase', 'energy_small')[1]['user']
    check(user['juice'] == 70 and user['nextJuiceAt'] == (anchor + 144) * 1000,
          'A purchased partial refill preserves the free refill timer')
    fixture(names[0], 90, 70)
    user = a.change('purchase', 'energy_small')[1]['user']
    check(user['juice'] == 100 and user['nextJuiceAt'] == 0, 'Purchased refills also clear the timer when full')
    fixture(names[0], 19, 144)
    status, result = a.change('consume_juice', 'tumbang_retry')
    check(status == 200 and result['user']['juice'] == 0, 'Recovered Juice is applied before checking game costs')
    second = Client()
    assert second.login(names[0])[0] == 200
    fixture(names[0], 50, 300)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [pool.submit(a.user), pool.submit(second.user)]
        users = [result.result() for result in results]
    check(all(user['juice'] == 52 for user in users) and a.user()['juice'] == 52,
          'Concurrent browser sessions cannot double-credit the same elapsed time')
    a.request('logout', {})
    fixture(names[0], 50, 4330)
    user = a.login(names[0])[1]['user']
    check(user['juice'] == 80, 'Juice refills while logged out and is restored at login')
    check(b.user()['juice'] == 100 and b.user()['nextJuiceAt'] == 0, 'Recovery is isolated per account')
    fixture(names[0], 80, 300, permanent=True)
    user = a.change('consume_juice', 'tumbang_retry')[1]['user']
    check(user['permanentJuice'] and user['juice'] == 82,
          'Unlimited accounts retain their entitlement while the underlying meter recovers')
    print(f'{passed} Juice API checks passed.', flush=True)
finally:
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    foreach (array_slice($argv, 2) as $name) {
        if (!preg_match('/\Atp_juice_[a-f0-9]{12}\z/', $name)) exit(2);
        $db->prepare('DELETE FROM users WHERE username = ? AND email = ?')
            ->execute([$name, $name . '@example.com']);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
            ->execute([hash('sha256', 'login-identity:' . $name)]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), *names], check=True, capture_output=True)
