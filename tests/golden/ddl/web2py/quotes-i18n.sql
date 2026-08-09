""" database class object creation (initialization) """
if request.env.web2py_runtime_gae:                  # if running on Google App Engine 
    dbOBJECT = DAL('gae')                           # connect to Google BigTable 
    session.connect(request, response, db=dbOBJECT) # and store sessions and tickets there 
else:                                               # else use a normal relational database 
    dbOBJECT = DAL("sqlite://dbOBJECT.db")

dbOBJECT.define_table("顧客",
    Field("氏名", "integer", notnull=True, default=None),
    Field("say "hi"", "integer", default=None),
    Field("メモ", "integer", default=None))

""" Relations between tables (remove fields you don't need from requires) """