--
-- CUBRID SQL Script
--

-- Table `type_samples`

-- DROP TABLE `type_samples`;

CREATE TABLE `type_samples` (
  `c_integer` INTEGER,
  `c_smallint` SMALLINT,
  `c_decimal` DECIMAL(12,2),
  `c_serial` SHORT NOT NULL,
  `c_bigserial` SHORT NOT NULL,
  `c_float` FLOAT,
  `c_double` DOUBLE,
  `c_char` CHAR(10),
  `c_varchar` VARCHAR(255),
  `c_text` SHORT,
  `c_bytea` SHORT,
  `c_boolean` SHORT,
  `c_date` DATE,
  `c_time` TIME(3),
  `c_time_tz` SHORT,
  `c_interval` SHORT(6),
  `c_timestamp` TIMESTAMP(3),
  `c_timestamp_tz` SHORT,
  `c_timestamp_wo_tz` SHORT,
  `c_xml` SHORT,
  `c_bit` BIT(8),
  `c_varbit` SHORT(8),
  `c_inet` SHORT,
  `c_cidr` SHORT,
  `c_geometry` SHORT,
  `c_json` SHORT,
  `c_jsonb` SHORT,
  PRIMARY KEY (`c_serial`)
);


-- Foreign Keys 




-- Test Data

--  INSERT INTO `type_samples` (`c_integer`,`c_smallint`,`c_decimal`,`c_serial`,`c_bigserial`,`c_float`,`c_double`,`c_char`,`c_varchar`,`c_text`,`c_bytea`,`c_boolean`,`c_date`,`c_time`,`c_time_tz`,`c_interval`,`c_timestamp`,`c_timestamp_tz`,`c_timestamp_wo_tz`,`c_xml`,`c_bit`,`c_varbit`,`c_inet`,`c_cidr`,`c_geometry`,`c_json`,`c_jsonb`) VALUES
--    ('','','','','','','','','','','','','','','','','','','','','','','','','','','');