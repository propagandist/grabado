/*
ALTER TABLE "articles" DROP CONSTRAINT "FK_articles_users";
ALTER TABLE "article_tags" DROP CONSTRAINT "FK_article_tags_articles";
DROP TABLE "users" PURGE;
DROP TABLE "articles" PURGE;
DROP TABLE "article_tags" PURGE;
-- */

-------------------------------------------------------------------------------
--            users
-------------------------------------------------------------------------------

CREATE TABLE "users" (
    "id"                              RAW(16)             DEFAULT 'SYS_GUID()'             NOT NULL
  , "email"                           VARCHAR2(255)       NOT NULL
  , "display_name"                    VARCHAR2(255)       NOT NULL
  , "is_active"                       NUMBER(1)           DEFAULT 1           NOT NULL
  , "preferences"                     CLOB                NOT NULL
  , "created_at"                      TIMESTAMP(6)        DEFAULT SYSTIMESTAMP        NOT NULL
  , "updated_at"                      TIMESTAMP(6)        DEFAULT SYSTIMESTAMP        NOT NULL
  , CONSTRAINT "users_pkey" PRIMARY KEY ( "id" )
  , CONSTRAINT "users_email_key" UNIQUE ( "email" )
);

COMMENT ON TABLE  "users"                                 IS 'ユーザー';
COMMENT ON COLUMN "users"."email"                           IS 'ログイン用メールアドレス';
COMMENT ON COLUMN "users"."preferences"                     IS 'UI 設定などの任意項目';

-------------------------------------------------------------------------------
--            articles
-------------------------------------------------------------------------------

CREATE TABLE "articles" (
    "id"                              RAW(16)             DEFAULT 'SYS_GUID()'             NOT NULL
  , "author_id"                       RAW(16)             NOT NULL
  , "title"                           VARCHAR2(255)       NOT NULL
  , "body"                            CLOB
  , "view_count"                      NUMBER              DEFAULT 0              NOT NULL
  , "price"                           DECIMAL(12,2)
  , "published_on"                    DATE
  , "created_at"                      TIMESTAMP(6)        DEFAULT SYSTIMESTAMP        NOT NULL
  , "updated_at"                      TIMESTAMP(6)        DEFAULT SYSTIMESTAMP        NOT NULL
  , CONSTRAINT "articles_pkey" PRIMARY KEY ( "id" )
);

COMMENT ON TABLE  "articles"                                 IS '記事';
COMMENT ON COLUMN "articles"."author_id"                       IS '執筆者 (users.id)';
COMMENT ON COLUMN "articles"."price"                           IS '有料記事の価格。浮動小数ではなく decimal を使う';

-------------------------------------------------------------------------------
--            article_tags
-------------------------------------------------------------------------------

CREATE TABLE "article_tags" (
    "article_id"                      RAW(16)             NOT NULL
  , "tag"                             VARCHAR2(64)        NOT NULL
  , "created_at"                      TIMESTAMP(6)        DEFAULT SYSTIMESTAMP        NOT NULL
  , CONSTRAINT "pk_article_tags" PRIMARY KEY ( "article_id", "tag" )
);

COMMENT ON TABLE  "article_tags"                                 IS '記事とタグの対応';

-------------------------------------------------------------------------------

ALTER TABLE "articles" ADD CONSTRAINT "FK_articles_users" FOREIGN KEY ( "author_id" ) REFERENCES "users" ( "id" );
ALTER TABLE "article_tags" ADD CONSTRAINT "FK_article_tags_articles" FOREIGN KEY ( "article_id" ) REFERENCES "articles" ( "id" );