PRAGMA foreign_keys = ON;

CREATE TABLE employees (
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  manager_id INTEGER,
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT fk_employees_manager_id FOREIGN KEY (manager_id) REFERENCES employees (id)
) STRICT;

-- employees.manager_id: 直属の上長（自己参照）

CREATE TABLE projects (
  id INTEGER NOT NULL,
  title TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  team_id INTEGER,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT fk_projects_owner_id FOREIGN KEY (owner_id) REFERENCES employees (id),
  CONSTRAINT fk_projects_team_id FOREIGN KEY (team_id) REFERENCES teams (id)
) STRICT;

CREATE TABLE teams (
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT teams_pkey PRIMARY KEY (id)
) STRICT;

CREATE TABLE employee_projects (
  employee_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  CONSTRAINT employee_projects_pkey PRIMARY KEY (employee_id, project_id),
  CONSTRAINT fk_employee_projects_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_employee_projects_project_id FOREIGN KEY (project_id) REFERENCES projects (id)
) STRICT;