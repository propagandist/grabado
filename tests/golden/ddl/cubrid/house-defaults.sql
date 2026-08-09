--
-- CUBRID SQL Script
--

-- Table `users`

-- DROP TABLE `users`;

CREATE TABLE `users` (
  `id` SHORT NOT NULL DEFAULT uuidv7(),
  `email` SHORT NOT NULL,
  `display_name` SHORT NOT NULL,
  `is_active` SHORT NOT NULL DEFAULT true,
  `preferences` SHORT NOT NULL DEFAULT '{}'::jsonb,
  `created_at` SHORT NOT NULL DEFAULT now(),
  `updated_at` SHORT NOT NULL DEFAULT now(),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`email`)
);

-- Table `articles`

-- DROP TABLE `articles`;

CREATE TABLE `articles` (
  `id` SHORT NOT NULL DEFAULT uuidv7(),
  `author_id` SHORT NOT NULL,
  `title` SHORT NOT NULL,
  `body` SHORT DEFAULT NULL,
  `view_count` INTEGER NOT NULL DEFAULT 0,
  `price` DECIMAL(12,2) DEFAULT NULL,
  `published_on` DATE DEFAULT NULL,
  `created_at` SHORT NOT NULL DEFAULT now(),
  `updated_at` SHORT NOT NULL DEFAULT now(),
  PRIMARY KEY (`id`)
);

-- Table `article_tags`

-- DROP TABLE `article_tags`;

CREATE TABLE `article_tags` (
  `article_id` SHORT NOT NULL,
  `tag` SHORT NOT NULL,
  `created_at` SHORT NOT NULL DEFAULT now(),
  PRIMARY KEY (`article_id`, `tag`)
);


-- Foreign Keys 

ALTER TABLE `articles` ADD FOREIGN KEY (`author_id`) REFERENCES `users` (`id`);
ALTER TABLE `article_tags` ADD FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`);



-- Test Data

--  INSERT INTO `users` (`id`,`email`,`display_name`,`is_active`,`preferences`,`created_at`,`updated_at`) VALUES
--    ('','','','','','','');
--  INSERT INTO `articles` (`id`,`author_id`,`title`,`body`,`view_count`,`price`,`published_on`,`created_at`,`updated_at`) VALUES
--    ('','','','','','','','','');
--  INSERT INTO `article_tags` (`article_id`,`tag`,`created_at`) VALUES
--    ('','','');