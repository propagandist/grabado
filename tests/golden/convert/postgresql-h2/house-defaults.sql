-- grabado: postgresql の設計を h2 向けに変換して出力した。
-- 型はすべてそのまま写っている（意味が動いた列は無い）。
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

CREATE TABLE users (
 id UUID NOT NULL DEFAULT uuidv7(),
 email CHARACTER LARGE OBJECT NOT NULL,
 display_name CHARACTER LARGE OBJECT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT true,
 preferences JSON NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
COMMENT ON TABLE users IS 'ユーザー';
COMMENT ON COLUMN users.email IS 'ログイン用メールアドレス';
COMMENT ON COLUMN users.preferences IS 'UI 設定などの任意項目';

CREATE TABLE articles (
 id UUID NOT NULL DEFAULT uuidv7(),
 author_id UUID NOT NULL,
 title CHARACTER LARGE OBJECT NOT NULL,
 body CHARACTER LARGE OBJECT,
 view_count INTEGER NOT NULL DEFAULT 0,
 price NUMERIC(12,2),
 published_on DATE,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE articles ADD CONSTRAINT articles_pkey PRIMARY KEY (id);
COMMENT ON TABLE articles IS '記事';
COMMENT ON COLUMN articles.author_id IS '執筆者 (users.id)';
COMMENT ON COLUMN articles.price IS '有料記事の価格。money ではなく numeric を使う';

CREATE TABLE article_tags (
 article_id UUID NOT NULL,
 tag CHARACTER LARGE OBJECT NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);


ALTER TABLE article_tags ADD CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag);
COMMENT ON TABLE article_tags IS '記事とタグの対応';

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles(id);