<?php
declare(strict_types=1);
// One-time transfer. This reads MAMP and writes a private SQL file; never prints data.
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
$path = $argv[1] ?? '';
if ($path === '' || is_file($path)) throw new RuntimeException('Provide a new private output-file path.');
$db = database();
$db->beginTransaction();
$tables = [];
foreach (['users','account_state','account_security','user_profiles','user_skins','wallet_operations',
          'game_tutorials','verified_game_high_scores','game_high_scores','game_runs','skins'] as $name) {
    $tables[$name] = $db->query('SELECT * FROM ' . $name)->fetchAll();
}
$db->commit();
$quote = static fn($s) => "'" . str_replace("'", "''", (string)$s) . "'";
$byId = static function ($rows, $key) { $out=[]; foreach ($rows as $row) $out[$row[$key]]=$row; return $out; };
$profiles=$byId($tables['user_profiles'],'user_id'); $states=$byId($tables['account_state'],'user_id'); $security=$byId($tables['account_security'],'user_id');
$sql="begin;\nDO \$\$ begin if exists(select 1 from game_private.players) then raise exception 'Import requires an empty player table; refusing to overwrite cloud accounts.'; end if; end \$\$;\n";
foreach ($tables['users'] as $u) {
    $id=(int)$u['id']; $s=$states[$id]??[]; $p=$profiles[$id]??[];
    $values=[$id,$quote($u['username']),$quote(str_replace('$2y$', '$2a$', $u['password_hash'])),$quote($p['display_name']??$u['username']),$quote($p['avatar_id']??'sunny'),
      $quote($p['tumbang_skin']??'slipper_pink'),$quote($p['jolens_skin']??'shooter_chrome'),(int)$u['tansans'],(int)$u['juice'],
      (int)($s['unlimited_until']??0),!empty($s['permanent_juice'])?'true':'false',(int)($s['juice_refill_at']??0),(int)($s['version']??0),
      (int)($security[$id]['version']??0),$quote($u['created_at'])];
    $sql.='insert into game_private.players(id,username,password_hash,display_name,avatar_id,tumbang_skin,jolens_skin,tansans,juice,unlimited_until,permanent_juice,refill_at,version,auth_version,created_at) overriding system value values('.implode(',',$values).");\n";
}
foreach ($tables['skins'] as $s) {
    $sql.='update game_private.skins set price='.(int)$s['price'].',active='.(!empty($s['active'])?'true':'false').' where id='.$quote($s['id']).";\n";
}
foreach ($tables['user_skins'] as $s) $sql.='insert into game_private.owned_skins values('.(int)$s['user_id'].','.$quote($s['skin_id']).");\n";
foreach ($tables['game_tutorials'] as $s) $sql.='insert into game_private.tutorials values('.(int)$s['user_id'].','.$quote($s['game']).");\n";
foreach ($tables['verified_game_high_scores'] as $s) $sql.='insert into game_private.scores values('.(int)$s['user_id'].','.$quote($s['game']).','.(int)$s['points'].");\n";
foreach ($tables['wallet_operations'] as $w) $sql.='insert into game_private.wallet_operations values('.implode(',',[(int)$w['user_id'],$quote($w['request_id']),$quote($w['request_hash']),$quote($w['action']),(int)$w['tansans_delta'],(int)$w['juice_delta'],$quote($w['created_at'])]).");\n";
foreach ($tables['game_high_scores'] as $s) $sql.='insert into game_private.legacy_scores values('.(int)$s['user_id'].','.$quote($s['game']).','.(int)$s['points'].");\n";
foreach ($tables['game_runs'] as $s) $sql.='insert into game_private.legacy_runs values('.(int)$s['user_id'].','.$quote($s['game']).','.$quote(json_encode($s,JSON_THROW_ON_ERROR))."::jsonb);\n";
$sql.="select setval(pg_get_serial_sequence('game_private.players','id'),greatest(coalesce((select max(id) from game_private.players),0),1),exists(select 1 from game_private.players));\ncommit;\n";
$old=umask(0077); file_put_contents($path,$sql); umask($old);
echo count($tables['users'])." accounts exported privately; local data unchanged.\n";
