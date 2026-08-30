CREATE TABLE "users" (
  "id" RAW(16) DEFAULT SYS_GUID() NOT NULL,
  "email" VARCHAR2(255) NOT NULL,
  "display_name" VARCHAR2(255) NOT NULL,
  "is_active" BOOLEAN DEFAULT TRUE NOT NULL,
  "preferences" JSON NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

COMMENT ON TABLE "users" IS 'ユーザー';
COMMENT ON COLUMN "users"."email" IS 'ログイン用メールアドレス';
COMMENT ON COLUMN "users"."preferences" IS 'UI 設定などの任意項目';

CREATE TABLE "articles" (
  "id" RAW(16) DEFAULT SYS_GUID() NOT NULL,
  "author_id" RAW(16) NOT NULL,
  "title" VARCHAR2(255) NOT NULL,
  "body" CLOB,
  "view_count" INTEGER DEFAULT 0 NOT NULL,
  "price" DECIMAL(12,2),
  "published_on" DATE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "articles" IS '記事';
COMMENT ON COLUMN "articles"."author_id" IS '執筆者 (users.id)';
COMMENT ON COLUMN "articles"."price" IS '有料記事の価格。浮動小数ではなく decimal を使う';

CREATE TABLE "article_tags" (
  "article_id" RAW(16) NOT NULL,
  "tag" VARCHAR2(64) NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT "pk_article_tags" PRIMARY KEY ("article_id", "tag")
);

COMMENT ON TABLE "article_tags" IS '記事とタグの対応';

ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id");
ALTER TABLE "article_tags" ADD CONSTRAINT "fk_article_tags_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id");