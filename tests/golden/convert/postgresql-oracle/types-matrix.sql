-- grabado: postgresql の設計を oracle 向けに変換して出力した。
--
-- **14 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   type_samples.c_integer: INTEGER (int32) -> INTEGER (int64)
--   type_samples.c_smallint: SMALLINT (int16) -> INTEGER (int64)
--   type_samples.c_float: REAL (float32) -> FLOAT (float64)
--   type_samples.c_date: DATE (date) -> DATE (timestamp)
--   type_samples.c_time: TIME (time) -> CHAR (string)
--   type_samples.c_time_tz: TIME WITH TIME ZONE (time_tz) -> CHAR (string) / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_interval: INTERVAL (interval) -> INTERVAL YEAR TO MONTH (interval) / サイズが落ちた
--   type_samples.c_timestamp: TIMESTAMPTZ (timestamp_tz) -> TIMESTAMP WITH TIME ZONE (timestamp_tz) / サイズが落ちた
--   type_samples.c_uuid: UUID (uuid) -> CHAR (string)
--   type_samples.c_bit: BIT (other) -> CLOB (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_varbit: VARBIT (other) -> CLOB (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_inet: INET (other) -> CLOB (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_cidr: CIDR (other) -> CLOB (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_geometry: GEOMETRY (geometry) -> BLOB (binary)

CREATE TABLE "type_samples" (
  "c_integer" INTEGER,
  "c_smallint" INTEGER,
  "c_bigint" INTEGER,
  "c_decimal" DECIMAL(12,2),
  "c_serial" INTEGER NOT NULL,
  "c_bigserial" INTEGER NOT NULL,
  "c_float" FLOAT,
  "c_double" BINARY_DOUBLE,
  "c_char" CLOB,
  "c_varchar" CHAR(255),
  "c_text" CLOB,
  "c_bytea" BLOB,
  "c_boolean" BOOLEAN,
  "c_date" DATE,
  "c_time" CHAR(3),
  "c_time_tz" CHAR,
  "c_interval" INTERVAL YEAR TO MONTH,
  "c_timestamp" TIMESTAMP WITH TIME ZONE,
  "c_timestamp_tz" TIMESTAMP WITH TIME ZONE,
  "c_timestamp_wo_tz" TIMESTAMP WITH TIME ZONE,
  "c_uuid" CHAR(36),
  "c_xml" XMLTYPE,
  "c_bit" CLOB,
  "c_varbit" CLOB,
  "c_inet" CLOB,
  "c_cidr" CLOB,
  "c_geometry" BLOB,
  "c_json" JSON,
  "c_jsonb" JSON,
  CONSTRAINT "type_samples_pkey" PRIMARY KEY ("c_serial")
);