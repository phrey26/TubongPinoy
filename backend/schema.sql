-- Select tubongpinoy_db in phpMyAdmin, then run this entire file in the SQL tab.
-- Existing users and balances are preserved.
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    tansans INT UNSIGNED NOT NULL DEFAULT 0,
    juice TINYINT UNSIGNED NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    CONSTRAINT chk_users_juice CHECK (juice <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update the default on existing installations without changing saved balances.
ALTER TABLE users ALTER COLUMN tansans SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL DEFAULT 1,
    expires_at BIGINT UNSIGNED NOT NULL,
    INDEX idx_rate_limit_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_state (
    user_id INT UNSIGNED PRIMARY KEY,
    unlimited_until BIGINT UNSIGNED NOT NULL DEFAULT 0,
    permanent_juice BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS skins (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL,
    price INT UNSIGNED NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO skins (id, name, type, price, image_url) VALUES
('skin_1', 'Dragon Armor', 'Legendary Skin', 300, 'assets/icons/customization.svg'),
('skin_2', 'Shadow Ninja', 'Epic Skin', 200, 'assets/icons/customization.svg'),
('skin_3', 'Cyber Suit', 'Rare Skin', 150, 'assets/icons/customization.svg'),
('skin_4', 'Classic Outfit', 'Common Skin', 50, 'assets/icons/customization.svg');

CREATE TABLE IF NOT EXISTS user_skins (
    user_id INT UNSIGNED NOT NULL,
    skin_id VARCHAR(50) NOT NULL,
    purchased_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, skin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skin_id) REFERENCES skins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_operations (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    action VARCHAR(100) NOT NULL,
    tansans_delta INT NOT NULL,
    juice_delta INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
