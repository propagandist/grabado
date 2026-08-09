/*
DROP TABLE "type_samples" PURGE;
-- */

-------------------------------------------------------------------------------
--            type_samples
-------------------------------------------------------------------------------

CREATE TABLE "type_samples" (
    "c_integer"                       NUMBER
  , "c_smallint"                      NUMBER
  , "c_decimal"                       DECIMAL(12,2)
  , "c_serial"                        INTEGER             NOT NULL
  , "c_bigserial"                     INTEGER             NOT NULL
  , "c_float"                         FLOAT
  , "c_double"                        INTEGER
  , "c_char"                          CHAR(10)
  , "c_varchar"                       INTEGER(255)
  , "c_text"                          NCLOB
  , "c_bytea"                         INTEGER
  , "c_boolean"                       INTEGER
  , "c_date"                          DATE
  , "c_time"                          INTEGER(3)
  , "c_time_tz"                       INTEGER
  , "c_interval"                      NUMBER(6)
  , "c_timestamp"                     TIMESTAMP(3)
  , "c_timestamp_tz"                  INTEGER
  , "c_timestamp_wo_tz"               INTEGER
  , "c_xml"                           INTEGER
  , "c_bit"                           INTEGER(8)
  , "c_varbit"                        INTEGER(8)
  , "c_inet"                          INTEGER
  , "c_cidr"                          INTEGER
  , "c_geometry"                      INTEGER
  , "c_json"                          INTEGER
  , "c_jsonb"                         INTEGER
  , CONSTRAINT "type_samples_pkey" PRIMARY KEY ( "c_serial" )
);