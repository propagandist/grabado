CREATE TABLE 'users' (
'id' TEXT NOT NULL  DEFAULT 'uuidv7()' PRIMARY KEY,
'email' TEXT NOT NULL ,
'display_name' TEXT NOT NULL ,
'is_active' TEXT NOT NULL  DEFAULT 'true',
'preferences' TEXT NOT NULL  DEFAULT ''{}'::jsonb',
'created_at' TEXT NOT NULL  DEFAULT 'now()',
'updated_at' TEXT NOT NULL  DEFAULT 'now()',
UNIQUE (email)
);

CREATE TABLE 'articles' (
'id' TEXT NOT NULL  DEFAULT 'uuidv7()' PRIMARY KEY,
'author_id' TEXT NOT NULL  REFERENCES 'users' ('id'),
'title' TEXT NOT NULL ,
'body' TEXT DEFAULT NULL,
'view_count' INTEGER NOT NULL  DEFAULT 0,
'price' TEXT(12,2) DEFAULT NULL,
'published_on' TEXT DEFAULT NULL,
'created_at' TEXT NOT NULL  DEFAULT 'now()',
'updated_at' TEXT NOT NULL  DEFAULT 'now()'
);

CREATE TABLE 'article_tags' (
'article_id' TEXT NOT NULL  REFERENCES 'articles' ('id'),
'tag' TEXT NOT NULL ,
'created_at' TEXT NOT NULL  DEFAULT 'now()',
UNIQUE (article_id, tag)
);