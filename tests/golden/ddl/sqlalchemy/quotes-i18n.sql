db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - 顧客
# 顧客マスタ。'仮登録' の状態も含む
顧客_table = sa.Table("顧客", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    # 氏名 - 姓と名は分けない
    sa.Column('氏名', sa.Integer),
    # say "hi" - 識別子に " が入る場合の属性エスケープ確認
    sa.Column('say "hi"', sa.Integer, nullable=True),
    # メモ - 顧客の'愛称'をここに書く
    sa.Column('メモ', sa.Integer, nullable=True))


# Mapping Objects
class 顧客():
    def __init__(self, id, 氏名, say "hi", メモ):
        self.id = id
        self.氏名 = 氏名
        self.say "hi" = say "hi"
        self.メモ = メモ

    def __repr__(self):
        return "<顧客('%s', '%s', '%s', '%s')>" % (self.id, self.氏名, self.say "hi", self.メモ)


# Declare mappings
mapper(顧客, 顧客_table)

# Create a session
session = sessionmaker(bind=db_engine)