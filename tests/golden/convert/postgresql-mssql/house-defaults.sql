-- grabado: postgresql の設計を mssql 向けに変換して出力した。
--
-- **6 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   users.email: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   users.display_name: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   users.preferences: JSONB (json) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   articles.title: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   articles.body: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--   article_tags.tag: TEXT (string) -> nvarchar (string) / 写せる型が無いので既定型に置いた / **寄せ先はサイズを要求する。流す前に長さを足すこと**
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

CREATE TABLE users (
  id uniqueidentifier NOT NULL DEFAULT uuidv7(),
  email nvarchar NOT NULL,
  display_name nvarchar NOT NULL,
  is_active bit NOT NULL DEFAULT true,
  preferences nvarchar NOT NULL DEFAULT '{}'::jsonb,
  created_at datetimeoffset NOT NULL DEFAULT now(),
  updated_at datetimeoffset NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
);
GO

-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
  id uniqueidentifier NOT NULL DEFAULT uuidv7(),
  author_id uniqueidentifier NOT NULL,
  title nvarchar NOT NULL,
  body nvarchar,
  view_count int NOT NULL DEFAULT 0,
  price decimal(12,2),
  published_on date,
  created_at datetimeoffset NOT NULL DEFAULT now(),
  updated_at datetimeoffset NOT NULL DEFAULT now(),
  CONSTRAINT articles_pkey PRIMARY KEY (id)
);
GO

-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。money ではなく numeric を使う

CREATE TABLE article_tags (
  article_id uniqueidentifier NOT NULL,
  tag nvarchar NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT now(),
  CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag)
);
GO

-- article_tags: 記事とタグの対応

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id);
GO

ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id);
GO