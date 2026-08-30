PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
) STRICT;

-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
  id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  price TEXT,
  published_on TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT articles_pkey PRIMARY KEY (id),
  CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id)
) STRICT;

-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。STRICT に NUMERIC は無く REAL では桁が壊れるので文字列で持つ

CREATE TABLE article_tags (
  article_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag),
  CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id)
) STRICT;

-- article_tags: 記事とタグの対応