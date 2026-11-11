begin;
-- Existing accounts remain accessible; new registrations must verify an email.
alter table game_private.players add column email text, add column pending_email text,
  add column email_verified_at timestamptz, add column email_required boolean not null default false;
create unique index players_verified_email on game_private.players(email) where email is not null;
alter table game_private.players add constraint email_verification_consistent check ((email is null) = (email_verified_at is null));
create table game_private.email_codes (
  player_id bigint not null references game_private.players on delete cascade,
  purpose text not null check(purpose in ('verify','reset')), email text not null,
  code_hash text not null, attempts integer not null default 0 check(attempts between 0 and 5),
  auth_version bigint not null, expires_at timestamptz not null,
  primary key(player_id,purpose)
);
create index email_codes_expiry on game_private.email_codes(expires_at);
create table game_private.email_budget(day date primary key, sent integer not null check(sent>=0));
alter table game_private.email_codes enable row level security;
alter table game_private.email_budget enable row level security;
revoke all on game_private.email_codes,game_private.email_budget from public,anon,authenticated;
grant select,insert,update,delete on game_private.email_codes,game_private.email_budget to service_role;
create function game_private.valid_email(value text) returns boolean language sql immutable set search_path='' as $$
 select length(btrim(value)) between 3 and 254 and btrim(value) ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
$$;

create or replace function game_private.snapshot(player_id bigint) returns jsonb
language plpgsql set search_path = '' as $$ declare p game_private.players; current_seconds bigint := floor(extract(epoch from clock_timestamp())); earned integer; begin
  select * into strict p from game_private.players where id=player_id for update;
  if p.juice >= 100 then p.refill_at := 0;
  elsif p.refill_at <= 0 or p.refill_at > current_seconds then p.refill_at := current_seconds;
  else
    earned := least(100-p.juice, ((current_seconds-p.refill_at)/144)::integer);
    p.juice := p.juice+earned; p.refill_at := p.refill_at+earned*144;
    if p.juice >= 100 then p.refill_at := 0; end if;
  end if;
  update game_private.players x set juice=p.juice,refill_at=p.refill_at,
    version=x.version+case when x.juice<>p.juice or x.refill_at<>p.refill_at then 1 else 0 end
    where x.id=p.id returning version into p.version;
  return jsonb_build_object('id',p.id,'username',p.username,'displayName',p.display_name,'avatarId',p.avatar_id,
    'email',p.email,'emailVerified',p.email_verified_at is not null,'pendingEmail',p.pending_email,'tansans',p.tansans,'juice',p.juice,'ownedSkins',coalesce((select jsonb_agg(s.skin_id order by s.skin_id) from game_private.owned_skins s where s.player_id=p.id),'[]'),
    'equippedSkins',jsonb_build_object('tumbang-preso',p.tumbang_skin,'jolens-blast',p.jolens_skin),
    'unlimitedJuiceUntil',p.unlimited_until*1000,'permanentJuice',p.permanent_juice,'walletVersion',p.version,
    'nextJuiceAt',case when p.juice<100 then (p.refill_at+144)*1000 else 0 end,'serverTime',current_seconds*1000);
end $$;

create or replace function game_private.dispatch(endpoint text, method text, body jsonb, token text, guest text, replay jsonb, challenge jsonb)
returns jsonb language plpgsql set search_path = '' as $$
<<dispatch>>
declare
  p game_private.players; r game_private.runs; skin game_private.skins; old_session game_private.sessions;
  result jsonb; state jsonb; g text := body->>'game'; action text := body->>'action';
  name text; password text; item text; request_id text; request_hash text; previous_hash text;
  t bigint := floor(extract(epoch from clock_timestamp())); amount integer; price integer; refill integer;
  bet integer; points integer; next_level integer; expiry timestamptz; a integer; b integer;
  challenge_id text; answer text; allowed text[];
