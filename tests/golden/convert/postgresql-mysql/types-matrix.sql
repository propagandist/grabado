-- grabado: postgresql の設計を mysql 向けに変換して出力した。
--
-- **8 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   type_samples.c_time_tz: TIME WITH TIME ZONE (time_tz) -> TIME (time)
--   type_samples.c_interval: INTERVAL (interval) -> CHAR (string)
--   type_samples.c_uuid: UUID (uuid) -> CHAR (string)
--   type_samples.c_xml: XML (xml) -> LONGTEXT (string)
--   type_samples.c_varbit: VARBIT (other) -> LONGTEXT (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_inet: INET (other) -> LONGTEXT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_cidr: CIDR (other) -> LONGTEXT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_geometry: GEOMETRY (geometry) -> LONGBLOB (binary)

CREATE TABLE type_samples (
  c_integer INT NULL,
  c_smallint SMALLINT NULL,
  c_bigint BIGINT NULL,
  c_decimal DECIMAL(12,2) NULL,
  c_serial BIGINT AUTO_INCREMENT NOT NULL,
  c_bigserial BIGINT AUTO_INCREMENT NOT NULL,
  c_float FLOAT NULL,
  c_double DOUBLE NULL,
  c_char LONGTEXT NULL,
  c_varchar VARCHAR(255) NULL,
  c_text LONGTEXT NULL,
  c_bytea LONGBLOB NULL,
  c_boolean BOOLEAN NULL,
  c_date DATE NULL,
  c_time TIME(3) NULL,
  c_time_tz TIME NULL,
  c_interval CHAR(6) NULL,
  c_timestamp TIMESTAMP(3) NULL,
  c_timestamp_tz TIMESTAMP NULL,
  c_timestamp_wo_tz TIMESTAMP NULL,
  c_uuid CHAR(36) NULL,
  c_xml LONGTEXT NULL,
  c_bit BIT(8) NULL,
  c_varbit LONGTEXT NULL,
  c_inet LONGTEXT NULL,
  c_cidr LONGTEXT NULL,
  c_geometry LONGBLOB NULL,
  c_json JSON NULL,
  c_jsonb JSON NULL,
  PRIMARY KEY (c_serial)
);