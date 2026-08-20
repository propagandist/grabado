/*
DROP TABLE "type_samples" PURGE;
-- */

-------------------------------------------------------------------------------
--            type_samples
-------------------------------------------------------------------------------

CREATE TABLE "type_samples" (
    "c_integer"                       NUMBER
  , "c_number"                        NUMBER(10)          NOT NULL
  , "c_char"                          CHAR(10)
  , "c_varchar2"                      VARCHAR2(255)
  , "c_clob"                          CLOB
  , "c_nchar"                         NCHAR(10)
  , "c_nvarchar2"                     NVARCHAR2(255)
  , "c_nclob"                         NCLOB
  , "c_date"                          DATE
  , "c_timestamp"                     TIMESTAMP(6)
  , "c_raw"                           RAW(16)
  , "c_blob"                          BLOB
  , "c_decimal"                       DECIMAL(12,2)
  , "c_float"                         FLOAT(10)
  , "c_double_precision"              DOUBLE PRECISION
  , CONSTRAINT "type_samples_pkey" PRIMARY KEY ( "c_number" )
);