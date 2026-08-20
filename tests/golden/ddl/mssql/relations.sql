CREATE TABLE [employees] (
  [id] int NOT NULL ,
  [name] nvarchar(255) NOT NULL ,
  [manager_id] int  -- 直属の上長（自己参照）, 
CONSTRAINT employees_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO

CREATE TABLE [projects] (
  [id] int NOT NULL ,
  [title] nvarchar(255) NOT NULL ,
  [owner_id] int NOT NULL ,
  [team_id] int , 
CONSTRAINT projects_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO

CREATE TABLE [teams] (
  [id] int NOT NULL ,
  [name] nvarchar(255) NOT NULL , 
CONSTRAINT teams_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO

CREATE TABLE [employee_projects] (
  [employee_id] int NOT NULL ,
  [project_id] int NOT NULL , 
CONSTRAINT employee_projects_pkey PRIMARY KEY ([employee_id], [project_id])
) ON [PRIMARY]
GO

ALTER TABLE [employees] ADD FOREIGN KEY (manager_id) REFERENCES [employees] ([id]);
				
ALTER TABLE [projects] ADD FOREIGN KEY (owner_id) REFERENCES [employees] ([id]);
				
ALTER TABLE [projects] ADD FOREIGN KEY (team_id) REFERENCES [teams] ([id]);
				
ALTER TABLE [employee_projects] ADD FOREIGN KEY (employee_id) REFERENCES [employees] ([id]);
				
ALTER TABLE [employee_projects] ADD FOREIGN KEY (project_id) REFERENCES [projects] ([id]);