begin
  if endpoint in ('session','catalog','signup-challenge','username-availability','me','scores','tutorial','inventory') then
    if method not in ('GET','POST') then perform game_private.fail('Method not allowed.',405); end if;
    if method='POST' and endpoint not in ('scores','tutorial','inventory') then perform game_private.fail('Method not allowed.',405); end if;
  elsif endpoint in ('signup','login','logout','profile','settings','wallet','game-run') then
    if method<>'POST' then perform game_private.fail('Method not allowed.',405); end if;
  else perform game_private.fail('Endpoint not found.',404); end if;

  if endpoint='catalog' then
    return jsonb_build_object('skins',coalesce((select jsonb_agg(definition || jsonb_build_object('price',s.price,'type',s.definition->>'rarity'||' Skin') order by s.price desc,s.id) from game_private.skins s where active and not starter),'[]'),'demoTopupsEnabled',false);
  elsif endpoint='username-availability' then
    name := btrim(body->>'username');
    if name is null or name !~ '^[A-Za-z0-9_]{3,50}$' then perform game_private.fail('Use 3–50 letters, numbers or underscores for your username.'); end if;
    return jsonb_build_object('username',name,'available',not exists(select 1 from game_private.players where lower(username)=lower(name)));
  elsif endpoint='signup-challenge' then
    a := 2+floor(random()*8)::integer; b := 2+floor(random()*8)::integer;
    challenge_id := encode(extensions.gen_random_bytes(16),'hex');
    insert into game_private.challenges values(game_private.hash(guest),challenge_id,game_private.hash(challenge_id||':'||(a+b)::text),now(),now()+interval '5 minutes')
      on conflict(guest_hash) do update set id=excluded.id,answer_hash=excluded.answer_hash,issued_at=excluded.issued_at,expires_at=excluded.expires_at;
    return jsonb_build_object('id',challenge_id,'question','What is '||a||' + '||b||'?','expiresAt',(t+300)*1000);
  elsif endpoint in ('signup','login') then
    name := btrim(body->>(case when endpoint='signup' then 'username' else 'identity' end));
    password := body->>'password';
    if jsonb_typeof(body->(case when endpoint='signup' then 'username' else 'identity' end))<>'string' or name is null or name !~ '^[A-Za-z0-9_]{3,50}$' then perform game_private.fail('Use 3–50 letters, numbers or underscores for your username.'); end if;
    if jsonb_typeof(body->'password') is distinct from 'string' or octet_length(password)>72 or octet_length(password)<(case when endpoint='signup' then 8 else 1 end) then perform game_private.fail('Enter a valid password (8–72 UTF-8 bytes when registering).'); end if;
    if endpoint='signup' then
      if body->'terms' is distinct from 'true'::jsonb then perform game_private.fail('Please agree to the Terms of Use and acknowledge the Privacy Policy.'); end if;
      answer := btrim(body->>'challengeAnswer');
      if challenge is null or body->>'challengeId' is distinct from challenge->>'id' or
        jsonb_typeof(body->'challengeAnswer') is distinct from 'string' or answer !~ '^[0-9]{1,2}$' or
        coalesce(body->>'website','')<>'' or
        now()<(challenge->>'issued_at')::timestamptz+interval '2 seconds' or now()>=(challenge->>'expires_at')::timestamptz or
        game_private.hash((challenge->>'id')||':'||(answer::integer)::text) is distinct from challenge->>'answer_hash' then
        return jsonb_build_object('_status',422,'message','Please try the new human check below.','code','verification_failed');
      end if;
      if jsonb_typeof(body->'email') is distinct from 'string' or not game_private.valid_email(body->>'email') then
        perform game_private.fail('Enter a valid email address.');
      end if;
      insert into game_private.players(username,password_hash,display_name,pending_email,email_required)
        values(name,extensions.crypt(password,extensions.gen_salt('bf',10)),name,lower(btrim(body->>'email')),true) returning * into p;
      return jsonb_build_object('_status',201,'user',null,'csrfToken','bearer-session','verificationRequired',true,'username',p.username);
    else
      select * into p from game_private.players where lower(username)=lower(name) for update;
      if p.id is null then
        perform extensions.crypt(password,'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        perform game_private.fail('Incorrect username or password.',401);
      end if;
      if extensions.crypt(password,p.password_hash)<>p.password_hash then perform game_private.fail('Incorrect username or password.',401); end if;
    end if;
    if p.email_required and p.email_verified_at is null then return jsonb_build_object('_status',403,'message','Verify your email before signing in.','code','email_unverified'); end if;
    return game_private.new_session(p,body->'rememberMe'='true'::jsonb,token)||jsonb_build_object('_status',case when endpoint='signup' then 201 else 200 end);
  elsif endpoint='session' then
    if not exists(select 1 from game_private.sessions s join game_private.players x on x.id=s.player_id and x.auth_version=s.auth_version where s.token_hash=game_private.hash(token) and s.expires_at>now()) then
      return jsonb_build_object('user',null,'csrfToken','bearer-session');
    end if;
  end if;

  p := game_private.player_for_token(token);
  if endpoint='session' then return jsonb_build_object('user',game_private.snapshot(p.id),'csrfToken','bearer-session'); end if;
  if endpoint='me' then return jsonb_build_object('user',game_private.snapshot(p.id)); end if;
  if endpoint='logout' then
    delete from game_private.sessions where token_hash=game_private.hash(token);
    return jsonb_build_object('message','Logged out.');
  elsif endpoint='profile' then
    name := btrim(body->>'displayName');
    if jsonb_typeof(body->'displayName') is distinct from 'string' or char_length(name) not between 2 and 30 or octet_length(name)>120 or
       name !~ '^[[:alnum:] ._''’\-]+$' or name !~ '[[:alnum:]]' then
      perform game_private.fail('Use 2–30 characters for your display name: letters, numbers, spaces, periods, apostrophes, underscores or hyphens.');
    end if;
    if body->>'avatarId' is null or body->>'avatarId' not in ('sunny','lila','miko','maya') then perform game_private.fail('Choose one of the available profile icons.'); end if;
    update game_private.players set display_name=name,avatar_id=body->>'avatarId',version=version+1 where id=p.id;
    return jsonb_build_object('user',game_private.snapshot(p.id));
  elsif endpoint='inventory' then
    if method='POST' then
      select * into skin from game_private.skins s where s.id=body->>'skinId' and s.definition->>'game'=g and
        (s.starter or exists(select 1 from game_private.owned_skins o where o.player_id=p.id and o.skin_id=s.id));
      if not found then perform game_private.fail('This skin is not available for that game.'); end if;
      update game_private.players set tumbang_skin=case when g='tumbang-preso' then skin.id else tumbang_skin end,
        jolens_skin=case when g='jolens-blast' then skin.id else jolens_skin end,version=version+1 where id=p.id;
      return jsonb_build_object('user',game_private.snapshot(p.id));
    end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(s.definition order by s.starter desc,s.id) from game_private.skins s where s.starter or exists(select 1 from game_private.owned_skins o where o.player_id=p.id and o.skin_id=s.id)),'[]'),'collectibles','[]'::jsonb,'user',game_private.snapshot(p.id));
  elsif endpoint='settings' then
    password := body->>'currentPassword';
    if jsonb_typeof(body->'currentPassword') is distinct from 'string' or octet_length(password) not between 1 and 72 then perform game_private.fail('Enter your current password to save this change.'); end if;
    if extensions.crypt(password,p.password_hash)<>p.password_hash then perform game_private.fail('Your current password is incorrect.'); end if;
    if action='username' then
      name := btrim(body->>'username');
      if name is null or name !~ '^[A-Za-z0-9_]{3,50}$' then perform game_private.fail('Use 3–50 letters, numbers or underscores for your username.'); end if;
      if name=p.username then perform game_private.fail('Choose a different username before saving.'); end if;
      update game_private.players set username=name,auth_version=auth_version+1,version=version+1 where id=p.id returning * into p;
    elsif action='password' then
      password := body->>'newPassword';
      if jsonb_typeof(body->'newPassword') is distinct from 'string' or octet_length(password) not between 8 and 72 then perform game_private.fail('Use a password between 8 and 72 bytes long.'); end if;
      if password is distinct from body->>'confirmPassword' then perform game_private.fail('The new passwords do not match.'); end if;
      if extensions.crypt(password,p.password_hash)=p.password_hash then perform game_private.fail('Choose a different password before saving.'); end if;
      update game_private.players set password_hash=extensions.crypt(password,extensions.gen_salt('bf',10)),auth_version=auth_version+1,version=version+1 where id=p.id returning * into p;
    else perform game_private.fail('Choose a supported account setting.'); end if;
    select * into old_session from game_private.sessions where token_hash=game_private.hash(token);
    delete from game_private.sessions where player_id=p.id;
    result := game_private.new_session(p,false);
    update game_private.sessions set expires_at=old_session.expires_at where token_hash=game_private.hash(result->>'sessionToken');
    return result||jsonb_build_object('expiresAt',floor(extract(epoch from old_session.expires_at)*1000));
  elsif endpoint='wallet' then
    request_id := body->>'requestId'; item := body->>'item';
    if request_id is null or request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform game_private.fail('Invalid request ID.'); end if;
    request_hash := game_private.hash(jsonb_build_array(action,item)::text);
    perform game_private.snapshot(p.id);
    select * into p from game_private.players where id=p.id;
    select w.request_hash into previous_hash from game_private.wallet_operations w where w.player_id=p.id and w.request_id=dispatch.request_id;
    if found then
      if previous_hash<>request_hash then perform game_private.fail('This request ID was already used for another action.',409); end if;
      return jsonb_build_object('user',game_private.snapshot(p.id));
    end if;
    if action='consume_juice' then
      if item is null or item not in ('tumbang_retry','jolens_round') then perform game_private.fail('Unknown game action.'); end if;
      perform game_private.charge(p.id,request_id,item);
      return jsonb_build_object('user',game_private.snapshot(p.id));
    elsif action='demo_topup' then perform game_private.fail('Simulated top-ups are disabled.',403);
    elsif action<>'purchase' or action is null then perform game_private.fail('Unknown account action.'); end if;
    refill := 0; price := 0;
    if item='energy_small' then price:=50; refill:=20;
    elsif item='energy_med' then price:=100; refill:=50;
    elsif item='energy_unli' then
      price:=500;
      if p.permanent_juice or p.unlimited_until>t then perform game_private.fail('Your unlimited Juice is already active.',409); end if;
    else
      select * into skin from game_private.skins where id=item and active and not starter;
      if not found then perform game_private.fail('This item is not available.'); end if;
      if exists(select 1 from game_private.owned_skins where player_id=p.id and skin_id=item) then perform game_private.fail('You already own this skin.',409); end if;
      price:=skin.price;
    end if;
    if refill>0 and p.juice>=100 then perform game_private.fail('Your Juice is already full.',409); end if;
    if p.tansans<price then perform game_private.fail('Not enough Tansans.',409); end if;
    update game_private.players set tansans=tansans-price,juice=least(100,juice+refill),version=version+1,
      refill_at=case when juice+refill>=100 then 0 when refill_at=0 then t else refill_at end,
      unlimited_until=case when item='energy_unli' then t+3600 else unlimited_until end where id=p.id;
    if skin.id is not null then insert into game_private.owned_skins values(p.id,skin.id); end if;
    insert into game_private.wallet_operations values(p.id,request_id,request_hash,'purchase:'||item,-price,least(refill,100-p.juice),now());
    return jsonb_build_object('user',game_private.snapshot(p.id));
  end if;

  if g is null or g not in ('tumbang-preso','jolens-blast') then perform game_private.fail('Unknown game.'); end if;
  if endpoint='tutorial' then
    if method='POST' then insert into game_private.tutorials values(p.id,g) on conflict do nothing; end if;
    return jsonb_build_object('game',g,'seen',exists(select 1 from game_private.tutorials where player_id=p.id and game=g));
  elsif endpoint='scores' then
    if method<>'GET' then perform game_private.fail('Scores are calculated from verified game runs.',422); end if;
    return jsonb_build_object('game',g,'highScores',coalesce((select jsonb_agg(x.row) from (
      select jsonb_build_object('userId',u.id,'username',u.username,'displayName',u.display_name,'avatarId',u.avatar_id,'points',s.points) as row
      from game_private.scores s join game_private.players u on u.id=s.player_id where s.game=g order by s.points desc,s.player_id limit 10) x),'[]'),
      'personalBest',coalesce((select s.points from game_private.scores s where s.player_id=p.id and s.game=g),0));
  end if;

  -- Browser input only contains actions/velocities. The Edge Function supplies replay.
  request_id := body->>'requestId';
  allowed:=array['game','action','requestId'];
  if action is null or action not in ('start','shot','next','retry','round','finish') then perform game_private.fail('Unknown game action.'); end if;
  if action<>'start' then allowed:=allowed||array['runId','sequence']; end if;
  if action='shot' then allowed:=allowed||array['vx','vy']; end if;
  if action='round' then allowed:=allowed||array['bet']; end if;
  if exists(select 1 from jsonb_object_keys(body) k where not k=any(allowed)) then perform game_private.fail('Scores and game state cannot be supplied by the browser.'); end if;
  if request_id is null or request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform game_private.fail('Invalid request ID.'); end if;
  request_hash:=game_private.hash(body::text);
  select * into r from game_private.runs where player_id=p.id and game=g for update;
  if action='start' then
    if r.id is null or r.start_id<>request_id then
      state:=jsonb_build_object('status',case when g='tumbang-preso' then 'ready' else 'bet' end,'score',0,'level',1,'inventory',10,'completed',false,'targets','[]'::jsonb,
        'obstacles',case when g='tumbang-preso' then game_private.obstacles(1) else '[]'::jsonb end,'at',extract(epoch from clock_timestamp()));
      insert into game_private.runs values(p.id,g,encode(extensions.gen_random_bytes(32),'hex'),request_id,0,p.auth_version,t+7200,state,'')
      on conflict(player_id,game) do update set id=excluded.id,start_id=excluded.start_id,sequence=0,auth_version=excluded.auth_version,expires_at=excluded.expires_at,state=excluded.state,last_hash=''
      returning * into r;
    end if;
  else
    if r.id is null or r.id is distinct from body->>'runId' then perform game_private.fail('This game was replaced or belongs to another account. Start a new game.',409); end if;
    if jsonb_typeof(body->'sequence') is distinct from 'number' or (body->>'sequence') !~ '^[0-9]{1,6}$' then perform game_private.fail('Invalid game sequence.'); end if;
    if r.expires_at<=t or r.auth_version<>p.auth_version then perform game_private.fail('This game expired. Start a new game.',409); end if;
    if (body->>'sequence')::integer=r.sequence-1 and r.last_hash=request_hash then
      return jsonb_build_object('run',game_private.run_snapshot(r),'user',game_private.snapshot(p.id));
    end if;
    if (body->>'sequence')::integer<>r.sequence then perform game_private.fail('The game changed in another request. Reload to start again.',409); end if;
    if r.sequence>=4000 then perform game_private.fail('This game reached its action limit. Start a new game.',409); end if;
    if r.expires_at<=t or r.auth_version<>p.auth_version then perform game_private.fail('This game expired. Start a new game.',409); end if;
    state:=r.state;
    if action='shot' then
      if state->>'status'<>(case when g='tumbang-preso' then 'ready' else 'playing' end) then perform game_private.fail('Start an attempt before taking a shot.',409); end if;
      if replay is null or replay->>'runId' is distinct from r.id or (replay->>'sequence')::integer<>r.sequence then perform game_private.fail('The game changed during verification. Please retry.',409); end if;
      if extract(epoch from clock_timestamp())-(state->>'at')::numeric+0.1<(replay->>'frames')::numeric/60 then perform game_private.fail('The shot has not finished. Please retry.',425); end if;
      state:=state||jsonb_build_object('completed',true);
      if g='tumbang-preso' then
        state:=state||jsonb_build_object('status',case when (replay->>'hit')::boolean then 'hit' else 'miss' end,
          'score',(state->>'score')::integer+case when (replay->>'hit')::boolean then 100 else 0 end);
      else
        state:=state||jsonb_build_object('inventory',(state->>'inventory')::integer+(replay->>'delta')::integer,'targets',replay->'targets',
          'status',case when jsonb_array_length(replay->'targets')=0 then 'won' else 'playing' end);
      end if;
    elsif action='next' and g='tumbang-preso' and state->>'status'='hit' then
      next_level:=(state->>'level')::integer+1;
      state:=state||jsonb_build_object('level',next_level,'obstacles',game_private.obstacles(next_level),'status','ready');
    elsif action='retry' and g='tumbang-preso' and state->>'status'='miss' then
      perform game_private.charge(p.id,'run:'||r.id||':'||r.sequence,'tumbang_retry');
      state:=state||jsonb_build_object('status','ready');
    elsif action='round' and g='jolens-blast' and state->>'status' in ('bet','won') then
      if jsonb_typeof(body->'bet') is distinct from 'number' or (body->>'bet') !~ '^[1-5]$' then perform game_private.fail('Invalid marble bet.'); end if;
      bet:=(body->>'bet')::integer;
      if bet>least(5,(state->>'inventory')::integer-1) then perform game_private.fail('Invalid marble bet.'); end if;
      perform game_private.charge(p.id,'run:'||r.id||':'||r.sequence,'jolens_round');
      if replay is null or jsonb_array_length(replay->'targets')<>bet*2 then perform game_private.fail('Cannot generate marble layout.',503); end if;
      state:=state||jsonb_build_object('inventory',(state->>'inventory')::integer-bet,'targets',replay->'targets','status','playing');
    elsif action='finish' and g='jolens-blast' and state->>'status'<>'finished' then
      state:=state||jsonb_build_object('score',case when (state->>'completed')::boolean then (state->>'inventory')::integer*50 else 0 end,'status','finished');
    else perform game_private.fail('That action is not available in this game state.',409); end if;
    if g='jolens-blast' and (state->>'inventory')::integer<=0 then state:=state||jsonb_build_object('score',0,'status','finished'); end if;
    points:=(state->>'score')::integer;
    if points>0 then
      insert into game_private.scores values(p.id,g,points) on conflict(player_id,game) do update set points=greatest(game_private.scores.points,excluded.points);
    end if;
    state:=state||jsonb_build_object('at',extract(epoch from clock_timestamp()));
    update game_private.runs x set state=dispatch.state,sequence=x.sequence+1,last_hash=request_hash where x.player_id=p.id and x.game=g returning * into r;
  end if;
  if r.expires_at<=t or r.auth_version<>p.auth_version then perform game_private.fail('This game expired. Start a new game.',409); end if;
  return jsonb_build_object('run',game_private.run_snapshot(r),'user',game_private.snapshot(p.id));
