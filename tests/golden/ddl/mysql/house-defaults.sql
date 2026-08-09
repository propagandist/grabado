-- ---
-- Globals
-- ---

-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
-- SET FOREIGN_KEY_CHECKS=0;

-- ---
-- Table 'users'
-- ユーザー
-- ---

DROP TABLE IF EXISTS `users`;
		
CREATE TABLE `users` (
  `id` INTEGER NOT NULL DEFAULT uuidv7(),
  `email` MEDIUMTEXT NOT NULL COMMENT 'ログイン用メールアドレス',
  `display_name` MEDIUMTEXT NOT NULL,
  `is_active` INTEGER NOT NULL DEFAULT true,
  `preferences` INTEGER NOT NULL DEFAULT '{}'::jsonb COMMENT 'UI 設定などの任意項目',
  `created_at` INTEGER NOT NULL DEFAULT now(),
  `updated_at` INTEGER NOT NULL DEFAULT now(),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`email`)
) COMMENT 'ユーザー';

-- ---
-- Table 'articles'
-- 記事
-- ---

DROP TABLE IF EXISTS `articles`;
		
CREATE TABLE `articles` (
  `id` INTEGER NOT NULL DEFAULT uuidv7(),
  `author_id` INTEGER NOT NULL COMMENT '執筆者 (users.id)',
  `title` MEDIUMTEXT NOT NULL,
  `body` MEDIUMTEXT NULL DEFAULT NULL,
  `view_count` INTEGER NOT NULL DEFAULT 0,
  `price` DECIMAL(12,2) NULL DEFAULT NULL COMMENT '有料記事の価格。money ではなく numeric を使う',
  `published_on` DATE NULL DEFAULT NULL,
  `created_at` INTEGER NOT NULL DEFAULT now(),
  `updated_at` INTEGER NOT NULL DEFAULT now(),
  PRIMARY KEY (`id`)
) COMMENT '記事';

-- ---
-- Table 'article_tags'
-- 記事とタグの対応
-- ---

DROP TABLE IF EXISTS `article_tags`;
		
CREATE TABLE `article_tags` (
  `article_id` INTEGER NOT NULL,
  `tag` MEDIUMTEXT NOT NULL,
  `created_at` INTEGER NOT NULL DEFAULT now(),
  PRIMARY KEY (`article_id`, `tag`)
) COMMENT '記事とタグの対応';

-- ---
-- Foreign Keys 
-- ---

ALTER TABLE `articles` ADD FOREIGN KEY (author_id) REFERENCES `users` (`id`);
ALTER TABLE `article_tags` ADD FOREIGN KEY (article_id) REFERENCES `articles` (`id`);

-- ---
-- Table Properties
-- ---

-- ALTER TABLE `users` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
-- ALTER TABLE `articles` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
-- ALTER TABLE `article_tags` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ---
-- Test Data
-- ---

-- INSERT INTO `users` (`id`,`email`,`display_name`,`is_active`,`preferences`,`created_at`,`updated_at`) VALUES
-- ('','','','','','','');
-- INSERT INTO `articles` (`id`,`author_id`,`title`,`body`,`view_count`,`price`,`published_on`,`created_at`,`updated_at`) VALUES
-- ('','','','','','','','','');
-- INSERT INTO `article_tags` (`article_id`,`tag`,`created_at`) VALUES
-- ('','','');