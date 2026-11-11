begin;
-- Application identity is username/password, independent of Supabase Auth.
-- Only the Edge Function's service role may call this API or touch private data.
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;
grant usage on schema game_private to service_role;
create extension if not exists pgcrypto with schema extensions;

create table game_private.players (
  id bigint generated always as identity primary key,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,50}$'),
  password_hash text not null,
  display_name text not null,
  avatar_id text not null default 'sunny' check (avatar_id in ('sunny','lila','miko','maya')),
  tumbang_skin text not null default 'slipper_pink',
  jolens_skin text not null default 'shooter_chrome',
  tansans integer not null default 0 check (tansans between 0 and 1000000000),
  juice integer not null default 100 check (juice between 0 and 100),
  unlimited_until bigint not null default 0,
  permanent_juice boolean not null default false,
  refill_at bigint not null default 0,
  version bigint not null default 0,
  auth_version bigint not null default 0,
  created_at timestamptz not null default now()
);
create unique index players_username on game_private.players (lower(username));
create table game_private.sessions (
  token_hash text primary key,
  player_id bigint not null references game_private.players on delete cascade,
  auth_version bigint not null,
  expires_at timestamptz not null
);
create index sessions_player on game_private.sessions (player_id);
create index sessions_expiry on game_private.sessions (expires_at);
create table game_private.skins (
  id text primary key, definition jsonb not null, price integer not null check (price >= 0),
  starter boolean not null default false, active boolean not null default true
);
create table game_private.owned_skins (
  player_id bigint not null references game_private.players on delete cascade,
  skin_id text not null references game_private.skins,
  primary key(player_id, skin_id)
);
create table game_private.tutorials (
  player_id bigint not null references game_private.players on delete cascade,
  game text not null check (game in ('tumbang-preso','jolens-blast')),
  primary key(player_id, game)
);
create table game_private.wallet_operations (
  player_id bigint not null references game_private.players on delete cascade,
  request_id text not null, request_hash text not null, action text not null,
  tansans_delta integer not null, juice_delta integer not null,
  created_at timestamptz not null default now(), primary key(player_id,request_id)
);
create table game_private.runs (
  player_id bigint not null references game_private.players on delete cascade,
  game text not null check (game in ('tumbang-preso','jolens-blast')),
  id text not null, start_id text not null, sequence integer not null default 0,
  auth_version bigint not null, expires_at bigint not null, state jsonb not null,
  last_hash text not null default '', primary key(player_id,game)
);
create table game_private.scores (
  player_id bigint not null references game_private.players on delete cascade,
  game text not null check (game in ('tumbang-preso','jolens-blast')),
  points integer not null check (points > 0), primary key(player_id,game)
);
create index scores_ranking on game_private.scores (game,points desc,player_id);
create table game_private.challenges (
  guest_hash text primary key, id text not null, answer_hash text not null,
  issued_at timestamptz not null, expires_at timestamptz not null
);
create index challenges_expiry on game_private.challenges (expires_at);
create table game_private.rate_limits (
  bucket text primary key, attempts integer not null, expires_at timestamptz not null
);
create index rate_limits_expiry on game_private.rate_limits (expires_at);
create table game_private.layouts (tier integer not null, variant integer not null, obstacles jsonb not null, primary key(tier,variant));


-- Preserve pre-Supabase history without accepting old browser totals as rankings.
create table game_private.legacy_scores (
  player_id bigint not null references game_private.players on delete cascade,
  game text not null, points integer not null, primary key(player_id,game)
);
create table game_private.legacy_runs (
  player_id bigint not null references game_private.players on delete cascade,
  game text not null, record jsonb not null, primary key(player_id,game)
);

-- No private data is reachable through the browser's publishable key.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'game_private' loop
    execute format('alter table game_private.%I enable row level security',t);
  end loop;
end $$;
revoke all on all tables in schema game_private from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema game_private to service_role;
grant usage,select on all sequences in schema game_private to service_role;
alter default privileges in schema game_private revoke execute on functions from public;

create function game_private.fail(message text, status integer default 422) returns void
language plpgsql set search_path = '' as $$ begin
  raise exception using message = message, detail = status::text, errcode = 'P0001';
end $$;

create function game_private.hash(value text) returns text
language sql immutable set search_path = '' as $$ select encode(extensions.digest(value,'sha256'),'hex') $$;

create function game_private.limit_request(key text, maximum integer) returns boolean
language plpgsql set search_path = '' as $$ declare n integer; begin
  delete from game_private.rate_limits where expires_at <= now();
  insert into game_private.rate_limits values (game_private.hash(key),1,now()+interval '15 minutes')
    on conflict(bucket) do update set attempts = game_private.rate_limits.attempts+1 returning attempts into n;
  return n <= maximum;
