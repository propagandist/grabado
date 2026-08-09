""" database class object creation (initialization) """
if request.env.web2py_runtime_gae:                  # if running on Google App Engine 
    dbOBJECT = DAL('gae')                           # connect to Google BigTable 
    session.connect(request, response, db=dbOBJECT) # and store sessions and tickets there 
else:                                               # else use a normal relational database 
    dbOBJECT = DAL("sqlite://dbOBJECT.db")

dbOBJECT.define_table("teams",
    Field("name", "integer", notnull=True, default=None))

dbOBJECT.define_table("employees",
    Field("name", "integer", notnull=True, default=None),
    Field("manager_id", "reference employees"))

dbOBJECT.define_table("projects",
    Field("title", "integer", notnull=True, default=None),
    Field("owner_id", "reference employees"),
    Field("team_id", "reference teams"))

dbOBJECT.define_table("employee_projects",
    Field("employee_id", "reference employees"),
    Field("project_id", "reference projects"))

""" Relations between tables (remove fields you don't need from requires) """
dbOBJECT.employees.manager_id.requires=IS_IN_DB( dbOBJECT, 'employees.id', ' %(name)s %(manager_id)s')
dbOBJECT.projects.owner_id.requires=IS_IN_DB( dbOBJECT, 'employees.id', ' %(name)s %(manager_id)s')
dbOBJECT.projects.team_id.requires=IS_IN_DB( dbOBJECT, 'teams.id', ' %(name)s')
dbOBJECT.employee_projects.employee_id.requires=IS_IN_DB( dbOBJECT, 'employees.id', ' %(name)s %(manager_id)s')
dbOBJECT.employee_projects.project_id.requires=IS_IN_DB( dbOBJECT, 'projects.id', ' %(title)s %(owner_id)s %(team_id)s')