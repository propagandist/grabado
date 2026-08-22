-- grabado: postgresql の設計を sqlite 向けに変換して出力した。
--
-- **22 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   type_samples.c_integer: INTEGER (int32) -> INTEGER (int64)
--   type_samples.c_smallint: SMALLINT (int16) -> INTEGER (int64)
--   type_samples.c_decimal: NUMERIC (decimal) -> TEXT (string) / サイズが落ちた
--   type_samples.c_float: REAL (float32) -> REAL (float64)
--   type_samples.c_varchar: VARCHAR (string) -> TEXT (string) / サイズが落ちた
--   type_samples.c_boolean: BOOLEAN (boolean) -> INTEGER (int64)
--   type_samples.c_date: DATE (date) -> TEXT (string)
--   type_samples.c_time: TIME (time) -> TEXT (string) / サイズが落ちた
--   type_samples.c_time_tz: TIME WITH TIME ZONE (time_tz) -> TEXT (string)
--   type_samples.c_interval: INTERVAL (interval) -> TEXT (string) / サイズが落ちた
--   type_samples.c_timestamp: TIMESTAMPTZ (timestamp_tz) -> TEXT (string) / サイズが落ちた
--   type_samples.c_timestamp_tz: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   type_samples.c_timestamp_wo_tz: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   type_samples.c_uuid: UUID (uuid) -> TEXT (string)
--   type_samples.c_xml: XML (xml) -> TEXT (string)
--   type_samples.c_bit: BIT (other) -> TEXT (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_varbit: VARBIT (other) -> TEXT (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_inet: INET (other) -> TEXT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_cidr: CIDR (other) -> TEXT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_geometry: GEOMETRY (geometry) -> BLOB (binary)
--   type_samples.c_json: JSONB (json) -> TEXT (string)
--   type_samples.c_jsonb: JSONB (json) -> TEXT (string)

CREATE TABLE type_samples (
  c_integer INTEGER,
  c_smallint INTEGER,
  c_bigint INTEGER,
  c_decimal TEXT,
  c_serial INTEGER NOT NULL,
  c_bigserial INTEGER NOT NULL,
  c_float REAL,
  c_double REAL,
  c_char TEXT,
  c_varchar TEXT,
  c_text TEXT,
  c_bytea BLOB,
  c_boolean INTEGER,
  c_date TEXT,
  c_time TEXT,
  c_time_tz TEXT,
  c_interval TEXT,
  c_timestamp TEXT,
  c_timestamp_tz TEXT,
  c_timestamp_wo_tz TEXT,
  c_uuid TEXT,
  c_xml TEXT,
  c_bit TEXT,
  c_varbit TEXT,
  c_inet TEXT,
  c_cidr TEXT,
  c_geometry BLOB,
  c_json TEXT,
  c_jsonb TEXT,
  CONSTRAINT type_samples_pkey PRIMARY KEY (c_serial)
) STRICT;