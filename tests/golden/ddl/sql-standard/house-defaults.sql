CREATE TABLE users (
 id CHARACTER(36) NOT NULL,
 email CHARACTER VARYING(255) NOT NULL,
 display_name CHARACTER VARYING(255) NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT true,
 preferences JSON NOT NULL DEFAULT '{}',
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
 id CHARACTER(36) NOT NULL,
 author_id CHARACTER(36) NOT NULL,
 title CHARACTER VARYING(255) NOT NULL,
 body CHARACTER LARGE OBJECT,
 view_count INTEGER NOT NULL DEFAULT 0,
 price NUMERIC(12,2),
 published_on DATE,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE articles ADD CONSTRAINT articles_pkey PRIMARY KEY (id);
-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。浮動小数ではなく numeric を使う

CREATE TABLE article_tags (
 article_id CHARACTER(36) NOT NULL,
 tag CHARACTER VARYING(64) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE article_tags ADD CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag);
-- article_tags: 記事とタグの対応

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles(id);