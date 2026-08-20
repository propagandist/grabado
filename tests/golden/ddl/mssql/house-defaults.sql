CREATE TABLE [users] (
  [id] uniqueidentifier NOT NULL ,
  [email] nvarchar(255) NOT NULL , -- ログイン用メールアドレス
  [display_name] nvarchar(255) NOT NULL ,
  [is_active] bit NOT NULL ,
  [preferences] nvarchar(4000) NOT NULL , -- UI 設定などの任意項目
  [created_at] datetime NOT NULL ,
  [updated_at] datetime NOT NULL , 
CONSTRAINT users_pkey PRIMARY KEY ([id]), 
CONSTRAINT users_email_key UNIQUE KEY ([email])
) ON [PRIMARY]
GO

CREATE TABLE [articles] (
  [id] uniqueidentifier NOT NULL ,
  [author_id] uniqueidentifier NOT NULL , -- 執筆者 (users.id)
  [title] nvarchar(255) NOT NULL ,
  [body] nvarchar(4000) ,
  [view_count] int NOT NULL ,
  [price] decimal(12,2) , -- 有料記事の価格。money ではなく decimal を使う
  [published_on] datetime ,
  [created_at] datetime NOT NULL ,
  [updated_at] datetime NOT NULL , 
CONSTRAINT articles_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO

CREATE TABLE [article_tags] (
  [article_id] uniqueidentifier NOT NULL ,
  [tag] nvarchar(64) NOT NULL ,
  [created_at] datetime NOT NULL , 
CONSTRAINT pk_article_tags PRIMARY KEY ([article_id], [tag])
) ON [PRIMARY]
GO

ALTER TABLE [articles] ADD FOREIGN KEY (author_id) REFERENCES [users] ([id]);
				
ALTER TABLE [article_tags] ADD FOREIGN KEY (article_id) REFERENCES [articles] ([id]);