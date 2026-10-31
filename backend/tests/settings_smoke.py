"""Verify credential changes using isolated temporary accounts, removed on exit."""
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
prefix = 'tp_settings_' + secrets.token_hex(6)
names = [prefix + '_a', prefix + '_b']
new_name = prefix + '_new'
password, new_password = secrets.token_urlsafe(20), secrets.token_urlsafe(20)
ids = []
passed = 0


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
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
        request = urllib.request.Request(BASE + '/' + endpoint,
            data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        body = json.loads(response.read())
        self.token = body.get('csrfToken', self.token)
        return response.status, body

    def user(self):
        status, body = self.request('session.php')
        assert status == 200
        return body['user']

    def login(self, identity, secret=password, remember=False):
        self.request('session.php')
        return self.request('login.php', {'identity': identity, 'password': secret, 'rememberMe': remember})

    def change(self, action, secret=password, **fields):
        return self.request('settings.php', {'action': action, 'currentPassword': secret, **fields})

    def cookie(self):
        return next(cookie for cookie in self.jar if cookie.name == 'tubong_session')


def check(condition, description):
    global passed
    assert condition, description
    passed += 1
    print('PASS:', description, flush=True)


try:
    a, b, other, guest = Client(), Client(), Client(), Client()
    check(guest.change('username', username=new_name)[0] == 401, 'Guests cannot change credentials')
    check(guest.request('settings.php')[0] == 405, 'Credential updates require POST')
    for client, name in zip([a, b], names):
        status, result = client.request('signup.php', {
            'username': name, 'password': password, 'terms': True})
        assert status == 201, result.get('message')
        ids.append(result['user']['id'])
    assert a.login(names[0], remember=True)[0] == 200
    assert other.login(names[0])[0] == 200
    initial = a.user()
    initial_cookie, initial_expiry, initial_token = a.cookie().value, a.cookie().expires, a.token
    check(a.request('settings.php', {'action': 'username', 'currentPassword': password, 'username': new_name}, csrf=False)[0] == 403,
          'Updates require CSRF')
    for invalid in [
        {'action': 'unknown'}, {'action': []}, {'action': 'username', 'username': 'ab'},
        {'action': 'username', 'username': 'bad user'}, {'action': 'username', 'username': 'x' * 51},
        {'action': 'username', 'username': []}, {'action': 'email', 'email': 'bad-email'},
        {'action': 'email', 'email': 'a' * 250 + '@example.com'},
        {'action': 'password', 'newPassword': 'short', 'confirmPassword': 'short'},
        {'action': 'password', 'newPassword': 'é' * 37, 'confirmPassword': 'é' * 37},
        {'action': 'password', 'newPassword': 'password\0', 'confirmPassword': 'password\0'},
        {'action': 'password', 'newPassword': new_password, 'confirmPassword': 'mismatch'},
        {'action': 'username', 'username': new_name, 'currentPassword': ''},
    ]:
        assert a.request('settings.php', {'currentPassword': password, **invalid})[0] == 422
    check(True, 'Invalid actions, types, usernames, emails and passwords are rejected')
    check(a.change('username', secret='incorrect-password', username=new_name)[0] == 422 and a.user()['username'] == names[0],
          'Wrong current password leaves credentials and the current session unchanged')
    check(a.change('username', username=names[1])[1]['message'] == 'Username is taken.',
          'Duplicate usernames are explained clearly')
    check(a.change('username', username=names[0])[0] == 422 and
          a.change('password', newPassword=password, confirmPassword=password)[0] == 422,
          'Unchanged credentials are rejected')
    # Changing a login username must preserve even the implicit, unsaved display name.
    status, result = a.change('username', username=new_name, userId=ids[1], tansans=999999)
    saved = result['user']
    check(status == 200 and saved['username'] == new_name and saved['displayName'] == names[0],
          'Username updates preserve the existing display name')
    check(all(saved[key] == initial[key] for key in ['id', 'avatarId', 'equippedSkins', 'tansans', 'juice', 'ownedSkins']),
          'Credential changes preserve identity, profile, inventory and balances')
    check(saved['walletVersion'] > initial['walletVersion'], 'Credential changes advance the account snapshot version')
    check(a.cookie().value != initial_cookie and a.token != initial_token and a.cookie().expires == initial_expiry,
          'Successful changes rotate session and CSRF while preserving Remember Me expiry')
    check(other.user() is None and other.request('inventory.php')[0] == 401,
          'Other sessions lose access after a username change')
    check(guest.login(names[0])[0] == 401 and guest.login(new_name)[0] == 200,
          'Login accepts the new username and rejects the old one')
    a.request('profile.php', {'displayName': 'Settings Player', 'avatarId': 'miko'})
    a.request('inventory.php', {'game': 'tumbang-preso', 'skinId': 'slipper_green'})
    check(a.change('email', email='unused@example.com')[0] == 422, 'Email settings are no longer supported')
    old_token = a.token
    status, result = a.change('password', newPassword=new_password, confirmPassword=new_password)
    check(status == 200 and a.user()['id'] == ids[0] and guest.user() is None,
          'Password changes keep the current session and revoke other sessions')
    check('password' not in json.dumps(result).lower() and 'hash' not in json.dumps(result).lower(),
          'Responses never expose passwords or hashes')
    a.token = old_token
    check(a.change('username', secret=new_password, username=prefix + '_unused')[0] == 403,
          'The previous CSRF token cannot authorize further changes')
    a.user()
    check(guest.login(new_name)[0] == 401 and guest.login(new_name, new_password)[0] == 200,
          'Old passwords fail and the new password works with the saved username')
    restored = guest.user()
    check(restored['displayName'] == 'Settings Player' and restored['avatarId'] == 'miko' and
          restored['equippedSkins']['tumbang-preso'] == 'slipper_green',
          'Profile and equipped skins survive all credential changes and a fresh login')
    check(b.user()['username'] == names[1] and 'email' not in b.user(),
          'Client-supplied identity cannot alter another account')
    # Only one of two sessions can change credentials with the same security version.
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(a.change, 'username', secret=new_password, username=prefix + '_race')
        second = pool.submit(guest.change, 'username', secret=new_password, username=prefix + '_race_other')
        results = [first.result(), second.result()]
    check(sorted(status for status, _ in results) == [200, 401],
          'Concurrent credential changes invalidate the losing session')
    for _ in range(15):
        assert b.change('username', secret='incorrect-password', username=prefix + '_unused')[0] == 422
    check(b.change('username', secret='incorrect-password', username=prefix + '_unused')[0] == 429,
          'Repeated confirmation-password guesses are rate limited per account')
    print(f'{passed} account settings checks passed.', flush=True)
finally:
    # IDs are captured from fixture signup; a prefix check prevents deleting unrelated accounts.
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    $prefix = $argv[2];
    if (!preg_match('/\Atp_settings_[a-f0-9]{12}\z/', $prefix)) exit(2);
    foreach (array_slice($argv, 3) as $id) {
        $query = $db->prepare('SELECT username FROM users WHERE id = ?');
        $query->execute([$id]);
        $row = $query->fetch();
        if (!$row || !str_starts_with($row['username'], $prefix . '_')) exit(3);
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')->execute([hash('sha256', 'settings:' . $id)]);
    }
    foreach (['_a', '_b', '_new', '_race'] as $suffix) {
        foreach (['', '@example.com'] as $domain) {
            $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
                ->execute([hash('sha256', 'login-identity:' . $prefix . $suffix . $domain)]);
        }
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), prefix, *map(str, ids)], check=True, capture_output=True)
