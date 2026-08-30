-- grabado: postgresql の設計を mssql 向けに変換して出力した。
--
-- **12 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   type_samples.c_float: REAL (float32) -> float (float64)
--   type_samples.c_char: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_text: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_bytea: BYTEA (binary) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_time_tz: TIME WITH TIME ZONE (time_tz) -> time (time)
--   type_samples.c_interval: INTERVAL (interval) -> char (string)
--   type_samples.c_bit: BIT (other) -> nvarchar (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_varbit: VARBIT (other) -> nvarchar (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_inet: INET (other) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_cidr: CIDR (other) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_json: JSONB (json) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   type_samples.c_jsonb: JSONB (json) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**

CREATE TABLE type_samples (
  c_integer int,
  c_smallint smallint,
  c_bigint bigint,
  c_decimal decimal(12,2),
  c_serial bigint NOT NULL,
  c_bigserial bigint NOT NULL,
  c_float float,
  c_double float,
  c_char nvarchar,
  c_varchar varchar(255),
  c_text nvarchar,
  c_bytea nvarchar,
  c_boolean bit,
  c_date date,
  c_time time(3),
  c_time_tz time,
  c_interval char(6),
  c_timestamp datetimeoffset(3),
  c_timestamp_tz datetimeoffset,
  c_timestamp_wo_tz datetimeoffset,
  c_uuid uniqueidentifier,
  c_xml xml,
  c_bit nvarchar(8),
  c_varbit nvarchar(8),
  c_inet nvarchar,
  c_cidr nvarchar,
  c_geometry geometry,
  c_json nvarchar,
  c_jsonb nvarchar,
  CONSTRAINT type_samples_pkey PRIMARY KEY (c_serial)
);
GO