end $$;

-- Call under the player row lock; session identity is always server-validated.
create function game_private.player_for_token(token text) returns game_private.players
language plpgsql set search_path = '' as $$ declare p game_private.players; s game_private.sessions; begin
  select * into s from game_private.sessions where token_hash = game_private.hash(token) and expires_at > now();
  if not found then perform game_private.fail('Please log in to continue.',401); end if;
  select * into p from game_private.players where id=s.player_id for update;
  if not found or p.auth_version <> s.auth_version then perform game_private.fail('Your sign-in details changed. Please log in again.',401); end if;
  return p;
end $$;

create function game_private.snapshot(player_id bigint) returns jsonb
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
    'tansans',p.tansans,'juice',p.juice,'ownedSkins',coalesce((select jsonb_agg(s.skin_id order by s.skin_id) from game_private.owned_skins s where s.player_id=p.id),'[]'),
    'equippedSkins',jsonb_build_object('tumbang-preso',p.tumbang_skin,'jolens-blast',p.jolens_skin),
    'unlimitedJuiceUntil',p.unlimited_until*1000,'permanentJuice',p.permanent_juice,'walletVersion',p.version,
    'nextJuiceAt',case when p.juice<100 then (p.refill_at+144)*1000 else 0 end,'serverTime',current_seconds*1000);
end $$;

create function game_private.new_session(p game_private.players, remember boolean, old_token text default '') returns jsonb
language plpgsql set search_path = '' as $$ declare token text := encode(extensions.gen_random_bytes(32),'hex'); expiry timestamptz; begin
  expiry := now()+case when remember then interval '30 days' else interval '8 hours' end;
  if old_token<>'' then delete from game_private.sessions where token_hash=game_private.hash(old_token); end if;
  insert into game_private.sessions values(game_private.hash(token),p.id,p.auth_version,expiry);
  return jsonb_build_object('user',game_private.snapshot(p.id),'csrfToken','bearer-session','sessionToken',token,'expiresAt',floor(extract(epoch from expiry)*1000));
end $$;

create function game_private.obstacles(level integer) returns jsonb
language sql volatile set search_path = '' as $$
  select obstacles from game_private.layouts where tier = case when level>=20 then 20 when level>=12 then 12 when level>=6 then 6 else level end order by random() limit 1
$$;

create function game_private.run_snapshot(r game_private.runs) returns jsonb
language sql immutable set search_path = '' as $$
  select (r.state-'at') || jsonb_build_object('id',r.id,'game',r.game,'sequence',r.sequence,'expiresAt',r.expires_at*1000)
$$;

create function game_private.charge(player_id bigint, request_id text, reason text) returns void
language plpgsql set search_path = '' as $$ declare p game_private.players; cost integer; begin
  perform game_private.snapshot(player_id);
  select * into strict p from game_private.players where id=player_id for update;
  cost := case when p.permanent_juice or p.unlimited_until>extract(epoch from now()) then 0 else 20 end;
  if p.juice<cost then perform game_private.fail('You need 20 Juice to continue.',409); end if;
  update game_private.players set juice=juice-cost,version=version+1,
    refill_at=case when juice-cost>=100 then 0 when refill_at=0 then floor(extract(epoch from now())) else refill_at end where id=player_id;
  insert into game_private.wallet_operations values(player_id,request_id,game_private.hash(reason),'consume_juice:'||reason,0,-cost,now());
end $$;

