CREATE TABLE 'employees' (
'id' INTEGER NOT NULL  PRIMARY KEY,
'name' TEXT NOT NULL ,
'manager_id' INTEGER REFERENCES 'employees' ('id')
);

CREATE TABLE 'projects' (
'id' INTEGER NOT NULL  PRIMARY KEY,
'title' TEXT NOT NULL ,
'owner_id' INTEGER NOT NULL  REFERENCES 'employees' ('id'),
'team_id' INTEGER REFERENCES 'teams' ('id')
);

CREATE TABLE 'teams' (
'id' INTEGER NOT NULL  PRIMARY KEY,
'name' TEXT NOT NULL 
);

CREATE TABLE 'employee_projects' (
'employee_id' INTEGER NOT NULL  REFERENCES 'employees' ('id'),
'project_id' INTEGER NOT NULL  REFERENCES 'projects' ('id'),
UNIQUE (employee_id, project_id)
);