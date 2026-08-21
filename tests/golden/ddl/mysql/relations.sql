CREATE TABLE employees (
  id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  manager_id INT NULL COMMENT '直属の上長（自己参照）',
  PRIMARY KEY (id)
);

CREATE TABLE projects (
  id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  owner_id INT NOT NULL,
  team_id INT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE teams (
  id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE employee_projects (
  employee_id INT NOT NULL,
  project_id INT NOT NULL,
  PRIMARY KEY (employee_id, project_id)
);

ALTER TABLE employees ADD CONSTRAINT fk_employees_manager_id FOREIGN KEY (manager_id) REFERENCES employees (id);
ALTER TABLE projects ADD CONSTRAINT fk_projects_owner_id FOREIGN KEY (owner_id) REFERENCES employees (id);
ALTER TABLE projects ADD CONSTRAINT fk_projects_team_id FOREIGN KEY (team_id) REFERENCES teams (id);
ALTER TABLE employee_projects ADD CONSTRAINT fk_employee_projects_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id);
ALTER TABLE employee_projects ADD CONSTRAINT fk_employee_projects_project_id FOREIGN KEY (project_id) REFERENCES projects (id);