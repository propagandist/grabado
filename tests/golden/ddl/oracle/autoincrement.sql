/*
DROP TABLE "counters" PURGE;
DROP SEQUENCE "SQ_counters";
-- */

-------------------------------------------------------------------------------
--            counters
-------------------------------------------------------------------------------

CREATE TABLE "counters" (
    "id"                              NUMBER              NOT NULL
  , "label"                           INTEGER(64)         NOT NULL
  , "hits"                            NUMBER              DEFAULT 0              NOT NULL
  , CONSTRAINT "counters_pkey" PRIMARY KEY ( "id" )
);


CREATE SEQUENCE "SQ_counters";

CREATE OR REPLACE TRIGGER "TG_counters_BI"
    BEFORE INSERT ON "counters"
    FOR EACH ROW
BEGIN
    if :NEW."id" is NULL then
        :NEW."id" := "SQ_counters".nextVal;
    end if;
END;
/

SHOW ERRORS;