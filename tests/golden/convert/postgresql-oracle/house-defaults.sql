-- grabado: postgresql の設計を oracle 向けに変換して出力した。
--
-- **6 列で型が動いている。** DDL としては通るが、
-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:
--
--   users.id: UUID (uuid) -> CHAR (string)
--   articles.id: UUID (uuid) -> CHAR (string)
--   articles.author_id: UUID (uuid) -> CHAR (string)
--   articles.view_count: INTEGER (int32) -> INTEGER (int64)
--   articles.published_on: DATE (date) -> DATE (timestamp)
--   article_tags.article_id: UUID (uuid) -> CHAR (string)
--
-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。
-- 出力先で通るかは確認すること。

CREATE TABLE "users" (
  "id" CHAR(36) DEFAULT uuidv7() NOT NULL,
  "email" CLOB NOT NULL,
  "display_name" CLOB NOT NULL,
  "is_active" BOOLEAN DEFAULT true NOT NULL,
  "preferences" JSON DEFAULT '{}'::jsonb NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

COMMENT ON TABLE "users" IS 'ユーザー';
COMMENT ON COLUMN "users"."email" IS 'ログイン用メールアドレス';
COMMENT ON COLUMN "users"."preferences" IS 'UI 設定などの任意項目';

CREATE TABLE "articles" (
  "id" CHAR(36) DEFAULT uuidv7() NOT NULL,
  "author_id" CHAR(36) NOT NULL,
  "title" CLOB NOT NULL,
  "body" CLOB,
  "view_count" INTEGER DEFAULT 0 NOT NULL,
  "price" DECIMAL(12,2),
  "published_on" DATE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "articles" IS '記事';
COMMENT ON COLUMN "articles"."author_id" IS '執筆者 (users.id)';
COMMENT ON COLUMN "articles"."price" IS '有料記事の価格。money ではなく numeric を使う';

CREATE TABLE "article_tags" (
  "article_id" CHAR(36) NOT NULL,
  "tag" CLOB NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT "pk_article_tags" PRIMARY KEY ("article_id", "tag")
);

COMMENT ON TABLE "article_tags" IS '記事とタグの対応';

ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id");
ALTER TABLE "article_tags" ADD CONSTRAINT "fk_article_tags_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id");