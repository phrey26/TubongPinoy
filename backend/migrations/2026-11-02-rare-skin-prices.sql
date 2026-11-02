-- Lower current rare skin prices for future purchases.
UPDATE skins SET price = 100 WHERE id IN ('skin_3', 'shooter_golf');
