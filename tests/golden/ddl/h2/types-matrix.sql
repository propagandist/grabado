CREATE TABLE type_samples (
 c_integer INTEGER,
 c_smallint SMALLINT,
 c_tinyint TINYINT,
 c_bigint BIGINT,
 c_bigint_identity BIGINT GENERATED ALWAYS AS IDENTITY,
 c_decimal NUMERIC(12,2),
 c_float REAL,
 c_double DOUBLE PRECISION,
 c_decfloat DECFLOAT(20),
 c_char CHARACTER(10),
 c_varchar CHARACTER VARYING(255),
 c_text CHARACTER LARGE OBJECT,
 c_bytea BINARY LARGE OBJECT,
 c_varbinary BINARY VARYING(255),
 c_boolean BOOLEAN,
 c_date DATE,
 c_time TIME(3),
 c_time_tz TIME WITH TIME ZONE,
 c_timestamp_tz TIMESTAMP WITH TIME ZONE,
 c_uuid UUID,
 c_json JSON,
 c_geometry GEOMETRY
);


ALTER TABLE type_samples ADD CONSTRAINT type_samples_pkey PRIMARY KEY (c_bigint_identity);