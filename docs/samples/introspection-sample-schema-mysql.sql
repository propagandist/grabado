-- HANDOVER §5 段階5-8a の introspection 実測用サンプルスキーマ（MySQL / MariaDB）。
--
-- postgresql 版（introspection-sample-schema.sql）と**同じ設計**を MySQL 方言で書いたもの。
-- 同じものを 2 つの DB で読ませて、方言ごとの差だけが出るようにするのが狙い。
--
-- PG 版との違いは MySQL 側の制約:
--   * uuid 型が無い -> CHAR(36)（型パレットの写像もそうなっている。docs/TYPE-MAPPING.md）
--   * 配列型が無い -> tags は JSON で持つ
--   * timestamptz が無い -> TIMESTAMP（タイムゾーンは落ちる。§6-10b の表が記録している）
--   * TEXT 系はキーにできない（長さが要る）-> email は VARCHAR(255)
--
-- ★ **PG 版と揃えているもの**（方言差ではなく、introspection が読む対象として要るもの）:
--   複合 PK / FK / 単独 index / 複合 index / テーブルと列のコメント / 既定値。

CREATE TABLE users (
    id           CHAR(36) NOT NULL,
    email        VARCHAR(255) NOT NULL COMMENT 'ログイン用メールアドレス',
    display_name TEXT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    preferences  JSON NOT NULL COMMENT 'UI 設定などの任意項目',
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_email_key (email)
) COMMENT 'ユーザー';

CREATE TABLE articles (
    id            CHAR(36) NOT NULL,
    author_id     CHAR(36) NOT NULL COMMENT '著者',
    title         VARCHAR(255) NOT NULL,
    body          TEXT,
    tags          JSON,
    view_count    INT NOT NULL DEFAULT 0,
    price         DECIMAL(12,2),
    published_on  DATE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id),
    KEY idx_articles_author_id (author_id),
    KEY idx_articles_published_on_title (published_on, title)
) COMMENT '記事';

CREATE TABLE article_tags (
    article_id CHAR(36) NOT NULL,
    tag        VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (article_id, tag),
    CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id)
) COMMENT '記事とタグの対応';
