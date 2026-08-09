CREATE TABLE type_samples (
 c_integer INTEGER,
 c_smallint SMALLINT,
 c_decimal DECIMAL(12,2),
 c_serial SERIAL NOT NULL,
 c_bigserial BIGSERIAL NOT NULL,
 c_float FLOAT,
 c_double DOUBLE,
 c_char CHAR(10),
 c_varchar VARCHAR(255),
 c_text TEXT,
 c_bytea BYTEA,
 c_boolean BOOLEAN,
 c_date DATE,
 c_time TIME(3),
 c_time_tz TIME WITH TIME ZONE,
 c_interval INTERVAL(6),
 c_timestamp TIMESTAMP(3),
 c_timestamp_tz TIMESTAMP WITH TIME ZONE,
 c_timestamp_wo_tz TIMESTAMP WITHOUT TIME ZONE,
 c_xml XML,
 c_bit BIT(8),
 c_varbit VARBIT(8),
 c_inet INET,
 c_cidr CIDR,
 c_geometry GEOMETRY,
 c_json JSON,
 c_jsonb JSONB
);


ALTER TABLE type_samples ADD CONSTRAINT type_samples_pkey PRIMARY KEY (c_serial);