db_engine = sa.create_engine('sqlite:///db.sqlite')
metadata = sa.MetaData()


# Table definition - users
# ユーザー
users_table = sa.Table("users", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    # email - ログイン用メールアドレス
    sa.Column('email', sa.Integer),
    sa.Column('display_name', sa.Integer),
    sa.Column('is_active', sa.Integer),
    # preferences - UI 設定などの任意項目
    sa.Column('preferences', sa.Integer),
    sa.Column('created_at', sa.Integer),
    sa.Column('updated_at', sa.Integer))

# Table definition - articles
# 記事
articles_table = sa.Table("articles", metadata,
    sa.Column('id', sa.Integer, primary_key=True),
    # author_id - 執筆者 (users.id)
    sa.Column('author_id', sa.Integer, sa.ForeignKey("users.id")),
    sa.Column('title', sa.Integer),
    sa.Column('body', sa.Integer, nullable=True),
    sa.Column('view_count', sa.Integer),
    # price - 有料記事の価格。money ではなく numeric を使う
    sa.Column('price', sa.Integer, nullable=True),
    sa.Column('published_on', sa.Integer, nullable=True),
    sa.Column('created_at', sa.Integer),
    sa.Column('updated_at', sa.Integer))

# Table definition - article_tags
# 記事とタグの対応
article_tags_table = sa.Table("article_tags", metadata,
    sa.Column('article_id', sa.Integer, sa.ForeignKey("articles.id"), primary_key=True),
    sa.Column('tag', sa.Integer, primary_key=True),
    sa.Column('created_at', sa.Integer))


# Mapping Objects
class users():
    def __init__(self, id, email, display_name, is_active, preferences, created_at, updated_at):
        self.id = id
        self.email = email
        self.display_name = display_name
        self.is_active = is_active
        self.preferences = preferences
        self.created_at = created_at
        self.updated_at = updated_at

    def __repr__(self):
        return "<users('%s', '%s', '%s', '%s', '%s', '%s', '%s')>" % (self.id, self.email, self.display_name, self.is_active, self.preferences, self.created_at, self.updated_at)

class articles():
    def __init__(self, id, author_id, title, body, view_count, price, published_on, created_at, updated_at):
        self.id = id
        self.author_id = author_id
        self.title = title
        self.body = body
        self.view_count = view_count
        self.price = price
        self.published_on = published_on
        self.created_at = created_at
        self.updated_at = updated_at

    def __repr__(self):
        return "<articles('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')>" % (self.id, self.author_id, self.title, self.body, self.view_count, self.price, self.published_on, self.created_at, self.updated_at)

class article_tags():
    def __init__(self, article_id, tag, created_at):
        self.article_id = article_id
        self.tag = tag
        self.created_at = created_at

    def __repr__(self):
        return "<article_tags('%s', '%s', '%s')>" % (self.article_id, self.tag, self.created_at)


# Declare mappings
mapper(users, users_table)
mapper(articles, articles_table)
mapper(article_tags, article_tags_table)

# Create a session
session = sessionmaker(bind=db_engine)