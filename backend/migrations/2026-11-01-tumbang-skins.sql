-- Replace placeholder artwork while preserving ownership and existing prices.
INSERT INTO skins (id, name, type, price, image_url) VALUES
('skin_4', 'Guyabanos', 'Common Skin', 50, 'assets/tumbang-preso-skins-assets/slipper_guyabanos.webp'),
('skin_3', 'Sike!', 'Rare Skin', 150, 'assets/tumbang-preso-skins-assets/slipper_sike.webp'),
('skin_2', 'Gatorz', 'Epic Skin', 200, 'assets/tumbang-preso-skins-assets/slipper_gatorz.webp'),
('skin_1', 'Aldugo', 'Legendary Skin', 300, 'assets/tumbang-preso-skins-assets/slipper_aldugo.webp')
ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), image_url = VALUES(image_url);