end $$;

-- Only the Edge Function can issue a code or receive a delivery packet.
create function public.tp_email_api(p_endpoint text,p_body jsonb,p_token text,p_ip text,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $$
<<email_api>>
declare
  p game_private.players; c game_private.email_codes; address text; purpose text; identity text;
  generic jsonb := jsonb_build_object('message','If the account is eligible, a code will arrive shortly. Check your spam folder.');
  invalid jsonb := jsonb_build_object('_status',422,'message','The code is invalid or expired. Request a new code.');
  n integer;
begin
  if jsonb_typeof(p_body) is distinct from 'object' or p_endpoint not in ('set-email','request-verification','verify-email','reset-request','reset-confirm') then
    return jsonb_build_object('_status',400,'message','Invalid account request.');
  end if;
  if not game_private.limit_request('email-ip:'||p_ip,30) then return jsonb_build_object('_status',429,'message','Too many attempts. Please try again in 15 minutes.'); end if;
  identity:=lower(btrim(coalesce(p_body->>'identity',p_body->>'email','')));
  if not game_private.limit_request('email-action:'||p_endpoint||':'||identity,case when p_endpoint in ('verify-email','reset-confirm') then 10 else 3 end) then
    return jsonb_build_object('_status',429,'message','Too many attempts. Please try again in 15 minutes.');
  end if;
  delete from game_private.email_codes where expires_at<=now();
  begin
    if p_endpoint='set-email' then
      p:=game_private.player_for_token(p_token);
      if not game_private.limit_request('email-account:'||p.id,3) then return jsonb_build_object('_status',429,'message','Please wait 15 minutes before requesting another email.'); end if;
      if jsonb_typeof(p_body->'currentPassword') is distinct from 'string' or octet_length(p_body->>'currentPassword') not between 1 and 72 or
        extensions.crypt(p_body->>'currentPassword',p.password_hash)<>p.password_hash then
        return jsonb_build_object('_status',422,'message','Your current password is incorrect.');
      end if;
      if jsonb_typeof(p_body->'email') is distinct from 'string' or not game_private.valid_email(p_body->>'email') then
        return jsonb_build_object('_status',422,'message','Enter a valid email address.');
      end if;
      address:=lower(btrim(p_body->>'email')); purpose:='verify';
      update game_private.players set pending_email=address where id=p.id;
      -- The old, verified address remains active until the new address is proved.
    elsif p_endpoint in ('request-verification','verify-email') then
      if identity !~ '^[a-z0-9_]{3,50}$' then return case when p_endpoint='verify-email' then invalid else generic end; end if;
      select * into p from game_private.players where lower(username)=identity for update;
      if not found or p.pending_email is null then return case when p_endpoint='verify-email' then invalid else generic end; end if;
      address:=p.pending_email; purpose:='verify';
    else
      if not game_private.valid_email(identity) then return case when p_endpoint='reset-confirm' then invalid else generic end; end if;
      select * into p from game_private.players where email=identity and email_verified_at is not null for update;
      if not found then return case when p_endpoint='reset-confirm' then invalid else generic end; end if;
      address:=p.email; purpose:='reset';
    end if;
    if p_endpoint in ('verify-email','reset-confirm') then
      select * into c from game_private.email_codes where player_id=p.id and email_codes.purpose=email_api.purpose for update;
      if not found or c.attempts>=5 or c.auth_version<>p.auth_version or c.email<>address then return invalid; end if;
      -- Return errors instead of raising, so failed guesses consume an attempt.
      update game_private.email_codes set attempts=attempts+1 where player_id=p.id and email_codes.purpose=email_api.purpose;
      if jsonb_typeof(p_body->'code') is distinct from 'string' or p_body->>'code' !~ '^[0-9]{8}$' or
        game_private.hash(p.id||':'||purpose||':'||(p_body->>'code'))<>c.code_hash then return invalid; end if;
      if purpose='verify' then
        if exists(select 1 from game_private.players where email=address and id<>p.id) then
          return jsonb_build_object('_status',409,'message','This email address cannot be used. Choose a different address in account settings.');
        end if;
        update game_private.players set email=address,email_verified_at=now(),pending_email=null where id=p.id;
        -- Old reset codes cannot reset an account after its email changes.
        delete from game_private.email_codes where player_id=p.id;
        return jsonb_build_object('message','Email verified. You can now sign in.');
      end if;
      if jsonb_typeof(p_body->'newPassword') is distinct from 'string' or octet_length(p_body->>'newPassword') not between 8 and 72 or
        p_body->>'newPassword' is distinct from p_body->>'confirmPassword' then
        return jsonb_build_object('_status',422,'message','Use matching passwords of 8–72 UTF-8 bytes.');
      end if;
      update game_private.players set password_hash=extensions.crypt(p_body->>'newPassword',extensions.gen_salt('bf',10)),
        auth_version=auth_version+1,version=version+1 where id=p.id;
      delete from game_private.sessions where player_id=p.id;
      delete from game_private.runs where player_id=p.id;
      delete from game_private.email_codes where player_id=p.id;
      return jsonb_build_object('message','Password reset. Sign in with your new password.');
    end if;
    if not game_private.limit_request('email-recipient:'||address,3) then return generic; end if;
    -- Fixed daily budget below personal Gmail limits; no paid email API required.
    delete from game_private.email_budget where day < current_date;
    insert into game_private.email_budget values(current_date,1)
      on conflict(day) do update set sent=game_private.email_budget.sent+1 returning sent into n;
    if n>90 then return generic; end if;
    if p_code is null or p_code !~ '^[0-9]{8}$' then perform game_private.fail('Email service is unavailable.',503); end if;
    insert into game_private.email_codes values(p.id,purpose,address,game_private.hash(p.id||':'||purpose||':'||p_code),0,p.auth_version,now()+interval '10 minutes')
      on conflict on constraint email_codes_pkey do update set email=excluded.email,code_hash=excluded.code_hash,attempts=0,auth_version=excluded.auth_version,expires_at=excluded.expires_at;
    return generic||jsonb_build_object('_mail',jsonb_build_object('id',extensions.gen_random_uuid(),'to',address,'code',p_code,'purpose',purpose));
  exception
    when unique_violation then return jsonb_build_object('_status',409,'message','This email address cannot be used.');
    when sqlstate 'P0001' then return jsonb_build_object('_status',401,'message','Please sign in again.');
    when invalid_text_representation or check_violation then return jsonb_build_object('_status',422,'message','Invalid account request.');
  end;
end $$;
revoke all on function public.tp_email_api(text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.tp_email_api(text,jsonb,text,text,text) to service_role;
revoke all on function game_private.valid_email(text) from public,anon,authenticated;
grant execute on function game_private.valid_email(text) to service_role;
commit;
