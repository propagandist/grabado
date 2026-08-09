-- ---
-- Globals
-- ---

-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
-- SET FOREIGN_KEY_CHECKS=0;

-- ---
-- Table 'counters'
-- 
-- ---

DROP TABLE IF EXISTS `counters`;
		
CREATE TABLE `counters` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `label` VARCHAR(64) NOT NULL,
  `hits` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

-- ---
-- Foreign Keys 
-- ---


-- ---
-- Table Properties
-- ---

-- ALTER TABLE `counters` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ---
-- Test Data
-- ---

-- INSERT INTO `counters` (`id`,`label`,`hits`) VALUES
-- ('','','');