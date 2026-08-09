db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - type_samples
# 
type_samples_table = sa.Table("type_samples", metadata,
    sa.Column('c_integer', sa.Integer, nullable=True),
    sa.Column('c_smallint', sa.Integer, nullable=True),
    sa.Column('c_decimal', sa.Integer, nullable=True),
    sa.Column('c_serial', sa.Integer, primary_key=True),
    sa.Column('c_bigserial', sa.Integer),
    sa.Column('c_float', sa.Integer, nullable=True),
    sa.Column('c_double', sa.Numeric, nullable=True),
    sa.Column('c_char', sa.Integer, nullable=True),
    sa.Column('c_varchar', sa.Integer, nullable=True),
    sa.Column('c_text', sa.Integer, nullable=True),
    sa.Column('c_bytea', sa.Integer, nullable=True),
    sa.Column('c_boolean', sa.Integer, nullable=True),
    sa.Column('c_date', sa.Integer, nullable=True),
    sa.Column('c_time', sa.Integer, nullable=True),
    sa.Column('c_time_tz', sa.Integer, nullable=True),
    sa.Column('c_interval', sa.Integer, nullable=True),
    sa.Column('c_timestamp', sa.Integer, nullable=True),
    sa.Column('c_timestamp_tz', sa.Integer, nullable=True),
    sa.Column('c_timestamp_wo_tz', sa.Integer, nullable=True),
    sa.Column('c_xml', sa.Integer, nullable=True),
    sa.Column('c_bit', sa.Integer, nullable=True),
    sa.Column('c_varbit', sa.Integer, nullable=True),
    sa.Column('c_inet', sa.Integer, nullable=True),
    sa.Column('c_cidr', sa.Integer, nullable=True),
    sa.Column('c_geometry', sa.Integer, nullable=True),
    sa.Column('c_json', sa.Integer, nullable=True),
    sa.Column('c_jsonb', sa.Integer, nullable=True))


# Mapping Objects
class type_samples():
    def __init__(self, c_integer, c_smallint, c_decimal, c_serial, c_bigserial, c_float, c_double, c_char, c_varchar, c_text, c_bytea, c_boolean, c_date, c_time, c_time_tz, c_interval, c_timestamp, c_timestamp_tz, c_timestamp_wo_tz, c_xml, c_bit, c_varbit, c_inet, c_cidr, c_geometry, c_json, c_jsonb):
        self.c_integer = c_integer
        self.c_smallint = c_smallint
        self.c_decimal = c_decimal
        self.c_serial = c_serial
        self.c_bigserial = c_bigserial
        self.c_float = c_float
        self.c_double = c_double
        self.c_char = c_char
        self.c_varchar = c_varchar
        self.c_text = c_text
        self.c_bytea = c_bytea
        self.c_boolean = c_boolean
        self.c_date = c_date
        self.c_time = c_time
        self.c_time_tz = c_time_tz
        self.c_interval = c_interval
        self.c_timestamp = c_timestamp
        self.c_timestamp_tz = c_timestamp_tz
        self.c_timestamp_wo_tz = c_timestamp_wo_tz
        self.c_xml = c_xml
        self.c_bit = c_bit
        self.c_varbit = c_varbit
        self.c_inet = c_inet
        self.c_cidr = c_cidr
        self.c_geometry = c_geometry
        self.c_json = c_json
        self.c_jsonb = c_jsonb

    def __repr__(self):
        return "<type_samples('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')>" % (self.c_integer, self.c_smallint, self.c_decimal, self.c_serial, self.c_bigserial, self.c_float, self.c_double, self.c_char, self.c_varchar, self.c_text, self.c_bytea, self.c_boolean, self.c_date, self.c_time, self.c_time_tz, self.c_interval, self.c_timestamp, self.c_timestamp_tz, self.c_timestamp_wo_tz, self.c_xml, self.c_bit, self.c_varbit, self.c_inet, self.c_cidr, self.c_geometry, self.c_json, self.c_jsonb)


# Declare mappings
mapper(type_samples, type_samples_table)

# Create a session
session = sessionmaker(bind=db_engine)