-- Add purchasable shooters without changing existing ownership or prices.
INSERT INTO skins (id, name, type, price, image_url) VALUES
('shooter_8ball', '8ball', 'Common Skin', 50, 'assets/jolens-blast-skin-assets/marble_skin_8ball.webp'),
('shooter_golf', 'Golf', 'Rare Skin', 150, 'assets/jolens-blast-skin-assets/marble_skin_golf.webp'),
('shooter_jupiter', 'Jupiter', 'Epic Skin', 200, 'assets/jolens-blast-skin-assets/marble_skin_jupiter.webp'),
('shooter_steel_ball', 'Steel Ball', 'Legendary Skin', 500, 'assets/jolens-blast-skin-assets/marble_skin_steel_ball.webp')
ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), image_url = VALUES(image_url);
