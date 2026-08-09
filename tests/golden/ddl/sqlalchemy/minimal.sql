db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - things
# 
things_table = sa.Table("things", metadata,
    sa.Column('id', sa.Integer))


# Mapping Objects
class things():
    def __init__(self, id):
        self.id = id

    def __repr__(self):
        return "<things('%s')>" % (self.id)


# Declare mappings
mapper(things, things_table)

# Create a session
session = sessionmaker(bind=db_engine)