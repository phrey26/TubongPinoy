begin;

create or replace function public.tp_api(p_endpoint text, p_method text, p_body jsonb, p_token text, p_guest text, p_ip text, p_replay jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; challenge jsonb; status integer; detail text; identity text; maximum integer; key text; rate_account bigint; player game_private.players;
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
    if p_endpoint='game-run' and p_method='POST' and p_body->>'game'='tumbang-preso' and p_body->>'action'='start' then
      -- Lock the account before checking eligibility so concurrent wallet writes
      -- cannot admit a new game with insufficient Juice. An admitted start is
      -- idempotent, including after its last 20 Juice bought a playable retry.
      player:=game_private.player_for_token(p_token);
      if not exists(select 1 from game_private.runs r where r.player_id=player.id and r.game='tumbang-preso'
        and r.start_id=p_body->>'requestId' and r.auth_version=player.auth_version and r.expires_at>extract(epoch from now())) then
        perform game_private.snapshot(player.id);
        select * into player from game_private.players where id=player.id;
        if player.juice<20 and not player.permanent_juice and player.unlimited_until<=extract(epoch from clock_timestamp()) then
          perform game_private.fail('You need 20 Juice to start Tumbang Preso.',409);
        end if;
      end if;
    end if;
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

commit;
