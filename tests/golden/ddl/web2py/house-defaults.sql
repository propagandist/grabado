""" database class object creation (initialization) """
if request.env.web2py_runtime_gae:                  # if running on Google App Engine 
    dbOBJECT = DAL('gae')                           # connect to Google BigTable 
    session.connect(request, response, db=dbOBJECT) # and store sessions and tickets there 
else:                                               # else use a normal relational database 
    dbOBJECT = DAL("sqlite://dbOBJECT.db")

dbOBJECT.define_table("users",
    Field("email", "integer", notnull=True, default=None, unique=True),
    Field("display_name", "integer", notnull=True, default=None),
    Field("is_active", "integer", notnull=True, default=true),
    Field("preferences", "integer", notnull=True, default='{}'::jsonb),
    Field("created_at", "integer", notnull=True, default=now()),
    Field("updated_at", "integer", notnull=True, default=now()))

dbOBJECT.define_table("articles",
    Field("author_id", "reference users"),
    Field("title", "integer", notnull=True, default=None),
    Field("body", "integer", default=None),
    Field("view_count", "integer", notnull=True, default=0),
    Field("price", "integer", length=12,2, default=None),
    Field("published_on", "integer", default=None),
    Field("created_at", "integer", notnull=True, default=now()),
    Field("updated_at", "integer", notnull=True, default=now()))

dbOBJECT.define_table("article_tags",
    Field("article_id", "reference articles"),
    Field("tag", "integer", notnull=True, default=None),
    Field("created_at", "integer", notnull=True, default=now()))

""" Relations between tables (remove fields you don't need from requires) """
dbOBJECT.articles.author_id.requires=IS_IN_DB( dbOBJECT, 'users.id', ' %(email)s %(display_name)s %(is_active)s %(preferences)s %(created_at)s %(updated_at)s')
dbOBJECT.article_tags.article_id.requires=IS_IN_DB( dbOBJECT, 'articles.id', ' %(author_id)s %(title)s %(body)s %(view_count)s %(price)s %(published_on)s %(created_at)s %(updated_at)s')