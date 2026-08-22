-- grabado: postgresql の設計を mariadb 向けに変換して出力した。
-- 型はすべてそのまま写っている（意味が動いた列は無い）。
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

CREATE TABLE users (
  id UUID NOT NULL DEFAULT uuidv7(),
  email LONGTEXT NOT NULL COMMENT 'ログイン用メールアドレス',
  display_name LONGTEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferences JSON NOT NULL DEFAULT '{}'::jsonb COMMENT 'UI 設定などの任意項目',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email)
) COMMENT 'ユーザー';

CREATE TABLE articles (
  id UUID NOT NULL DEFAULT uuidv7(),
  author_id UUID NOT NULL COMMENT '執筆者 (users.id)',
  title LONGTEXT NOT NULL,
  body LONGTEXT NULL,
  view_count INT NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NULL COMMENT '有料記事の価格。money ではなく numeric を使う',
  published_on DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
) COMMENT '記事';

CREATE TABLE article_tags (
  article_id UUID NOT NULL,
  tag LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, tag)
) COMMENT '記事とタグの対応';

ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id);
ALTER TABLE article_tags ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id);