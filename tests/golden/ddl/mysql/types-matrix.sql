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
  `c_smallint` SMALLINT NULL,
  `c_decimal` DECIMAL(12,2) NULL,
  `c_serial` INTEGER NOT NULL,
  `c_bigserial` INTEGER NOT NULL,
  `c_float` FLOAT NULL,
  `c_double` DOUBLE NULL,
  `c_char` CHAR(10) NULL,
  `c_varchar` VARCHAR(255) NULL,
  `c_text` MEDIUMTEXT NULL,
  `c_bytea` INTEGER NULL,
  `c_boolean` INTEGER NULL,
  `c_date` DATE NULL,
  `c_time` TIME(3) NULL,
  `c_time_tz` INTEGER NULL,
  `c_interval` INTEGER(6) NULL,
  `c_timestamp` TIMESTAMP(3) NULL,
  `c_timestamp_tz` INTEGER NULL,
  `c_timestamp_wo_tz` INTEGER NULL,
  `c_xml` INTEGER NULL,
  `c_bit` INTEGER(8) NULL,
  `c_varbit` INTEGER(8) NULL,
  `c_inet` INTEGER NULL,
  `c_cidr` INTEGER NULL,
  `c_geometry` INTEGER NULL,
  `c_json` INTEGER NULL,
  `c_jsonb` INTEGER NULL,
  PRIMARY KEY (`c_serial`)
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

-- INSERT INTO `type_samples` (`c_integer`,`c_smallint`,`c_decimal`,`c_serial`,`c_bigserial`,`c_float`,`c_double`,`c_char`,`c_varchar`,`c_text`,`c_bytea`,`c_boolean`,`c_date`,`c_time`,`c_time_tz`,`c_interval`,`c_timestamp`,`c_timestamp_tz`,`c_timestamp_wo_tz`,`c_xml`,`c_bit`,`c_varbit`,`c_inet`,`c_cidr`,`c_geometry`,`c_json`,`c_jsonb`) VALUES
-- ('','','','','','','','','','','','','','','','','','','','','','','','','','','');