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
    "id"                              INTEGER             DEFAULT uuidv7()             NOT NULL
  , "email"                           NCLOB               NOT NULL
  , "display_name"                    NCLOB               NOT NULL
  , "is_active"                       INTEGER             DEFAULT true             NOT NULL
  , "preferences"                     INTEGER             DEFAULT '{}'::jsonb             NOT NULL
  , "created_at"                      INTEGER             DEFAULT now()             NOT NULL
  , "updated_at"                      INTEGER             DEFAULT now()             NOT NULL
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
    "id"                              INTEGER             DEFAULT uuidv7()             NOT NULL
  , "author_id"                       INTEGER             NOT NULL
  , "title"                           NCLOB               NOT NULL
  , "body"                            NCLOB
  , "view_count"                      NUMBER              DEFAULT 0              NOT NULL
  , "price"                           DECIMAL(12,2)
  , "published_on"                    DATE
  , "created_at"                      INTEGER             DEFAULT now()             NOT NULL
  , "updated_at"                      INTEGER             DEFAULT now()             NOT NULL
  , CONSTRAINT "articles_pkey" PRIMARY KEY ( "id" )
);

COMMENT ON TABLE  "articles"                                 IS '記事';
COMMENT ON COLUMN "articles"."author_id"                       IS '執筆者 (users.id)';
COMMENT ON COLUMN "articles"."price"                           IS '有料記事の価格。money ではなく numeric を使う';

-------------------------------------------------------------------------------
--            article_tags
-------------------------------------------------------------------------------

CREATE TABLE "article_tags" (
    "article_id"                      INTEGER             NOT NULL
  , "tag"                             NCLOB               NOT NULL
  , "created_at"                      INTEGER             DEFAULT now()             NOT NULL
  , CONSTRAINT "pk_article_tags" PRIMARY KEY ( "article_id", "tag" )
);

COMMENT ON TABLE  "article_tags"                                 IS '記事とタグの対応';

-------------------------------------------------------------------------------

ALTER TABLE "articles" ADD CONSTRAINT "FK_articles_users" FOREIGN KEY ( "author_id" ) REFERENCES "users" ( "id" );
ALTER TABLE "article_tags" ADD CONSTRAINT "FK_article_tags_articles" FOREIGN KEY ( "article_id" ) REFERENCES "articles" ( "id" );