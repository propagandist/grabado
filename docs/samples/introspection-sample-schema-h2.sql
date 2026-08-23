-- HANDOVER §5 段階5-8b の introspection 実測用サンプルスキーマ（H2）。
--
-- postgresql 版 / mysql 版と**同じ設計**を H2 方言で書いたもの。
-- 同じものを 3 つの DB で読ませて、方言ごとの差だけが出るようにするのが狙い。
--
-- H2 側の制約:
--   * uuid 型はあるが、他の版と揃えて CHAR(36)（型パレットの写像もそう。docs/TYPE-MAPPING.md）
--   * 配列型はあるが information_schema から要素型を引けないので使わない
--   * 引用符なしの識別子は**大文字化される**（USERS / ID）—— テストの期待値もそうなっている
--
-- ★ **PG / MySQL 版と揃えているもの**: 複合 PK / FK / 単独 index / 複合 index /
--   テーブルと列のコメント / 既定値。

CREATE TABLE users (
    id           CHAR(36) NOT NULL,
    email        VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    preferences  VARCHAR(4000),
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

COMMENT ON TABLE users IS 'ユーザー';
COMMENT ON COLUMN users.email IS 'ログイン用メールアドレス';
COMMENT ON COLUMN users.preferences IS 'UI 設定などの任意項目';

CREATE TABLE articles (
    id            CHAR(36) NOT NULL,
    author_id     CHAR(36) NOT NULL,
    title         VARCHAR(255) NOT NULL,
    body          VARCHAR(8000),
    view_count    INTEGER NOT NULL DEFAULT 0,
    price         DECIMAL(12,2),
    published_on  DATE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT articles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id)
);

COMMENT ON TABLE articles IS '記事';
COMMENT ON COLUMN articles.author_id IS '著者';

CREATE INDEX idx_articles_author_id ON articles (author_id);
CREATE INDEX idx_articles_published_on_title ON articles (published_on, title);

CREATE TABLE article_tags (
    article_id CHAR(36) NOT NULL,
    tag        VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT article_tags_pkey PRIMARY KEY (article_id, tag),
    CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id)
);

COMMENT ON TABLE article_tags IS '記事とタグの対応';
