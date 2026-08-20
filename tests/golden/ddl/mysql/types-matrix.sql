-- ---
-- Globals
-- ---

-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
-- SET FOREIGN_KEY_CHECKS=0;

-- ---
-- Table 'type_samples'
-- 
-- ---

DROP TABLE IF EXISTS `type_samples`;
		
CREATE TABLE `type_samples` (
  `c_integer` INTEGER NULL,
  `c_tinyint` TINYINT NULL,
  `c_smallint` SMALLINT NULL,
  `c_mediumint` MEDIUMINT NULL,
  `c_int` INT NOT NULL,
  `c_bigint` BIGINT NULL,
  `c_decimal` DECIMAL(12,2) NULL,
  `c_float` FLOAT NULL,
  `c_double` DOUBLE NULL,
  `c_char` CHAR(10) NULL,
  `c_varchar` VARCHAR(255) NULL,
  `c_mediumtext` MEDIUMTEXT NULL,
  `c_binary` BINARY(16) NULL,
  `c_varbinary` VARBINARY(255) NULL,
  `c_blob` BLOB NULL,
  `c_date` DATE NULL,
  `c_time` TIME NULL,
  `c_datetime` DATETIME NULL,
  `c_year` YEAR NULL,
  `c_timestamp` TIMESTAMP NULL,
  `c_enum` ENUM('draft','published') NULL,
  `c_set` SET('a','b') NULL,
  `c_bit` bit NULL,
  PRIMARY KEY (`c_int`)
);

-- ---
-- Foreign Keys 
-- ---


-- ---
-- Table Properties
-- ---

-- ALTER TABLE `type_samples` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ---
-- Test Data
-- ---

-- INSERT INTO `type_samples` (`c_integer`,`c_tinyint`,`c_smallint`,`c_mediumint`,`c_int`,`c_bigint`,`c_decimal`,`c_float`,`c_double`,`c_char`,`c_varchar`,`c_mediumtext`,`c_binary`,`c_varbinary`,`c_blob`,`c_date`,`c_time`,`c_datetime`,`c_year`,`c_timestamp`,`c_enum`,`c_set`,`c_bit`) VALUES
-- ('','','','','','','','','','','','','','','','','','','','','','','');