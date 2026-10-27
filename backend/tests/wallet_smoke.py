"""Verify ownership, persistence, idempotency and concurrent purchases using temporary accounts."""
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

BASE = os.environ.get('TUBONG_TEST_API_URL', 'http://localhost:4200/api').rstrip('/')
PHP = os.environ.get('TUBONG_PHP_BIN', '/Applications/MAMP/bin/php/php8.3.30/bin/php')
ROOT = Path(__file__).resolve().parents[1]
names = ['tp_wallet_' + secrets.token_hex(6) for _ in range(2)]
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


def fixture_database(mode, name):
    code = r'''
    require $argv[1] . '/database.php';
    $name = $argv[2];
    if (!preg_match('/\Atp_wallet_[a-f0-9]{12}\z/', $name)) exit(2);
    $db = database();
    if ($argv[3] === 'cleanup') {
        $db->prepare('DELETE FROM users WHERE username = ? AND email = ?')->execute([$name, $name . '@example.com']);
    } elseif ($argv[3] === 'expire') {
        $db->prepare('UPDATE account_state a JOIN users u ON a.user_id = u.id SET a.unlimited_until = 1, a.version = a.version + 1 WHERE u.username = ?')->execute([$name]);
    } elseif ($argv[3] === 'concurrency') {
        $db->prepare('UPDATE users SET tansans = 200 WHERE username = ?')->execute([$name]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), name, mode], check=True, capture_output=True)


try:
    a, b, guest = Client(), Client(), Client()
    check(guest.change('purchase', 'skin_1')[0] == 401, 'Guests cannot change balances or inventory')
    check(a.signup(names[0])[0] == 201 and b.signup(names[1])[0] == 201, 'Two independent accounts can be created')
    check(a.user()['tansans'] == b.user()['tansans'] == 1000, 'Each account starts with its own balance')
    check(a.user()['ownedSkins'] == b.user()['ownedSkins'] == [], 'New accounts own no purchased skins')
    check(a.request('catalog')[0] == 200, 'Catalog loads from the database')
    check(a.request('wallet', {'action': 'purchase', 'item': 'skin_1', 'requestId': str(uuid.uuid4())}, csrf=False)[0] == 403,
          'Balance changes require CSRF protection')
    request_id = str(uuid.uuid4())
    status, result = a.change('purchase', 'skin_1', request_id, userId=b.user()['id'], price=0, tansans=999999)
    check(status == 200 and result['user']['tansans'] == 700, 'Server uses the session identity and catalog price')
    check(a.user()['ownedSkins'] == ['skin_1'], 'Purchased skins belong to the purchasing account')
    check(a.change('purchase', 'skin_1', request_id)[1]['user']['tansans'] == 700, 'Replaying a request never charges twice')
    check(a.change('purchase', 'skin_2', request_id)[0] == 409, 'A request ID cannot be reused for a different purchase')
    check(a.change('purchase', 'skin_1')[0] == 409 and a.user()['tansans'] == 700, 'Owned skins cannot be bought twice')
    check(b.user()['tansans'] == 1000 and b.user()['ownedSkins'] == [], 'Another account receives neither the charge nor the skin')
    for _ in range(5):
        assert a.change('consume_juice', 'tumbang_retry')[0] == 200
    check(a.user()['juice'] == 0 and b.user()['juice'] == 100, 'Juice is deducted only from the active account')
    check(a.change('consume_juice', 'jolens_round')[0] == 409 and a.user()['juice'] == 0, 'Insufficient Juice cannot go negative')
    check(a.change('consume_juice', 'unknown')[0] == 422, 'Arbitrary energy changes are rejected')
    check(a.change('purchase', 'energy_small')[1]['user']['juice'] == 20, 'A refill updates Juice and saves its cost')
    assert a.change('purchase', 'energy_med')[0] == 200
    check(a.change('purchase', 'energy_med')[1]['user']['juice'] == 100, 'Refills are capped at 100 Juice')
    before = a.user()['tansans']
    check(a.change('purchase', 'energy_small')[0] == 409 and a.user()['tansans'] == before, 'Full Juice is not charged for a refill')
    check(a.change('purchase', 'not_a_skin')[0] == 422, 'Only catalog products can be bought')
    catalog = a.request('catalog')[1]
    if catalog['demoTopupsEnabled']:
        request_id = str(uuid.uuid4())
        before = a.user()['tansans']
        assert a.change('demo_topup', 'special', request_id)[0] == 200
        check(a.change('demo_topup', 'special', request_id)[1]['user']['tansans'] == before + 500,
              'Simulated top-ups save to the account and cannot be replayed for extra credit')
        check(a.change('demo_topup', 'arbitrary_amount', amount=999999)[0] == 422, 'Top-ups accept fixed packages only')
        check(a.change('purchase', 'energy_unli')[0] == 200, 'Unlimited Juice is saved as an account entitlement')
        expiry = a.user()['unlimitedJuiceUntil']
        check(expiry > 0 and a.change('consume_juice', 'jolens_round')[1]['user']['juice'] == 100,
              'Active unlimited Juice prevents energy deductions')
        check(a.change('purchase', 'energy_unli')[0] == 409, 'An active unlimited pass is not charged twice')
        fixture_database('expire', names[0])
        check(a.change('consume_juice', 'jolens_round')[1]['user']['juice'] == 80, 'Server expiry restores normal Juice costs')
    else:
        check(a.change('demo_topup', 'special')[0] == 403, 'Simulated credit is disabled unless explicitly enabled')
    saved_a = a.user()
    a.request('logout', {})
    check(a.login(names[1])[1]['user']['ownedSkins'] == [], 'Switching accounts does not inherit the previous inventory')
    a.request('logout', {})
    restored = a.login(names[0])[1]['user']
    check(restored == saved_a, 'Balances and skins survive logout and a fresh login')
    fresh = Client()
    check(fresh.login(names[0])[1]['user'] == saved_a, 'A separate browser session sees the same saved account')
    fixture_database('concurrency', names[1])
    b2 = Client()
    assert b2.login(names[1])[0] == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(b.change, 'purchase', 'skin_2')
        second = pool.submit(b2.change, 'purchase', 'skin_3')
        outcomes = [first.result()[0], second.result()[0]]
    final_b = b.user()
    check(sorted(outcomes) == [200, 409] and final_b['tansans'] in [0, 50] and len(final_b['ownedSkins']) == 1,
          'Concurrent purchases from separate sessions cannot overspend the account')
    check(a.user() == saved_a, 'Concurrent changes to account B leave account A unchanged')
    print(f'{passed} wallet checks passed.', flush=True)
finally:
    for name in names:
        fixture_database('cleanup', name)
