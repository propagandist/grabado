/*
ALTER TABLE "employees" DROP CONSTRAINT "FK_employees_employees";
ALTER TABLE "projects" DROP CONSTRAINT "FK_projects_employees";
ALTER TABLE "projects" DROP CONSTRAINT "FK_projects_teams";
ALTER TABLE "employee_projects" DROP CONSTRAINT "FK_oyee_projects_employees";
ALTER TABLE "employee_projects" DROP CONSTRAINT "FK_oyee_projects_projects";
DROP TABLE "employees" PURGE;
DROP TABLE "projects" PURGE;
DROP TABLE "teams" PURGE;
DROP TABLE "employee_projects" PURGE;
-- */

-------------------------------------------------------------------------------
--            employees
-------------------------------------------------------------------------------

CREATE TABLE "employees" (
    "id"                              NUMBER(10)          NOT NULL
  , "name"                            VARCHAR2(255)       NOT NULL
  , "manager_id"                      NUMBER(10)
  , CONSTRAINT "employees_pkey" PRIMARY KEY ( "id" )
);

COMMENT ON COLUMN "employees"."manager_id"                      IS '直属の上長（自己参照）';

-------------------------------------------------------------------------------
--            projects
-------------------------------------------------------------------------------

CREATE TABLE "projects" (
    "id"                              NUMBER(10)          NOT NULL
  , "title"                           VARCHAR2(255)       NOT NULL
  , "owner_id"                        NUMBER(10)          NOT NULL
  , "team_id"                         NUMBER(10)
  , CONSTRAINT "projects_pkey" PRIMARY KEY ( "id" )
);


-------------------------------------------------------------------------------
--            teams
-------------------------------------------------------------------------------

CREATE TABLE "teams" (
    "id"                              NUMBER(10)          NOT NULL
  , "name"                            VARCHAR2(255)       NOT NULL
  , CONSTRAINT "teams_pkey" PRIMARY KEY ( "id" )
);


-------------------------------------------------------------------------------
--            employee_projects
-------------------------------------------------------------------------------

CREATE TABLE "employee_projects" (
    "employee_id"                     NUMBER(10)          NOT NULL
  , "project_id"                      NUMBER(10)          NOT NULL
  , CONSTRAINT "employee_projects_pkey" PRIMARY KEY ( "employee_id", "project_id" )
);


-------------------------------------------------------------------------------

ALTER TABLE "employees" ADD CONSTRAINT "FK_employees_employees" FOREIGN KEY ( "manager_id" ) REFERENCES "employees" ( "id" );
ALTER TABLE "projects" ADD CONSTRAINT "FK_projects_employees" FOREIGN KEY ( "owner_id" ) REFERENCES "employees" ( "id" );
ALTER TABLE "projects" ADD CONSTRAINT "FK_projects_teams" FOREIGN KEY ( "team_id" ) REFERENCES "teams" ( "id" );
ALTER TABLE "employee_projects" ADD CONSTRAINT "FK_oyee_projects_employees" FOREIGN KEY ( "employee_id" ) REFERENCES "employees" ( "id" );
ALTER TABLE "employee_projects" ADD CONSTRAINT "FK_oyee_projects_projects" FOREIGN KEY ( "project_id" ) REFERENCES "projects" ( "id" );