-- Additive migration. Legacy browser-reported scores are retained in game_high_scores,
-- but only the new server-verified table participates in rankings.
CREATE TABLE IF NOT EXISTS verified_game_high_scores (
    user_id INT UNSIGNED NOT NULL,
    game VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    points INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, game),
    INDEX idx_verified_ranking (game, points, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One current run per account/game bounds storage and serializes competing tabs.
CREATE TABLE IF NOT EXISTS game_runs (
    user_id INT UNSIGNED NOT NULL,
    game VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    run_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    start_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    auth_version BIGINT UNSIGNED NOT NULL,
    sequence INT UNSIGNED NOT NULL DEFAULT 0,
    state JSON NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    last_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, game),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
