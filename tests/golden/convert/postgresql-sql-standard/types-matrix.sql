-- grabado: postgresql の設計を sql-standard 向けに変換して出力した。
--
-- **6 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   type_samples.c_uuid: UUID (uuid) -> CHARACTER (string)
--   type_samples.c_bit: BIT (other) -> CHARACTER LARGE OBJECT (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_varbit: VARBIT (other) -> CHARACTER LARGE OBJECT (string) / 写せる型が無いので既定型に置いた / サイズが落ちた
--   type_samples.c_inet: INET (other) -> CHARACTER LARGE OBJECT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_cidr: CIDR (other) -> CHARACTER LARGE OBJECT (string) / 写せる型が無いので既定型に置いた
--   type_samples.c_geometry: GEOMETRY (geometry) -> BINARY LARGE OBJECT (binary)

CREATE TABLE type_samples (
 c_integer INTEGER,
 c_smallint SMALLINT,
 c_bigint BIGINT,
 c_decimal NUMERIC(12,2),
 c_serial BIGINT GENERATED ALWAYS AS IDENTITY,
 c_bigserial BIGINT GENERATED ALWAYS AS IDENTITY,
 c_float REAL,
 c_double DOUBLE PRECISION,
 c_char CHARACTER LARGE OBJECT,
 c_varchar CHARACTER VARYING(255),
 c_text CHARACTER LARGE OBJECT,
 c_bytea BINARY LARGE OBJECT,
 c_boolean BOOLEAN,
 c_date DATE,
 c_time TIME(3),
 c_time_tz TIME WITH TIME ZONE,
 c_interval INTERVAL(6),
 c_timestamp TIMESTAMP WITH TIME ZONE(3),
 c_timestamp_tz TIMESTAMP WITH TIME ZONE,
 c_timestamp_wo_tz TIMESTAMP WITH TIME ZONE,
 c_uuid CHARACTER(36),
 c_xml XML,
 c_bit CHARACTER LARGE OBJECT,
 c_varbit CHARACTER LARGE OBJECT,
 c_inet CHARACTER LARGE OBJECT,
 c_cidr CHARACTER LARGE OBJECT,
 c_geometry BINARY LARGE OBJECT,
 c_json JSON,
 c_jsonb JSON
);


ALTER TABLE type_samples ADD CONSTRAINT type_samples_pkey PRIMARY KEY (c_serial);