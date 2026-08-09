""" database class object creation (initialization) """
if request.env.web2py_runtime_gae:                  # if running on Google App Engine 
    dbOBJECT = DAL('gae')                           # connect to Google BigTable 
    session.connect(request, response, db=dbOBJECT) # and store sessions and tickets there 
else:                                               # else use a normal relational database 
    dbOBJECT = DAL("sqlite://dbOBJECT.db")

dbOBJECT.define_table("type_samples",
    Field("c_integer", "integer", default=None),
    Field("c_smallint", "integer", default=None),
    Field("c_decimal", "integer", length=12,2, default=None),
    Field("c_serial", "integer", notnull=True, default=None),
    Field("c_bigserial", "integer", notnull=True, default=None),
    Field("c_float", "integer", default=None),
    Field("c_double", "double", default=None),
    Field("c_char", "integer", length=10, default=None),
    Field("c_varchar", "integer", length=255, default=None),
    Field("c_text", "integer", default=None),
    Field("c_bytea", "integer", default=None),
    Field("c_boolean", "integer", default=None),
    Field("c_date", "integer", default=None),
    Field("c_time", "integer", length=3, default=None),
    Field("c_time_tz", "integer", default=None),
    Field("c_interval", "integer", length=6, default=None),
    Field("c_timestamp", "integer", length=3, default=None),
    Field("c_timestamp_tz", "integer", default=None),
    Field("c_timestamp_wo_tz", "integer", default=None),
    Field("c_xml", "integer", default=None),
    Field("c_bit", "integer", length=8, default=None),
    Field("c_varbit", "integer", length=8, default=None),
    Field("c_inet", "integer", default=None),
    Field("c_cidr", "integer", default=None),
    Field("c_geometry", "integer", default=None),
    Field("c_json", "integer", default=None),
    Field("c_jsonb", "integer", default=None))

""" Relations between tables (remove fields you don't need from requires) """