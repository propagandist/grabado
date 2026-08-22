-- grabado: postgresql の設計を sql-standard 向けに変換して出力した。
--
-- **4 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   users.id: UUID (uuid) -> CHARACTER (string)
--   articles.id: UUID (uuid) -> CHARACTER (string)
--   articles.author_id: UUID (uuid) -> CHARACTER (string)
--   article_tags.article_id: UUID (uuid) -> CHARACTER (string)
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

CREATE TABLE users (
 id CHARACTER(36) NOT NULL DEFAULT uuidv7(),
 email CHARACTER LARGE OBJECT NOT NULL,
 display_name CHARACTER LARGE OBJECT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT true,
 preferences JSON NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
 id CHARACTER(36) NOT NULL DEFAULT uuidv7(),
 author_id CHARACTER(36) NOT NULL,
 title CHARACTER LARGE OBJECT NOT NULL,
 body CHARACTER LARGE OBJECT,
 view_count INTEGER NOT NULL DEFAULT 0,
 price NUMERIC(12,2),
 published_on DATE,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE articles ADD CONSTRAINT articles_pkey PRIMARY KEY (id);
-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。money ではなく numeric を使う

CREATE TABLE article_tags (
 article_id CHARACTER(36) NOT NULL,
 tag CHARACTER LARGE OBJECT NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE article_tags ADD CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag);
-- article_tags: 記事とタグの対応

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles(id);