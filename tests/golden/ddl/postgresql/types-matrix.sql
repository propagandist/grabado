CREATE TABLE type_samples (
 c_integer INTEGER,
 c_smallint SMALLINT,
 c_bigint BIGINT,
 c_decimal NUMERIC(12,2),
 c_serial BIGINT GENERATED ALWAYS AS IDENTITY,
 c_bigserial BIGINT GENERATED ALWAYS AS IDENTITY,
 c_float REAL,
 c_double DOUBLE PRECISION,
 c_char TEXT,
 c_varchar VARCHAR(255),
 c_text TEXT,
 c_bytea BYTEA,
 c_boolean BOOLEAN,
 c_date DATE,
 c_time TIME(3),
 c_time_tz TIME WITH TIME ZONE,
 c_interval INTERVAL(6),
 c_timestamp TIMESTAMPTZ(3),
 c_timestamp_tz TIMESTAMPTZ,
 c_timestamp_wo_tz TIMESTAMPTZ,
 c_uuid UUID,
 c_xml XML,
 c_bit BIT(8),
 c_varbit VARBIT(8),
 c_inet INET,
 c_cidr CIDR,
 c_geometry GEOMETRY,
 c_json JSONB,
 c_jsonb JSONB
);


ALTER TABLE type_samples ADD CONSTRAINT type_samples_pkey PRIMARY KEY (c_serial);