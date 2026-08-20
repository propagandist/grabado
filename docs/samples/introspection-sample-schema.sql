-- HANDOVER §0 現物確認 / introspection(import) 実測用のサンプルスキーマ。
-- house 既定 (HANDOVER §6) に沿わせる:
--   PK = uuid DEFAULT uuidv7() (PG18)、テーブル名 = snake_case 複数形、
--   監査列 = timestamptz NOT NULL DEFAULT now()、text / jsonb / numeric / timestamptz を使う、
--   FK = fk_<table>_<参照元の列>、index = idx_<table>_<cols>（§6.3 の <ref> は段階6-5b で
--   参照元の列名に確定した。列名はテーブル内で一意なので制約名が必ず衝突しない）。
-- 目的は「house 標準のスキーマを現行 introspection に通すと XML がどう出るか」を固定すること。

CREATE TABLE users (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    email        text NOT NULL UNIQUE,
    display_name text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'ユーザー';
COMMENT ON COLUMN users.email IS 'ログイン用メールアドレス';
COMMENT ON COLUMN users.preferences IS 'UI 設定などの任意項目';

CREATE TABLE articles (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    author_id     uuid NOT NULL,
    title         text NOT NULL,
    body          text,
    tags          text[],
    view_count    integer NOT NULL DEFAULT 0,
    price         numeric(12,2),
    published_on  date,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id)
);

CREATE INDEX idx_articles_author_id ON articles (author_id);
CREATE INDEX idx_articles_published_on_title ON articles (published_on, title);

COMMENT ON TABLE articles IS '記事';
COMMENT ON COLUMN articles.author_id IS '執筆者 (users.id)';
COMMENT ON COLUMN articles.price IS '有料記事の価格。money ではなく numeric を使う';

-- 複合 PK / 複合 UNIQUE が XML でどう出るかを見るための中間テーブル
CREATE TABLE article_tags (
    article_id uuid NOT NULL,
    tag        text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag),
    CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES articles (id)
);

COMMENT ON TABLE article_tags IS '記事とタグの対応';
