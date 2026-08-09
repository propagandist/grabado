CREATE TABLE employees (
 id INTEGER NOT NULL,
 name TEXT NOT NULL,
 manager_id INTEGER/* 直属の上長（自己参照） */
);


ALTER TABLE employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
COMMENT ON COLUMN "employees"."manager_id" IS '直属の上長（自己参照）';

CREATE TABLE projects (
 id INTEGER NOT NULL,
 title TEXT NOT NULL,
 owner_id INTEGER NOT NULL,
 team_id INTEGER
);


ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

CREATE TABLE teams (
 id INTEGER NOT NULL,
 name TEXT NOT NULL
);


ALTER TABLE teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

CREATE TABLE employee_projects (
 employee_id INTEGER NOT NULL,
 project_id INTEGER NOT NULL
);


ALTER TABLE employee_projects ADD CONSTRAINT employee_projects_pkey PRIMARY KEY (employee_id, project_id);

ALTER TABLE employees ADD CONSTRAINT employees_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES employees(id);
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES employees(id);
ALTER TABLE projects ADD CONSTRAINT projects_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE employee_projects ADD CONSTRAINT employee_projects_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE employee_projects ADD CONSTRAINT employee_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);