-- ---
-- Globals
-- ---

-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
-- SET FOREIGN_KEY_CHECKS=0;

-- ---
-- Table '顧客'
-- 顧客マスタ。''仮登録'' の状態も含む
-- ---

DROP TABLE IF EXISTS `顧客`;
		
CREATE TABLE `顧客` (
  `id` INTEGER NOT NULL,
  `氏名` VARCHAR(255) NOT NULL COMMENT '姓と名は分けない',
  `say "hi"` VARCHAR(255) NULL COMMENT '識別子に " が入る場合の属性エスケープ確認',
  `メモ` MEDIUMTEXT NULL COMMENT '顧客の''愛称''をここに書く',
  PRIMARY KEY (`id`)
) COMMENT '顧客マスタ。''仮登録'' の状態も含む';

-- ---
-- Foreign Keys 
-- ---


-- ---
-- Table Properties
-- ---

-- ALTER TABLE `顧客` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ---
-- Test Data
-- ---

-- INSERT INTO `顧客` (`id`,`氏名`,`say "hi"`,`メモ`) VALUES
-- ('','','','');