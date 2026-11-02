# Permanent skins and rotating shop listings

A purchase grants a permanent skin ID in `user_skins`. The `skins.active` flag controls only shop visibility and new purchases. Inventory and equipment include inactive owned skins. The skin foreign key prevents deleting a skin that someone owns.

All eight current collectible IDs are permanent: `skin_4` (Guyabanos), `skin_3` (Sike!), `skin_2` (Gatorz), `skin_1` (Aldugo), `shooter_8ball`, `shooter_golf`, `shooter_jupiter`, `shooter_steel_ball`. Starter IDs are permanent too. Never repurpose an old ID for a new season.

`backend/customization.php` and `src/app/core/services/customization.ts` are permanent archives, not seasonal shop lists. Keep retired entries, artwork, generated audio, sprite atlases and renderers shipped. `SKIN_EFFECTS` binds visual/audio identity to purchased, equipped IDs; common and rare skins retain their original standard effects/audio. Catalog availability is not part of these checks.

To release a new set:

1. Append new unique IDs and their assets to both permanent archives, register any effect identity and renderer/audio, and add database rows via an additive migration. Do not replace old archive entries or delete old assets.
2. Run `php backend/bin/rotate-skin-catalog.php ID1 ID2 ...` with the complete desired shop list. The command validates IDs and updates availability in one transaction. `--empty` closes all skin listings. It never edits ownership, equipment, prices or balances.
3. Returning an archived ID to this list relists the same skin; prior owners still own it. Current sessions fetch the updated catalog when the shop reloads, and purchases always check server availability.

No rotation is applied as part of this implementation; the current shop selection remains available.
