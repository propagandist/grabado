CREATE TABLE users (
  id UUID NOT NULL DEFAULT UUID(),
  email VARCHAR(255) NOT NULL COMMENT 'ログイン用メールアドレス',
  display_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferences JSON NOT NULL COMMENT 'UI 設定などの任意項目',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email)
) COMMENT 'ユーザー';

CREATE TABLE articles (
  id UUID NOT NULL DEFAULT UUID(),
  author_id UUID NOT NULL COMMENT '執筆者 (users.id)',
  title VARCHAR(255) NOT NULL,
  body LONGTEXT NULL,
  view_count INT NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NULL COMMENT '有料記事の価格。浮動小数ではなく decimal を使う',
  published_on DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) COMMENT '記事';

CREATE TABLE article_tags (
  article_id UUID NOT NULL,
  tag VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, tag)
) COMMENT '記事とタグの対応';

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id);
ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id);