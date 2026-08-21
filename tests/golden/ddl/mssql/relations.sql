CREATE TABLE employees (
  id int NOT NULL,
  name nvarchar(255) NOT NULL,
  manager_id int,
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);
GO

-- employees.manager_id: 直属の上長（自己参照）

CREATE TABLE projects (
  id int NOT NULL,
  title nvarchar(255) NOT NULL,
  owner_id int NOT NULL,
  team_id int,
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);
GO

CREATE TABLE teams (
  id int NOT NULL,
  name nvarchar(255) NOT NULL,
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);
GO

CREATE TABLE employee_projects (
  employee_id int NOT NULL,
  project_id int NOT NULL,
  CONSTRAINT employee_projects_pkey PRIMARY KEY (employee_id, project_id)
);
GO

ALTER TABLE employees ADD CONSTRAINT fk_employees_manager_id FOREIGN KEY (manager_id) REFERENCES employees (id);
GO

ALTER TABLE projects ADD CONSTRAINT fk_projects_owner_id FOREIGN KEY (owner_id) REFERENCES employees (id);
GO

ALTER TABLE projects ADD CONSTRAINT fk_projects_team_id FOREIGN KEY (team_id) REFERENCES teams (id);
GO

ALTER TABLE employee_projects ADD CONSTRAINT fk_employee_projects_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id);
GO

ALTER TABLE employee_projects ADD CONSTRAINT fk_employee_projects_project_id FOREIGN KEY (project_id) REFERENCES projects (id);
GO