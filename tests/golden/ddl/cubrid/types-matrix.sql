--
-- CUBRID SQL Script
--

-- Table `type_samples`

-- DROP TABLE `type_samples`;

CREATE TABLE `type_samples` (
  `c_integer` INTEGER DEFAULT NULL,
  `c_smallint` SMALLINT DEFAULT NULL,
  `c_decimal` DECIMAL(12,2) DEFAULT NULL,
  `c_serial` SHORT NOT NULL,
  `c_bigserial` SHORT NOT NULL,
  `c_float` FLOAT DEFAULT NULL,
  `c_double` DOUBLE DEFAULT NULL,
  `c_char` CHAR(10) DEFAULT NULL,
  `c_varchar` VARCHAR(255) DEFAULT NULL,
  `c_text` SHORT DEFAULT NULL,
  `c_bytea` SHORT DEFAULT NULL,
  `c_boolean` SHORT DEFAULT NULL,
  `c_date` DATE DEFAULT NULL,
  `c_time` TIME(3) DEFAULT NULL,
  `c_time_tz` SHORT DEFAULT NULL,
  `c_interval` SHORT(6) DEFAULT NULL,
  `c_timestamp` TIMESTAMP(3) DEFAULT NULL,
  `c_timestamp_tz` SHORT DEFAULT NULL,
  `c_timestamp_wo_tz` SHORT DEFAULT NULL,
  `c_xml` SHORT DEFAULT NULL,
  `c_bit` BIT(8) DEFAULT NULL,
  `c_varbit` SHORT(8) DEFAULT NULL,
  `c_inet` SHORT DEFAULT NULL,
  `c_cidr` SHORT DEFAULT NULL,
  `c_geometry` SHORT DEFAULT NULL,
  `c_json` SHORT DEFAULT NULL,
  `c_jsonb` SHORT DEFAULT NULL,
  PRIMARY KEY (`c_serial`)
);


-- Foreign Keys 




-- Test Data

--  INSERT INTO `type_samples` (`c_integer`,`c_smallint`,`c_decimal`,`c_serial`,`c_bigserial`,`c_float`,`c_double`,`c_char`,`c_varchar`,`c_text`,`c_bytea`,`c_boolean`,`c_date`,`c_time`,`c_time_tz`,`c_interval`,`c_timestamp`,`c_timestamp_tz`,`c_timestamp_wo_tz`,`c_xml`,`c_bit`,`c_varbit`,`c_inet`,`c_cidr`,`c_geometry`,`c_json`,`c_jsonb`) VALUES
--    ('','','','','','','','','','','','','','','','','','','','','','','','','','','');