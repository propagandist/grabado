CREATE TABLE [users] (
  [id] tinyint NOT NULL ,
  [email] tinyint NOT NULL , -- ログイン用メールアドレス
  [display_name] tinyint NOT NULL ,
  [is_active] tinyint NOT NULL ,
  [preferences] tinyint NOT NULL , -- UI 設定などの任意項目
  [created_at] tinyint NOT NULL ,
  [updated_at] tinyint NOT NULL , 
CONSTRAINT users_pkey PRIMARY KEY ([id]), 
CONSTRAINT users_email_key UNIQUE KEY ([email])
) ON [PRIMARY]
GO

CREATE TABLE [articles] (
  [id] tinyint NOT NULL ,
  [author_id] tinyint NOT NULL , -- 執筆者 (users.id)
  [title] tinyint NOT NULL ,
  [body] tinyint ,
  [view_count] bigint NOT NULL ,
  [price] numeric(12,2) , -- 有料記事の価格。money ではなく numeric を使う
  [published_on] tinyint ,
  [created_at] tinyint NOT NULL ,
  [updated_at] tinyint NOT NULL , 
CONSTRAINT articles_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO

CREATE TABLE [article_tags] (
  [article_id] tinyint NOT NULL ,
  [tag] tinyint NOT NULL ,
  [created_at] tinyint NOT NULL , 
CONSTRAINT pk_article_tags PRIMARY KEY ([article_id], [tag])
) ON [PRIMARY]
GO

ALTER TABLE [articles] ADD FOREIGN KEY (author_id) REFERENCES [users] ([id]);
				
ALTER TABLE [article_tags] ADD FOREIGN KEY (article_id) REFERENCES [articles] ([id]);