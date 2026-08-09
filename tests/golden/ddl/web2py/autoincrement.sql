""" database class object creation (initialization) """
if request.env.web2py_runtime_gae:                  # if running on Google App Engine 
    dbOBJECT = DAL('gae')                           # connect to Google BigTable 
    session.connect(request, response, db=dbOBJECT) # and store sessions and tickets there 
else:                                               # else use a normal relational database 
    dbOBJECT = DAL("sqlite://dbOBJECT.db")

dbOBJECT.define_table("counters",
    Field("label", "integer", length=64, notnull=True, default=None),
    Field("hits", "integer", notnull=True, default=0))

""" Relations between tables (remove fields you don't need from requires) """