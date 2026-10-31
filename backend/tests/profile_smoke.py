"""Verify profiles and equipped game skins using temporary accounts, removed on exit."""
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
names = ['tp_profile_' + secrets.token_hex(6) for _ in range(2)]
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

    def user(self):
        status, body = self.request('session.php')
        assert status == 200
        return body['user']

    def login(self, name):
        self.request('session.php')
        return self.request('login.php', {'identity': name, 'password': password})


def check(condition, description):
    global passed
    assert condition, description
    passed += 1
    print('PASS:', description, flush=True)


try:
    a, b, guest = Client(), Client(), Client()
    profile = {'displayName': 'José Plays', 'avatarId': 'maya'}
    equipment = {'game': 'tumbang-preso', 'skinId': 'slipper_blue'}
    check(guest.request('profile.php', profile)[0] == 401, 'Guests cannot edit profiles')
    check(guest.request('inventory.php')[0] == 401 and guest.request('inventory.php', equipment)[0] == 401,
          'Guests cannot read or equip inventory')
    for client, name in zip([a, b], names):
        status, body = client.request('signup.php', {
            'username': name, 'password': password, 'terms': True})
        assert status == 201
    initial = a.user()
    check(initial['displayName'] == names[0] and initial['avatarId'] == 'sunny',
          'Accounts without a profile row use their username and default icon')
    check(initial['equippedSkins'] == {'tumbang-preso': 'slipper_pink', 'jolens-blast': 'shooter_chrome'},
          'New accounts use the original game skins')
    check(a.request('profile.php', profile, csrf=False)[0] == 403 and
          a.request('inventory.php', equipment, csrf=False)[0] == 403, 'Both updates require CSRF')
    for name in ['', ' ', 'A', 'A' * 31, '<img src=x onerror=alert(1)>', 'a\nb', '---', [], 123]:
        assert a.request('profile.php', {**profile, 'displayName': name})[0] == 422
    check(True, 'Display names reject invalid lengths, markup, control characters and types')
    for avatar in ['../config.local.php', 'unknown', 'https://example.com/a.png', []]:
        assert a.request('profile.php', {**profile, 'avatarId': avatar})[0] == 422
    check(True, 'Profile icons must come from the server allowlist')
    status, body = a.request('profile.php', {**profile, 'userId': b.user()['id'], 'tansans': 99999})
    saved = body['user']
    check(status == 200 and saved['displayName'] == profile['displayName'] and saved['avatarId'] == 'maya',
          'A Unicode display name and icon save together')
    check(saved['username'] == initial['username'] and
          saved['tansans'] == initial['tansans'] and saved['juice'] == initial['juice'],
          'Profile editing preserves login credentials and balances')
    check(saved['walletVersion'] > initial['walletVersion'], 'Profile changes advance the account snapshot version')
    check(b.user()['displayName'] == names[1] and b.user()['avatarId'] == 'sunny',
          'Client-supplied identity cannot edit another account')
    status, inventory = a.request('inventory.php')
    items = inventory['items']
    check(status == 200 and len(items) == 9 and len({item['id'] for item in items}) == 9,
          'Inventory includes six slippers and three Jolens shooters')
    check(all((ROOT.parent / 'public' / item['imageUrl']).is_file() for item in items),
          'Every selectable skin has a real local asset')
    check(all((ROOT.parent / 'public' / 'assets' / 'avatars' / (avatar + '.webp')).is_file()
              for avatar in ['sunny', 'lila', 'miko', 'maya']), 'Every profile icon has a local image')
    for invalid in [
        {'game': 'tumbang-preso', 'skinId': 'shooter_gold'},
        {'game': 'jolens-blast', 'skinId': 'slipper_blue'},
        {'game': 'unknown', 'skinId': 'slipper_blue'},
        {'game': 'tumbang-preso', 'skinId': 'skin_1'},
        {'game': 'tumbang-preso', 'skinId': '../other.png'},
        {'game': [], 'skinId': 'slipper_blue'},
    ]:
        assert a.request('inventory.php', invalid)[0] == 422
    check(True, 'Unknown, cross-game, and unequippable store skins are rejected')
    for item in items:
        status, result = a.request('inventory.php', {'game': item['game'], 'skinId': item['id']})
        assert status == 200 and result['user']['equippedSkins'][item['game']] == item['id']
    check(True, 'Every starter skin can be equipped with zero Tansans')
    a.request('inventory.php', equipment)
    a.request('inventory.php', {'game': 'jolens-blast', 'skinId': 'shooter_gold'})
    saved = a.user()
    check(saved['equippedSkins'] == {'tumbang-preso': 'slipper_blue', 'jolens-blast': 'shooter_gold'} and
          saved['displayName'] == profile['displayName'] and saved['tansans'] == 0 and saved['juice'] == 100,
          'Each game keeps its selection without changing the profile or wallet')
    a.request('logout.php', {})
    restored = a.login(names[0])[1]['user']
    check(all(restored[key] == saved[key] for key in ['displayName', 'avatarId', 'equippedSkins']),
          'Profile and equipment survive logout and login with the original username')
    second = Client()
    assert second.login(names[0])[0] == 200
    check(second.user()['equippedSkins'] == saved['equippedSkins'], 'A new browser session sees the same equipment')
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(a.request, 'profile.php', {'displayName': 'New Name', 'avatarId': 'miko'})
        other = pool.submit(second.request, 'inventory.php', {'game': 'tumbang-preso', 'skinId': 'slipper_green'})
        assert first.result()[0] == other.result()[0] == 200
    final = a.user()
    check(final['displayName'] == 'New Name' and final['avatarId'] == 'miko' and
          final['equippedSkins']['tumbang-preso'] == 'slipper_green' and
          final['equippedSkins']['jolens-blast'] == 'shooter_gold',
          'Concurrent profile and equipment updates preserve both changes')
    check(b.user()['equippedSkins'] == initial['equippedSkins'], 'Equipment stays isolated between accounts')
    # A high fixture score makes this account visible even on a populated local leaderboard.
    a.request('scores.php', {'game': 'tumbang-preso', 'points': 1000000000})
    scores = a.request('scores.php?game=tumbang-preso')[1]['highScores']
    row = next(row for row in scores if row['userId'] == initial['id'])
    check(row['displayName'] == 'New Name' and row['avatarId'] == 'miko',
          'Leaderboards use the saved display name and icon')
    print(f'{passed} profile and inventory checks passed.', flush=True)
finally:
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    foreach (array_slice($argv, 2) as $name) {
        if (!preg_match('/\Atp_profile_[a-f0-9]{12}\z/', $name)) exit(2);
        $db->prepare('DELETE FROM users WHERE username = ?')
            ->execute([$name]);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
            ->execute([hash('sha256', 'login-identity:' . $name)]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), *names], check=True, capture_output=True)
