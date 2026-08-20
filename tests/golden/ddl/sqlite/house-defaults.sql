CREATE TABLE 'users' (
'id' TEXT NOT NULL  PRIMARY KEY,
'email' TEXT NOT NULL ,
'display_name' TEXT NOT NULL ,
'is_active' INTEGER NOT NULL  DEFAULT 1,
'preferences' TEXT NOT NULL  DEFAULT '{}',
'created_at' TEXT NOT NULL  DEFAULT CURRENT_TIMESTAMP,
'updated_at' TEXT NOT NULL  DEFAULT CURRENT_TIMESTAMP,
UNIQUE (email)
);

CREATE TABLE 'articles' (
'id' TEXT NOT NULL  PRIMARY KEY,
'author_id' TEXT NOT NULL  REFERENCES 'users' ('id'),
'title' TEXT NOT NULL ,
'body' TEXT,
'view_count' INTEGER NOT NULL  DEFAULT 0,
'price' NUMERIC,
'published_on' TEXT,
'created_at' TEXT NOT NULL  DEFAULT CURRENT_TIMESTAMP,
'updated_at' TEXT NOT NULL  DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE 'article_tags' (
'article_id' TEXT NOT NULL  REFERENCES 'articles' ('id'),
'tag' TEXT NOT NULL ,
'created_at' TEXT NOT NULL  DEFAULT CURRENT_TIMESTAMP,
UNIQUE (article_id, tag)
);