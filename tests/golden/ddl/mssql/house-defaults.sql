CREATE TABLE users (
  id uniqueidentifier NOT NULL DEFAULT NEWID(),
  email nvarchar(255) NOT NULL,
  display_name nvarchar(255) NOT NULL,
  is_active bit NOT NULL DEFAULT 1,
  preferences nvarchar(4000) NOT NULL DEFAULT '{}',
  created_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
);
GO

-- users: ユーザー
-- users.email: ログイン用メールアドレス
-- users.preferences: UI 設定などの任意項目

CREATE TABLE articles (
  id uniqueidentifier NOT NULL DEFAULT NEWID(),
  author_id uniqueidentifier NOT NULL,
  title nvarchar(255) NOT NULL,
  body nvarchar(4000),
  view_count int NOT NULL DEFAULT 0,
  price decimal(12,2),
  published_on date,
  created_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT articles_pkey PRIMARY KEY (id)
);
GO

-- articles: 記事
-- articles.author_id: 執筆者 (users.id)
-- articles.price: 有料記事の価格。money ではなく decimal を使う

CREATE TABLE article_tags (
  article_id uniqueidentifier NOT NULL,
  tag nvarchar(64) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag)
);
GO

-- article_tags: 記事とタグの対応

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id);
GO

ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id);
GO