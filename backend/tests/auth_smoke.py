"""Local integration test. Creates and removes one uniquely named test account."""
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
username = 'tp_test_' + secrets.token_hex(6)
password = secrets.token_urlsafe(20)
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
passed = 0


def request(endpoint, body=None, token=None, opener=client, method=None):
    if endpoint == 'signup' and body is not None and 'challengeId' not in body:
        status, challenge, _ = request('signup-challenge', opener=opener)
        assert status == 200, challenge
        body = {**body, **answer_signup_challenge(challenge)}
    headers = {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if token is not None:
        headers['X-CSRF-Token'] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + '/' + endpoint + '.php', data=data, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, json.loads(response.read()), response.headers


def check(condition, description):
    global passed
    if not condition:
        raise AssertionError(description)
    passed += 1
    print('PASS:', description)


def cookie_value():
    return next(cookie.value for cookie in jar if cookie.name == 'tubong_session')


def replay_cookie(value):
    opener = urllib.request.build_opener()
    opener.addheaders = [('Cookie', 'tubong_session=' + value)]
    return opener


def inspect_database(cleanup=False):
    code = r'''
    require $argv[1] . '/database.php';
    $name = $argv[2];
    if (!preg_match('/\Atp_test_[a-f0-9]{12}\z/', $name)) exit(2);
    $db = database();
    if ($argv[3] === 'cleanup') {
        $db->prepare('DELETE FROM users WHERE username = ?')
            ->execute([$name]);
        foreach ([$name, $name . '_missing'] as $identity) {
            $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
                ->execute([hash('sha256', 'login-identity:' . $identity)]);
        }
        echo "Test account cleanup complete.\n";
    } else {
        $query = $db->prepare('SELECT password_hash FROM users WHERE username = ?');
        $query->execute([$name]);
        $hash = $query->fetchColumn();
        $password = stream_get_contents(STDIN);
        if (!$hash || $hash === $password || !password_verify($password, $hash)) exit(3);
        echo "Password hashing verified.\n";
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), username, 'cleanup' if cleanup else 'inspect'],
                   input=password, text=True, check=True, capture_output=True)


try:
    status, session, headers = request('session')
    check(status == 200 and session['user'] is None, 'Guests have no authenticated user')
    token = session['csrfToken']
    check('HttpOnly' in headers.get('Set-Cookie', '') and 'SameSite=Lax' in headers.get('Set-Cookie', ''),
          'Session cookies use HttpOnly and SameSite=Lax')
    check(request('me')[0] == 401, 'Protected profile rejects anonymous requests')
    check(request('login')[0] == 405, 'Login rejects GET requests')
    signup = {'username': username, 'password': password, 'terms': True}
    check(request('signup', signup)[0] == 403, 'Signup rejects missing CSRF tokens')
    check(request('signup', {**signup, 'terms': False}, token)[0] == 422, 'Signup requires agreement')
    check(request('signup', {**signup, 'password': 'short'}, token)[0] == 422, 'Signup rejects short passwords')
    check(request('signup', {**signup, 'username': []}, token)[0] == 422, 'Signup rejects invalid field types')
    check(request('signup', {**signup, 'challengeId': 'missing', 'challengeAnswer': '0'}, token)[0] == 422, 'Missing or forged human verification cannot create an account')
    old_cookie = cookie_value()
    status, result, _ = request('signup', signup, token)
    check(status == 201 and result['user']['username'] == username, 'Signup creates and authenticates an account')
    token = result['csrfToken']
    check(cookie_value() != old_cookie, 'Signup rotates the session ID')
    check('password_hash' not in result['user'] and 'password' not in result['user'], 'API omits passwords and hashes')
    check(result['user']['juice'] == 100 and result['user']['tansans'] == 0, 'New accounts start with 0 Tansans and 100 Juice')
    check('email' not in result['user'], 'Account responses contain no email field')
    inspect_database()
    check(True, 'Stored password is hashed and verifiable')
    check(request('session')[1]['user']['username'] == username, 'Session survives subsequent requests')
    check(request('me')[0] == 200, 'Authenticated profile is accessible')
    check(request('session', opener=replay_cookie(old_cookie))[1]['user'] is None, 'Old session IDs cannot access the new login')
    check(request('signup', signup, token)[1]['message'] == 'Username is taken.', 'Duplicate username is explained clearly')
    check(request('signup', {**signup, 'username': username.upper()}, token)[0] == 409, 'Case-variant usernames are also taken')
    authenticated_cookie = cookie_value()
    check(request('logout', {}, token)[0] == 200, 'Logout succeeds')
    check(request('me')[0] == 401, 'Logout removes access to protected data')
    check(request('session', opener=replay_cookie(authenticated_cookie))[1]['user'] is None, 'Logged-out cookies cannot be replayed')
    token = request('session')[1]['csrfToken']
    check(request('login', {'identity': username, 'password': 'wrong-password'}, token)[0] == 401, 'Wrong password is rejected')
    check(request('login', {'identity': "' OR 1=1 --", 'password': password}, token)[0] == 401, 'SQL injection does not authenticate')
    old_cookie = cookie_value()
    status, result, headers = request('login', {'identity': username, 'password': password, 'rememberMe': True}, token)
    check(status == 200 and result['user']['username'] == username, 'Login works with username')
    check(cookie_value() != old_cookie, 'Login rotates the session ID')
    check(next(cookie.expires for cookie in jar if cookie.name == 'tubong_session') is not None,
          'Remember Me sets a persistent cookie')
    token = result['csrfToken']
    check(request('logout', {}, 'wrong-token')[0] == 403, 'Logout requires a valid CSRF token')
    request('logout', {}, token)
    token = request('session')[1]['csrfToken']
    status, result, _ = request('login', {'identity': username, 'password': password}, token)
    check(status == 200, 'Username login survives a fresh session')
    request('logout', {}, result['csrfToken'])
    token = request('session')[1]['csrfToken']
    for _ in range(16):
        status, _, _ = request('login', {'identity': username + '_missing', 'password': password}, token)
    check(status == 429, 'Repeated invalid logins are rate limited across requests')
    print(f'{passed} API checks passed.')
finally:
    inspect_database(cleanup=True)