create function game_private.dispatch(endpoint text, method text, body jsonb, token text, guest text, replay jsonb, challenge jsonb)
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
      insert into game_private.players(username,password_hash,display_name)
        values(name,extensions.crypt(password,extensions.gen_salt('bf',10)),name) returning * into p;
    else
      select * into p from game_private.players where lower(username)=lower(name) for update;
      if p.id is null then
        perform extensions.crypt(password,'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        perform game_private.fail('Incorrect username or password.',401);
      end if;
      if extensions.crypt(password,p.password_hash)<>p.password_hash then perform game_private.fail('Incorrect username or password.',401); end if;
    end if;
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

-- Errors inside the nested block roll back business writes, but rate-limit and
-- one-use challenge consumption outside that block survive rejected requests.
create function public.tp_api(p_endpoint text, p_method text, p_body jsonb, p_token text, p_guest text, p_ip text, p_replay jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; challenge jsonb; status integer; detail text; identity text; maximum integer; key text; rate_account bigint;
begin
  if jsonb_typeof(p_body) is distinct from 'object' then return jsonb_build_object('_status',400,'message','Expected a JSON object.'); end if;
  if not game_private.limit_request('all:'||p_ip,2000) then return jsonb_build_object('_status',429,'message','Too many requests. Please try again later.'); end if;
  delete from game_private.sessions where expires_at<=now();
  delete from game_private.challenges where expires_at<=now();
  maximum:=case p_endpoint when 'login' then 60 when 'signup' then 20 when 'signup-challenge' then 40 when 'username-availability' then 60 when 'settings' then 15 else 900 end;
  select s.player_id into rate_account from game_private.sessions s where s.token_hash=game_private.hash(p_token) and s.expires_at>now();
  key:=p_endpoint||':'||case when p_endpoint in ('settings','game-run','wallet','profile','inventory','tutorial','scores') then coalesce(rate_account::text,game_private.hash(p_token)) else p_ip end;
  if p_endpoint='game-run' and p_body->>'action'='start' and not game_private.limit_request('starts:'||coalesce(rate_account::text,p_ip),60) then return jsonb_build_object('_status',429,'message','Too many game starts. Please try again later.'); end if;
  if not game_private.limit_request(key,maximum) then return jsonb_build_object('_status',429,'message','Too many attempts. Please try again in 15 minutes.'); end if;
  if p_endpoint='login' then
    identity:=lower(btrim(coalesce(p_body->>'identity','')));
    if not game_private.limit_request('identity:'||identity,15) then return jsonb_build_object('_status',429,'message','Too many attempts. Please try again in 15 minutes.'); end if;
  end if;
  if p_endpoint='signup' then
    delete from game_private.challenges where guest_hash=game_private.hash(p_guest) returning to_jsonb(game_private.challenges.*) into challenge;
  end if;
  begin
    result:=game_private.dispatch(p_endpoint,p_method,p_body,p_token,p_guest,p_replay,challenge);
    return result;
  exception
    when unique_violation then return jsonb_build_object('_status',409,'message','Username is taken.');
    when sqlstate 'P0001' then
      get stacked diagnostics detail=pg_exception_detail;
      status:=case when detail ~ '^[45][0-9]{2}$' then detail::integer else 422 end;
      return jsonb_build_object('_status',status,'message',sqlerrm);
    when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then
      return jsonb_build_object('_status',422,'message','Invalid request fields.');
  end;
end $$;

create function public.tp_game_context(p_token text, p_game text) returns jsonb
language plpgsql security invoker set search_path = '' as $$ declare p game_private.players; r game_private.runs; begin
  p:=game_private.player_for_token(p_token);
  if not game_private.limit_request('replays:'||p.id,900) then perform game_private.fail('Too many shots. Please try again later.',429); end if;
  select * into r from game_private.runs where player_id=p.id and game=p_game;
  if not found then perform game_private.fail('Start a new game.',409); end if;
  return game_private.run_snapshot(r);
end $$;

revoke all on all functions in schema game_private from public,anon,authenticated;
grant execute on all functions in schema game_private to service_role;
revoke all on function public.tp_api(text,text,jsonb,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.tp_game_context(text,text) from public,anon,authenticated;
grant execute on function public.tp_api(text,text,jsonb,text,text,text,jsonb) to service_role;
grant execute on function public.tp_game_context(text,text) to service_role;

insert into game_private.skins values ('slipper_pink','{"id":"slipper_pink","name":"Pink Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_pink.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('slipper_blue','{"id":"slipper_blue","name":"Blue Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_blue.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('slipper_green','{"id":"slipper_green","name":"Green Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_green.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('slipper_orange','{"id":"slipper_orange","name":"Orange Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_orange.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('slipper_red','{"id":"slipper_red","name":"Red Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_red.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('slipper_yellow','{"id":"slipper_yellow","name":"Yellow Slipper","game":"tumbang-preso","imageUrl":"assets/tumbang-preso-assets/slippers/slipper_yellow.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('shooter_chrome','{"id":"shooter_chrome","name":"Classic Chrome","game":"jolens-blast","imageUrl":"assets/jolens-blast-assets/shooters/shooter_chrome.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('shooter_gold','{"id":"shooter_gold","name":"Golden Jolens","game":"jolens-blast","imageUrl":"assets/jolens-blast-assets/shooters/shooter_gold.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('shooter_blue_swirl','{"id":"shooter_blue_swirl","name":"Blue Swirl","game":"jolens-blast","imageUrl":"assets/jolens-blast-assets/shooters/shooter_blue_swirl.png"}'::jsonb,0,true,true);
insert into game_private.skins values ('skin_4','{"id":"skin_4","name":"Guyabanos","rarity":"Common","imageUrl":"assets/tumbang-preso-skins-assets/slipper_guyabanos.webp","game":"tumbang-preso"}'::jsonb,50,false,true);
insert into game_private.skins values ('skin_3','{"id":"skin_3","name":"Sike!","rarity":"Rare","imageUrl":"assets/tumbang-preso-skins-assets/slipper_sike.webp","game":"tumbang-preso"}'::jsonb,100,false,true);
insert into game_private.skins values ('skin_2','{"id":"skin_2","name":"Gatorz","rarity":"Epic","imageUrl":"assets/tumbang-preso-skins-assets/slipper_gatorz.webp","game":"tumbang-preso"}'::jsonb,200,false,true);
insert into game_private.skins values ('skin_1','{"id":"skin_1","name":"Aldugo","rarity":"Legendary","imageUrl":"assets/tumbang-preso-skins-assets/slipper_aldugo.webp","game":"tumbang-preso"}'::jsonb,300,false,true);
insert into game_private.skins values ('shooter_8ball','{"id":"shooter_8ball","name":"8ball","rarity":"Common","imageUrl":"assets/jolens-blast-skin-assets/marble_skin_8ball.webp","game":"jolens-blast"}'::jsonb,50,false,true);
insert into game_private.skins values ('shooter_golf','{"id":"shooter_golf","name":"Golf","rarity":"Rare","imageUrl":"assets/jolens-blast-skin-assets/marble_skin_golf.webp","game":"jolens-blast"}'::jsonb,100,false,true);
insert into game_private.skins values ('shooter_jupiter','{"id":"shooter_jupiter","name":"Jupiter","rarity":"Epic","imageUrl":"assets/jolens-blast-skin-assets/marble_skin_jupiter.webp","game":"jolens-blast"}'::jsonb,200,false,true);
insert into game_private.skins values ('shooter_steel_ball','{"id":"shooter_steel_ball","name":"Steel Ball","rarity":"Legendary","imageUrl":"assets/jolens-blast-skin-assets/marble_skin_steel_ball.webp","game":"jolens-blast"}'::jsonb,500,false,true);
insert into game_private.layouts values (1,0,'[{"x":46,"y":487,"width":66,"height":32,"color":"#fb923c"},{"x":305,"y":323,"width":65,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,1,'[{"x":59,"y":517,"width":73,"height":32,"color":"#fb923c"},{"x":297,"y":503,"width":69,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,2,'[{"x":56,"y":497,"width":62,"height":32,"color":"#fb923c"},{"x":323,"y":480,"width":64,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,3,'[{"x":61,"y":370,"width":69,"height":32,"color":"#fb923c"},{"x":313,"y":426,"width":75,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,4,'[{"x":319,"y":395,"width":76,"height":32,"color":"#fb923c"},{"x":51,"y":425,"width":78,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,5,'[{"x":70,"y":354,"width":65,"height":32,"color":"#fb923c"},{"x":329,"y":421,"width":73,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,6,'[{"x":74,"y":516,"width":71,"height":32,"color":"#fb923c"},{"x":290,"y":513,"width":75,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (1,7,'[{"x":282,"y":274,"width":64,"height":32,"color":"#fb923c"},{"x":60,"y":345,"width":77,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,0,'[{"x":315,"y":441,"width":77,"height":33,"color":"#fb923c"},{"x":47,"y":402,"width":76,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,1,'[{"x":95,"y":261,"width":68,"height":33,"color":"#fb923c"},{"x":296,"y":511,"width":73,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,2,'[{"x":328,"y":434,"width":80,"height":33,"color":"#fb923c"},{"x":52,"y":348,"width":72,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,3,'[{"x":302,"y":337,"width":74,"height":33,"color":"#fb923c"},{"x":40,"y":454,"width":79,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,4,'[{"x":344,"y":457,"width":70,"height":33,"color":"#fb923c"},{"x":60,"y":491,"width":66,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,5,'[{"x":276,"y":522,"width":71,"height":33,"color":"#fb923c"},{"x":82,"y":498,"width":70,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,6,'[{"x":284,"y":286,"width":66,"height":33,"color":"#fb923c"},{"x":65,"y":309,"width":81,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (2,7,'[{"x":302,"y":320,"width":78,"height":33,"color":"#fb923c"},{"x":57,"y":420,"width":77,"height":33,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,0,'[{"x":184,"y":371,"width":82,"height":34,"color":"#fb923c"},{"x":334,"y":417,"width":78,"height":34,"color":"#fb923c"},{"x":276,"y":307,"width":72,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,1,'[{"x":190,"y":435,"width":71,"height":34,"color":"#fb923c"},{"x":311,"y":505,"width":81,"height":34,"color":"#fb923c"},{"x":227,"y":377,"width":81,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,2,'[{"x":184,"y":367,"width":83,"height":34,"color":"#fb923c"},{"x":40,"y":479,"width":79,"height":34,"color":"#fb923c"},{"x":147,"y":459,"width":79,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,3,'[{"x":189,"y":356,"width":73,"height":34,"color":"#fb923c"},{"x":80,"y":483,"width":71,"height":34,"color":"#fb923c"},{"x":124,"y":263,"width":83,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,4,'[{"x":189,"y":475,"width":73,"height":34,"color":"#fb923c"},{"x":327,"y":367,"width":85,"height":34,"color":"#fb923c"},{"x":282,"y":506,"width":73,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,5,'[{"x":189,"y":378,"width":73,"height":34,"color":"#fb923c"},{"x":318,"y":316,"width":77,"height":34,"color":"#fb923c"},{"x":238,"y":262,"width":72,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,6,'[{"x":187,"y":443,"width":77,"height":34,"color":"#fb923c"},{"x":288,"y":349,"width":85,"height":34,"color":"#fb923c"},{"x":271,"y":489,"width":84,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (3,7,'[{"x":185,"y":477,"width":81,"height":34,"color":"#fb923c"},{"x":47,"y":344,"width":83,"height":34,"color":"#fb923c"},{"x":106,"y":256,"width":69,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,0,'[{"x":187,"y":330,"width":77,"height":34,"color":"#fb923c"},{"x":308,"y":418,"width":85,"height":34,"color":"#fb923c"},{"x":286,"y":346,"width":75,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,1,'[{"x":184,"y":395,"width":82,"height":34,"color":"#fb923c"},{"x":40,"y":476,"width":76,"height":34,"color":"#fb923c"},{"x":72,"y":415,"width":75,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,2,'[{"x":182,"y":459,"width":86,"height":34,"color":"#fb923c"},{"x":57,"y":519,"width":84,"height":34,"color":"#fb923c"},{"x":62,"y":460,"width":82,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,3,'[{"x":182,"y":381,"width":86,"height":34,"color":"#fb923c"},{"x":111,"y":545,"width":87,"height":34,"color":"#fb923c"},{"x":119,"y":286,"width":82,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,4,'[{"x":183,"y":405,"width":85,"height":34,"color":"#fb923c"},{"x":326,"y":419,"width":80,"height":34,"color":"#fb923c"},{"x":296,"y":529,"width":78,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,5,'[{"x":183,"y":338,"width":84,"height":34,"color":"#fb923c"},{"x":319,"y":384,"width":81,"height":34,"color":"#fb923c"},{"x":253,"y":532,"width":83,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,6,'[{"x":189,"y":402,"width":72,"height":34,"color":"#fb923c"},{"x":86,"y":299,"width":83,"height":34,"color":"#fb923c"},{"x":92,"y":520,"width":85,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (4,7,'[{"x":187,"y":467,"width":77,"height":34,"color":"#fb923c"},{"x":49,"y":346,"width":72,"height":34,"color":"#fb923c"},{"x":96,"y":473,"width":75,"height":34,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,0,'[{"x":185,"y":457,"width":80,"height":35,"color":"#fb923c"},{"x":62,"y":497,"width":84,"height":35,"color":"#fb923c"},{"x":163,"y":308,"width":88,"height":35,"color":"#fb923c"},{"x":51,"y":429,"width":78,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,1,'[{"x":187,"y":354,"width":76,"height":35,"color":"#fb923c"},{"x":58,"y":388,"width":85,"height":35,"color":"#fb923c"},{"x":58,"y":512,"width":77,"height":35,"color":"#fb923c"},{"x":101,"y":248,"width":85,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,2,'[{"x":184,"y":449,"width":83,"height":35,"color":"#fb923c"},{"x":283,"y":512,"width":75,"height":35,"color":"#fb923c"},{"x":232,"y":356,"width":79,"height":35,"color":"#fb923c"},{"x":290,"y":272,"width":77,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,3,'[{"x":183,"y":483,"width":85,"height":35,"color":"#fb923c"},{"x":310,"y":530,"width":84,"height":35,"color":"#fb923c"},{"x":281,"y":433,"width":85,"height":35,"color":"#fb923c"},{"x":297,"y":384,"width":83,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,4,'[{"x":181,"y":453,"width":89,"height":35,"color":"#fb923c"},{"x":300,"y":285,"width":88,"height":35,"color":"#fb923c"},{"x":178,"y":355,"width":78,"height":35,"color":"#fb923c"},{"x":328,"y":485,"width":79,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,5,'[{"x":188,"y":373,"width":75,"height":35,"color":"#fb923c"},{"x":53,"y":482,"width":75,"height":35,"color":"#fb923c"},{"x":101,"y":298,"width":79,"height":35,"color":"#fb923c"},{"x":207,"y":423,"width":89,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,6,'[{"x":184,"y":362,"width":83,"height":35,"color":"#fb923c"},{"x":87,"y":268,"width":76,"height":35,"color":"#fb923c"},{"x":40,"y":480,"width":81,"height":35,"color":"#fb923c"},{"x":187,"y":471,"width":73,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (5,7,'[{"x":184,"y":343,"width":83,"height":35,"color":"#fb923c"},{"x":54,"y":472,"width":77,"height":35,"color":"#fb923c"},{"x":161,"y":495,"width":75,"height":35,"color":"#fb923c"},{"x":136,"y":396,"width":76,"height":35,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (6,0,'[{"x":304.1317631671426,"y":473.4734110093833,"width":82,"height":26,"rotation":1.34256208704475,"color":"#fb923c"},{"x":67.90704663762313,"y":335.2235673624522,"width":82,"height":26,"rotation":-1.839875404385467,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":100,"y":500,"width":50,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (6,1,'[{"x":65.63509651766772,"y":477.14927716112766,"width":80,"height":26,"rotation":-1.3644990297270305,"color":"#fb923c"},{"x":303.6594221643876,"y":324.39291806514916,"width":80,"height":26,"rotation":1.8063612095155275,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":342,"y":541,"width":63,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (6,2,'[{"x":65.63509651766772,"y":477.14927716112766,"width":80,"height":26,"rotation":-1.3644990297270305,"color":"#fb923c"},{"x":303.6594221643876,"y":324.39291806514916,"width":80,"height":26,"rotation":1.8063612095155275,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":342,"y":541,"width":63,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (6,3,'[{"x":300.454791867917,"y":468.1821080159833,"width":86,"height":26,"rotation":1.3357576609898385,"color":"#fb923c"},{"x":60.928060662209305,"y":326.16657776195615,"width":86,"height":26,"rotation":-1.8208192311564928,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":82,"y":506,"width":70,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (6,4,'[{"x":63.54520813208303,"y":468.1821080159833,"width":86,"height":26,"rotation":-1.3357576609898385,"color":"#fb923c"},{"x":303.0719393377907,"y":326.16657776195615,"width":86,"height":26,"rotation":1.8208192311564928,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":298,"y":506,"width":70,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (6,5,'[{"x":65.36426340495717,"y":471.6185090666688,"width":84,"height":26,"rotation":-1.3388417481713617,"color":"#fb923c"},{"x":306.5427123336048,"y":327.70617889849535,"width":84,"height":26,"rotation":1.8167232811835912,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":320,"y":592,"width":71,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (6,6,'[{"x":300.63573659504283,"y":471.6185090666688,"width":84,"height":26,"rotation":1.3388417481713617,"color":"#fb923c"},{"x":59.45728766639519,"y":327.70617889849535,"width":84,"height":26,"rotation":-1.8167232811835912,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":59,"y":592,"width":71,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (6,7,'[{"x":306.96348677088054,"y":471.9641767836071,"width":83,"height":26,"rotation":1.3489027394613,"color":"#fb923c"},{"x":65.20012950672935,"y":328.71882402244785,"width":83,"height":26,"rotation":-1.8287318872937124,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":82,"y":527,"width":71,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (12,0,'[{"x":69.02478250585847,"y":517.9984179173634,"width":86,"height":26,"rotation":-1.3497922329348038,"color":"#fb923c"},{"x":304.38160877856774,"y":398.7499644260455,"width":86,"height":26,"rotation":1.5719154428308284,"color":"#fb923c"},{"x":68.42465205569485,"y":278.8149443392148,"width":86,"height":26,"rotation":4.461632742015809,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":282,"y":260,"width":72,"height":32,"color":"#fb923c"},{"x":317,"y":504,"width":50,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (12,1,'[{"x":69.02478250585847,"y":517.9984179173634,"width":86,"height":26,"rotation":-1.3497922329348038,"color":"#fb923c"},{"x":304.38160877856774,"y":398.7499644260455,"width":86,"height":26,"rotation":1.5719154428308284,"color":"#fb923c"},{"x":68.42465205569485,"y":278.8149443392148,"width":86,"height":26,"rotation":4.461632742015809,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":282,"y":260,"width":72,"height":32,"color":"#fb923c"},{"x":317,"y":504,"width":50,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (12,2,'[{"x":303.306373310727,"y":518.3669276442128,"width":81,"height":26,"rotation":1.3616250501775156,"color":"#fb923c"},{"x":67.32422284231404,"y":399.8198569446983,"width":81,"height":26,"rotation":-1.5879493878161028,"color":"#fb923c"},{"x":288.7357041862281,"y":280.6460846339248,"width":81,"height":26,"rotation":-4.4529611246239025,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":106,"y":220,"width":65,"height":32,"color":"#fb923c","rotation":0},{"x":103,"y":498,"width":74,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (12,3,'[{"x":300.87431667630096,"y":509.31506958934074,"width":84,"height":26,"rotation":1.3261560687735594,"color":"#fb923c"},{"x":63.38253378402544,"y":401.8705842868953,"width":84,"height":26,"rotation":-1.6233194348229694,"color":"#fb923c"},{"x":290.3917056823647,"y":269.6614693886321,"width":84,"height":26,"rotation":-4.488842040397747,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":103,"y":580,"width":75,"height":32,"color":"#fb923c","rotation":0},{"x":63,"y":260,"width":75,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (12,4,'[{"x":65.12568332369906,"y":509.31506958934074,"width":84,"height":26,"rotation":-1.3261560687735594,"color":"#fb923c"},{"x":302.61746621597456,"y":401.8705842868953,"width":84,"height":26,"rotation":1.6233194348229694,"color":"#fb923c"},{"x":75.6082943176353,"y":269.6614693886321,"width":84,"height":26,"rotation":4.488842040397747,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":272,"y":580,"width":75,"height":32,"color":"#fb923c"},{"x":312,"y":260,"width":75,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (12,5,'[{"x":64.43817152539364,"y":512.7766257133102,"width":87,"height":26,"rotation":-1.3312397283353103,"color":"#fb923c"},{"x":303.5800545794968,"y":403.36150572522604,"width":87,"height":26,"rotation":1.6155950220154685,"color":"#fb923c"},{"x":71.06679511881974,"y":271.14272554930886,"width":87,"height":26,"rotation":4.487818085841853,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":281,"y":570,"width":77,"height":32,"color":"#fb923c"},{"x":270,"y":207,"width":58,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (12,6,'[{"x":298.5618284746064,"y":512.7766257133102,"width":87,"height":26,"rotation":1.3312397283353103,"color":"#fb923c"},{"x":59.41994542050321,"y":403.36150572522604,"width":87,"height":26,"rotation":-1.6155950220154685,"color":"#fb923c"},{"x":291.93320488118025,"y":271.14272554930886,"width":87,"height":26,"rotation":-4.487818085841853,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":92,"y":570,"width":77,"height":32,"color":"#fb923c","rotation":0},{"x":122,"y":207,"width":58,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (12,7,'[{"x":67.65559771935543,"y":516.6699569115112,"width":82,"height":26,"rotation":-1.3703333644473559,"color":"#fb923c"},{"x":296.55067056660874,"y":392.31223526236835,"width":82,"height":26,"rotation":1.5663115505507657,"color":"#fb923c"},{"x":70.54842700675977,"y":272.722933597517,"width":82,"height":26,"rotation":4.478977231843989,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":270,"y":209,"width":77,"height":32,"color":"#fb923c"},{"x":304,"y":595,"width":71,"height":32,"color":"#fb923c"},{"x":74,"y":375,"width":72,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (20,0,'[{"x":103.4038513690763,"y":542.5258579818919,"width":85,"height":26,"rotation":-1.3551520065921259,"color":"#fb923c"},{"x":268.12158802260006,"y":441.47413818370825,"width":85,"height":26,"rotation":1.5464171165216933,"color":"#fb923c"},{"x":91.41535933288344,"y":341.1674158400647,"width":85,"height":26,"rotation":4.668296905608211,"color":"#fb923c"},{"x":249.22519953231574,"y":236.94125551246077,"width":85,"height":26,"rotation":1.8147934868836313,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":306,"y":525,"width":66,"height":32,"color":"#fb923c"},{"x":45,"y":541,"width":63,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (20,1,'[{"x":105.71930218194208,"y":545.9827243402959,"width":82,"height":26,"rotation":-1.359832739447365,"color":"#fb923c"},{"x":272.08165971729557,"y":443.1850895495371,"width":82,"height":26,"rotation":1.5556290787394689,"color":"#fb923c"},{"x":101.87125984739131,"y":342.6437363876637,"width":82,"height":26,"rotation":4.667677598384351,"color":"#fb923c"},{"x":255.38970880771774,"y":236.79578855681157,"width":82,"height":26,"rotation":1.7887850971606323,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":76,"y":467,"width":51,"height":32,"color":"#fb923c"},{"x":362,"y":567,"width":48,"height":32,"color":"#fb923c"},{"x":44,"y":370,"width":64,"height":32,"color":"#fb923c"},{"x":290,"y":331,"width":63,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (20,2,'[{"x":262.2806978180579,"y":545.9827243402959,"width":82,"height":26,"rotation":1.359832739447365,"color":"#fb923c"},{"x":95.91834028270443,"y":443.1850895495371,"width":82,"height":26,"rotation":-1.5556290787394689,"color":"#fb923c"},{"x":266.12874015260866,"y":342.6437363876637,"width":82,"height":26,"rotation":-4.667677598384351,"color":"#fb923c"},{"x":112.61029119228226,"y":236.79578855681157,"width":82,"height":26,"rotation":-1.7887850971606323,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":323,"y":467,"width":51,"height":32,"color":"#fb923c","rotation":0},{"x":40,"y":567,"width":48,"height":32,"color":"#fb923c","rotation":0},{"x":342,"y":370,"width":64,"height":32,"color":"#fb923c","rotation":0},{"x":97,"y":331,"width":63,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (20,3,'[{"x":104.53467498942297,"y":549.4413545873306,"width":86,"height":26,"rotation":-1.36464740588909,"color":"#fb923c"},{"x":272.53681260121823,"y":444.6491503192815,"width":86,"height":26,"rotation":1.545845616092615,"color":"#fb923c"},{"x":96.82519054347176,"y":344.0747789358557,"width":86,"height":26,"rotation":4.670544509982005,"color":"#fb923c"},{"x":257.9853392153907,"y":236.94066529001492,"width":86,"height":26,"rotation":1.7857310742767178,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":123,"y":193,"width":60,"height":32,"color":"#fb923c"},{"x":321,"y":536,"width":65,"height":32,"color":"#fb923c"},{"x":314,"y":315,"width":52,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (20,4,'[{"x":104.53467498942297,"y":549.4413545873306,"width":86,"height":26,"rotation":-1.36464740588909,"color":"#fb923c"},{"x":272.53681260121823,"y":444.6491503192815,"width":86,"height":26,"rotation":1.545845616092615,"color":"#fb923c"},{"x":96.82519054347176,"y":344.0747789358557,"width":86,"height":26,"rotation":4.670544509982005,"color":"#fb923c"},{"x":257.9853392153907,"y":236.94066529001492,"width":86,"height":26,"rotation":1.7857310742767178,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":123,"y":193,"width":60,"height":32,"color":"#fb923c"},{"x":321,"y":536,"width":65,"height":32,"color":"#fb923c"},{"x":314,"y":315,"width":52,"height":32,"color":"#fb923c"}]'::jsonb);
insert into game_private.layouts values (20,5,'[{"x":272.56483987173795,"y":540.5144569381938,"width":82,"height":26,"rotation":1.33909106358315,"color":"#fb923c"},{"x":91.00230734197498,"y":446.7151041541426,"width":82,"height":26,"rotation":-1.5823664740452463,"color":"#fb923c"},{"x":272.2066247241173,"y":345.7891566841411,"width":82,"height":26,"rotation":-4.651588477763743,"color":"#fb923c"},{"x":115.46541700476274,"y":237.29238895027737,"width":82,"height":26,"rotation":-1.7989836713507636,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":315,"y":263,"width":77,"height":32,"color":"#fb923c","rotation":0},{"x":47,"y":549,"width":74,"height":32,"color":"#fb923c","rotation":0},{"x":82,"y":323,"width":75,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (20,6,'[{"x":272.56483987173795,"y":540.5144569381938,"width":82,"height":26,"rotation":1.33909106358315,"color":"#fb923c"},{"x":91.00230734197498,"y":446.7151041541426,"width":82,"height":26,"rotation":-1.5823664740452463,"color":"#fb923c"},{"x":272.2066247241173,"y":345.7891566841411,"width":82,"height":26,"rotation":-4.651588477763743,"color":"#fb923c"},{"x":115.46541700476274,"y":237.29238895027737,"width":82,"height":26,"rotation":-1.7989836713507636,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c","rotation":0},{"x":315,"y":263,"width":77,"height":32,"color":"#fb923c","rotation":0},{"x":47,"y":549,"width":74,"height":32,"color":"#fb923c","rotation":0},{"x":82,"y":323,"width":75,"height":32,"color":"#fb923c","rotation":0}]'::jsonb);
insert into game_private.layouts values (20,7,'[{"x":94.19624082363976,"y":544.2128133610225,"width":86,"height":26,"rotation":-1.3628133751487246,"color":"#fb923c"},{"x":265.45624572645846,"y":448.17926528267816,"width":86,"height":26,"rotation":1.5725924813211576,"color":"#fb923c"},{"x":90.73508270832716,"y":346.98202162999496,"width":86,"height":26,"rotation":4.6728011717944025,"color":"#fb923c"},{"x":255.13209900880685,"y":237.43083824483773,"width":86,"height":26,"rotation":1.7954154386466206,"color":"#fb923c"},{"x":190,"y":580,"width":70,"height":32,"color":"#fb923c"},{"x":36,"y":590,"width":61,"height":32,"color":"#fb923c"},{"x":298,"y":522,"width":69,"height":32,"color":"#fb923c"}]'::jsonb);

commit;
