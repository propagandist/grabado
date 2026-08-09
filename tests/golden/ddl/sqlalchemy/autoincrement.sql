db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - counters
# 
counters_table = sa.Table("counters", metadata,
    sa.Column('id', sa.Integer, autoincrement=True, primary_key=True),
    sa.Column('label', sa.Integer),
    sa.Column('hits', sa.Integer))


# Mapping Objects
class counters():
    def __init__(self, id, label, hits):
        self.id = id
        self.label = label
        self.hits = hits

    def __repr__(self):
        return "<counters('%s', '%s', '%s')>" % (self.id, self.label, self.hits)


# Declare mappings
mapper(counters, counters_table)

# Create a session
session = sessionmaker(bind=db_engine)