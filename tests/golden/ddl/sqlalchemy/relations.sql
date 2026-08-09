db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - employees
# 
employees_table = sa.Table("employees", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('name', sa.Integer),
    # manager_id - 直属の上長（自己参照）
    sa.Column('manager_id', sa.Integer, sa.ForeignKey("employees.id"), nullable=True))

# Table definition - projects
# 
projects_table = sa.Table("projects", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('title', sa.Integer),
    sa.Column('owner_id', sa.Integer, sa.ForeignKey("employees.id")),
    sa.Column('team_id', sa.Integer, sa.ForeignKey("teams.id"), nullable=True))

# Table definition - teams
# 
teams_table = sa.Table("teams", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('name', sa.Integer))

# Table definition - employee_projects
# 
employee_projects_table = sa.Table("employee_projects", metadata,
    sa.Column('employee_id', sa.Integer, sa.ForeignKey("employees.id"), primary_key=True),
    sa.Column('project_id', sa.Integer, sa.ForeignKey("projects.id"), primary_key=True))


# Mapping Objects
class employees():
    def __init__(self, id, name, manager_id):
        self.id = id
        self.name = name
        self.manager_id = manager_id

    def __repr__(self):
        return "<employees('%s', '%s', '%s')>" % (self.id, self.name, self.manager_id)

class projects():
    def __init__(self, id, title, owner_id, team_id):
        self.id = id
        self.title = title
        self.owner_id = owner_id
        self.team_id = team_id

    def __repr__(self):
        return "<projects('%s', '%s', '%s', '%s')>" % (self.id, self.title, self.owner_id, self.team_id)

class teams():
    def __init__(self, id, name):
        self.id = id
        self.name = name

    def __repr__(self):
        return "<teams('%s', '%s')>" % (self.id, self.name)

class employee_projects():
    def __init__(self, employee_id, project_id):
        self.employee_id = employee_id
        self.project_id = project_id

    def __repr__(self):
        return "<employee_projects('%s', '%s')>" % (self.employee_id, self.project_id)


# Declare mappings
mapper(employees, employees_table)
mapper(projects, projects_table)
mapper(teams, teams_table)
mapper(employee_projects, employee_projects_table)

# Create a session
session = sessionmaker(bind=db_engine)