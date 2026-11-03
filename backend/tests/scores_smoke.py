"""Verify account/game high scores using temporary accounts, removed on exit."""
from concurrent.futures import ThreadPoolExecutor
from human_check import answer_signup_challenge
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import time
import uuid
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


def payload(run, action, **input):
    return {'game': run['game'], 'action': action, 'runId': run['id'],
            'sequence': run['sequence'], 'requestId': str(uuid.uuid4()), **input}


def start(client, game):
    body = {'game': game, 'action': 'start', 'requestId': str(uuid.uuid4())}
    status, result = client.request('game-run.php', body)
    assert status == 200, result
    return result['run'], body


def act(client, run, action, **input):
    body = payload(run, action, **input)
    status, result = client.request('game-run.php', body)
    assert status == 200, result
    return result['run'], body, result['user']


def fixture(mode, user_id):
    code = r'''
    require $argv[1] . '/database.php'; $db=database();
    $q=$db->prepare('SELECT username FROM users WHERE id=?'); $q->execute([$argv[2]]);
    if (!preg_match('/\Atp_scores_[a-f0-9]{12}\z/', (string)$q->fetchColumn())) exit(2);
    if ($argv[3] === 'legacy') $db->prepare("INSERT INTO game_high_scores (user_id,game,points) VALUES (?, 'tumbang-preso', 1000000000)")->execute([$argv[2]]);
    if ($argv[3] === 'expire') $db->prepare('UPDATE game_runs SET expires_at=1 WHERE user_id=?')->execute([$argv[2]]);
    if ($argv[3] === 'revoke') $db->prepare('INSERT INTO account_security (user_id,version) VALUES (?,1) ON DUPLICATE KEY UPDATE version=version+1')->execute([$argv[2]]);
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), str(user_id), mode], check=True, capture_output=True)

try:
    a, b, guest = Client(), Client(), Client()
    check(guest.scores('tumbang-preso')[0] == 401, 'Guests cannot read protected rankings')
    check(guest.request('game-run.php', {'game':'tumbang-preso','action':'start','requestId':str(uuid.uuid4())})[0] == 401,
          'Guests cannot start a scored run')
    ids=[]
    for client,name in zip([a,b],names):
        status,body=client.request('signup.php',{'username':name,'password':password,'terms':True})
        assert status==201, body
        ids.append(body['user']['id'])
    for points in [100, 1000000000, -100, '100', True, None]:
        assert a.submit('tumbang-preso',points)[0]==422
    check(True,'All direct score totals, including plausible values, are rejected')
    fixture('legacy',ids[0])
    check(a.scores('tumbang-preso')[1]['personalBest']==0,'Legacy unverified totals do not appear in verified rankings')
    run,begin=start(a,'tumbang-preso')
    check(a.request('game-run.php',begin)[1]['run']==run,'Retrying start returns the same board and run')
    check(a.request('game-run.php',payload(run,'shot',vx=0,vy=-17.6),csrf=False)[0]==403,'Game actions require CSRF')
    check(b.request('game-run.php',payload(run,'shot',vx=0,vy=-17.6))[0]==409,'Another account cannot use a stolen run ID')
    check(a.request('game-run.php',payload(run,'next'))[0]==409,'Levels cannot be skipped before a verified hit')
    for extra in [{'vx':0,'vy':-1000},{'vx':'0','vy':-17.6},{'vx':0,'vy':-17.6,'points':999999},
                  {'vx':0,'vy':-17.6,'obstacles':[]},{'vx':0,'vy':-17.6,'sequence':5}]:
        assert a.request('game-run.php',payload(run,'shot',**extra))[0] in [409,422]
    check(True,'Forged totals, layouts, power, types and out-of-order sequences are rejected')
    check(a.request('game-run.php',payload(run,'shot',vx=0,vy=-17.6))[0]==425,'Impossible-speed submissions are rejected')
    time.sleep(1.5)
    shot=payload(run,'shot',vx=0,vy=-17.6)
    status,result=a.request('game-run.php',shot)
    assert status==200,result
    check(result['run']['score']==100 and result['run']['status']=='hit','A real first-level trajectory earns exactly 100 server-calculated points')
    with ThreadPoolExecutor(max_workers=2) as pool:
        second=Client(); assert second.login(names[0])[0]==200
        responses=list(pool.map(lambda client:client.request('game-run.php',shot),[a,second]))
    check(all(r[0]==200 and r[1]['run']['score']==100 for r in responses),'Concurrent duplicate submissions cannot award extra points')
    check(a.request('game-run.php',payload(run,'shot',vx=1,vy=0))[0]==409,'Reusing a sequence with a different shot is rejected')
    run=result['run']
    check(a.scores('tumbang-preso')[1]['personalBest']==100,'The leaderboard reads only the verified personal best')
    run,_,_=act(a,run,'next')
    check(run['level']==2 and run['status']=='ready','Only a verified hit unlocks the next server-selected board')
    check(a.request('game-run.php',shot)[0]==409,'An old shot cannot be replayed after advancing')
    time.sleep(.1)
    run,_,_=act(a,run,'shot',vx=0,vy=0)
    check(run['status']=='miss' and run['score']==100,'Misses cannot add points')
    before=a.request('me.php')[1]['user']['juice']
    run,retry,user=act(a,run,'retry')
    check(user['juice']==before-20,'The server charges a retry within the run transaction')
    check(a.request('game-run.php',retry)[1]['user']['juice']==user['juice'],'Retrying a lost response cannot double-charge Juice')
    replacement,_=start(a,'tumbang-preso')
    check(a.request('game-run.php',payload(run,'shot',vx=0,vy=0))[0]==409,'Starting a new game invalidates the previous run')
    check(replacement['score']==0 and a.scores('tumbang-preso')[1]['personalBest']==100,'Restarting resets run points without erasing the verified best')
    run,_=start(a,'jolens-blast')
    check(a.request('game-run.php',payload(run,'shot',vx=22.5,vy=0))[0]==409,'Jolens shots require a paid round')
    for bet in [0,6,100,1.5,True]: assert a.request('game-run.php',payload(run,'round',bet=bet))[0]==422
    check(True,'Invalid or impossible marble bets are rejected')
    run,round_request,user=act(a,run,'round',bet=1)
    check(run['inventory']==9 and len(run['targets'])==2,'The server stakes inventory and generates the marble positions')
    check(a.request('game-run.php',round_request)[1]['user']['juice']==user['juice'],'A duplicate round cannot charge twice')
    check(a.request('game-run.php',payload(run,'shot',vx=0,vy=0))[0]==422,'A fabricated zero-power Jolens shot cannot mark a session played')
    time.sleep(.6)
    run,_,_=act(a,run,'shot',vx=22.5,vy=0)
    check(run['inventory']==9 and run['completed'],'A valid sideways miss preserves the owned marble count')
    run,finish,_=act(a,run,'finish')
    check(run['score']==450 and a.scores('jolens-blast')[1]['personalBest']==450,'Jolens final points come from server-owned inventory')
    check(a.request('game-run.php',finish)[1]['run']['score']==450,'Finishing twice cannot award extra points')
    check(a.request('game-run.php',payload(run,'shot',vx=22.5,vy=0))[0]==409,'Finished sessions cannot continue shooting')
    fresh,_=start(b,'jolens-blast'); fresh,_,_=act(b,fresh,'finish')
    check(fresh['score']==0,'Finishing without a completed shot earns no points')
    fixture('expire',ids[1])
    check(b.request('game-run.php',payload(fresh,'finish'))[0]==409,'Expired runs cannot be reused')
    live,_=start(a,'tumbang-preso');fixture('revoke',ids[0])
    check(a.request('game-run.php',payload(live,'shot',vx=0,vy=0))[0]==401,'Revoked credentials cannot act on a run')
    a.request('session.php');assert a.login(names[0])[0]==200
    check(a.request('game-run.php',payload(live,'shot',vx=0,vy=0))[0]==409,'A fresh login cannot revive a run from revoked credentials')
    check(a.scores('tumbang-preso')[1]['personalBest']==100 and b.scores('tumbang-preso')[1]['personalBest']==0,
          'Verified records persist and remain isolated between accounts and games')
    print(f'{passed} verified-score checks passed.',flush=True)

finally:
    code = r'''
    require $argv[1] . '/database.php';
    $db = database();
    foreach (array_slice($argv, 2) as $name) {
        if (!preg_match('/\Atp_scores_[a-f0-9]{12}\z/', $name)) exit(2);
        $db->prepare('DELETE FROM users WHERE username = ?')
            ->execute([$name]);
        $db->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
            ->execute([hash('sha256', 'login-identity:' . $name)]);
    }
    '''
    subprocess.run([PHP, '-r', code, str(ROOT), *names], check=True, capture_output=True)
