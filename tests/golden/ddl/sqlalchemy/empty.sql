db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()



# Mapping Objects

# Declare mappings

# Create a session
session = sessionmaker(bind=db_engine)