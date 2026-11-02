<?php
declare(strict_types=1);

/** Replace shop availability only. Ownership, equipment and permanent definitions stay intact. */
function rotate_skin_catalog(PDO $db, array $ids): void
{
    $known = array_column(collectible_game_skins(), 'id');
    foreach ($ids as $id) {
        if (!is_string($id) || !in_array($id, $known, true)) {
            throw new InvalidArgumentException('Every listing must have a permanent registered skin ID.');
        }
    }
    $db->beginTransaction();
    try {
        $existing = $db->query('SELECT id FROM skins FOR UPDATE')->fetchAll(PDO::FETCH_COLUMN);
        if (array_diff($ids, $existing)) throw new InvalidArgumentException('Seed new skins before rotating the catalog.');
        $db->exec('UPDATE skins SET active = 0');
        $activate = $db->prepare('UPDATE skins SET active = 1 WHERE id = ?');
        foreach (array_unique($ids) as $id) $activate->execute([$id]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
