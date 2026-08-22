-- grabado: postgresql の設計を sqlite 向けに変換して出力した。
--
-- **14 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   users.id: UUID (uuid) -> TEXT (string)
--   users.is_active: BOOLEAN (boolean) -> INTEGER (int64)
--   users.preferences: JSONB (json) -> TEXT (string)
--   users.created_at: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   users.updated_at: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   articles.id: UUID (uuid) -> TEXT (string)
--   articles.author_id: UUID (uuid) -> TEXT (string)
--   articles.view_count: INTEGER (int32) -> INTEGER (int64)
--   articles.price: NUMERIC (decimal) -> TEXT (string) / サイズが落ちた
--   articles.published_on: DATE (date) -> TEXT (string)
--   articles.created_at: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   articles.updated_at: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--   article_tags.article_id: UUID (uuid) -> TEXT (string)
--   article_tags.created_at: TIMESTAMPTZ (timestamp_tz) -> TEXT (string)
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT NOT NULL DEFAULT (uuidv7()),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  preferences TEXT NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
) STRICT;

-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
  id TEXT NOT NULL DEFAULT (uuidv7()),
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  price TEXT,
  published_on TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT articles_pkey PRIMARY KEY (id),
  CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id)
) STRICT;

-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。money ではなく numeric を使う

CREATE TABLE article_tags (
  article_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag),
  CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id)
) STRICT;

-- article_tags: 記事とタグの対応