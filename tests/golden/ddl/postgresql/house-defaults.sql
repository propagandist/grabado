CREATE TABLE users (
 id UUID NOT NULL DEFAULT uuidv7(),
 email TEXT NOT NULL/* ログイン用メールアドレス */,
 display_name TEXT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT true,
 preferences JSONB NOT NULL DEFAULT '{}'::jsonb/* UI 設定などの任意項目 */,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_pkey UNIQUE (email);
COMMENT ON TABLE "users" IS 'ユーザー';
COMMENT ON COLUMN "users"."email" IS 'ログイン用メールアドレス';
COMMENT ON COLUMN "users"."preferences" IS 'UI 設定などの任意項目';

CREATE TABLE articles (
 id UUID NOT NULL DEFAULT uuidv7(),
 author_id UUID NOT NULL/* 執筆者 (users.id) */,
 title TEXT NOT NULL,
 body TEXT,
 view_count INTEGER NOT NULL DEFAULT 0,
 price NUMERIC(12,2)/* 有料記事の価格。money ではなく numeric を使う */,
 published_on DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE articles ADD CONSTRAINT articles_pkey PRIMARY KEY (id);
COMMENT ON TABLE "articles" IS '記事';
COMMENT ON COLUMN "articles"."author_id" IS '執筆者 (users.id)';
COMMENT ON COLUMN "articles"."price" IS '有料記事の価格。money ではなく numeric を使う';

CREATE TABLE article_tags (
 article_id UUID NOT NULL,
 tag TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE article_tags ADD CONSTRAINT article_tags_pkey PRIMARY KEY (article_id, tag);
COMMENT ON TABLE "article_tags" IS '記事とタグの対応';

ALTER TABLE articles ADD CONSTRAINT articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE article_tags ADD CONSTRAINT article_tags_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);