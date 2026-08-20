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
  `id` CHAR(36) NOT NULL DEFAULT 'UUID()',
  `email` VARCHAR(255) NOT NULL COMMENT 'ログイン用メールアドレス',
  `display_name` VARCHAR(255) NOT NULL,
  `is_active` bit NOT NULL DEFAULT 1,
  `preferences` MEDIUMTEXT NOT NULL COMMENT 'UI 設定などの任意項目',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`email`)
) COMMENT 'ユーザー';

-- ---
-- Table 'articles'
-- 記事
-- ---

DROP TABLE IF EXISTS `articles`;
		
CREATE TABLE `articles` (
  `id` CHAR(36) NOT NULL DEFAULT 'UUID()',
  `author_id` CHAR(36) NOT NULL COMMENT '執筆者 (users.id)',
  `title` VARCHAR(255) NOT NULL,
  `body` MEDIUMTEXT NULL,
  `view_count` INTEGER NOT NULL DEFAULT 0,
  `price` DECIMAL(12,2) NULL COMMENT '有料記事の価格。浮動小数ではなく decimal を使う',
  `published_on` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) COMMENT '記事';

-- ---
-- Table 'article_tags'
-- 記事とタグの対応
-- ---

DROP TABLE IF EXISTS `article_tags`;
		
CREATE TABLE `article_tags` (
  `article_id` CHAR(36) NOT NULL,
  `tag` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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