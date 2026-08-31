# grabado

**grabado** はブラウザで動く ER 設計ツール。スキーマを描いて **8 つの DB プロファイル**へ DDL を
出し、既存の DB を読み取って図に戻せる。**設計は git 管理の JSON ファイルが正本**で、
エディタの裏に DB は無い。

**触ってみる: <https://grabado.dev/>** —— **読み取り専用の公開デモ**
（保存・introspection・AI は止めてある）。**編集はブラウザ内で完結する**ので、
そのまま描いて **DDL とエクスポートまで出せる**。

Ondrej Zara の [ondras/wwwsqldesigner](https://github.com/ondras/wwwsqldesigner)（BSD-3-Clause）
由来。描画エンジンは温存し、その周りを TypeScript で書き直した。PHP backend は
Kotlin/Spring Boot に置き換え、**単一の Docker イメージ**として配る。

> 英語版は [`README.en.md`](README.en.md)。**それ以外の文書はすべて日本語**
> （[`docs/`](docs/)・[`CLAUDE.md`](CLAUDE.md)・[`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md)）。

## できること

- **描く** —— テーブル・列・キー・外部キー制約・インデックス・コメントをブラウザで
- **DDL を出す** —— 1 つの設計から 8 プロファイル（下の表）
- **ORM モデルを出す** —— JPA（Kotlin）・Prisma・Drizzle
- **既存の DB を読み取る** —— introspection が `information_schema` を読んで JSON で返す
- **AI 提案** —— 任意・BYOK。提案は必ずレビューを経て、**適用は他と同じ決定論パスに合流する**。
  **自動適用はしない**
- **設計はファイル** —— 決定論 JSON（キー順・配列順が安定、1 テーブル＝独立ブロック）なので
  スキーマの変更が読める diff になり、共有は PR で行う

## 対応 DB

| プロファイル | DDL 出力 | introspection |
|---|---|---|
| `postgresql` | ○ | ○ |
| `mysql` | ○ | ○ |
| `mariadb` | ○ | ○ |
| `h2` | ○ | ○ |
| `mssql` | ○ | — |
| `oracle` | ○ | — |
| `sqlite` | ○ | — |
| `sql-standard` | ○ | — |

既定のパレットは **PostgreSQL 18**。設計は PG の型で描き、**出力の直前に変換する**ので、
どのプロファイルへ出しても保存されるファイルは同じ。型ごとの写り方は
[`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) —— **あの表は手で書いていない**。実装の出力と
1 セルずつ突き合わせるテストが持っている。

## 設計は DB の行ではなくファイル

編集中の状態はブラウザ内に持ち、保存はマウント済みディレクトリへ write-through する。
**正本はリポジトリの JSON ファイル**で、コードと同じようにレビューしてマージする。
形式は [`docs/FORMAT.md`](docs/FORMAT.md)。upstream の XML 設計は**読み込みだけ**できる
（grabado が書き出すのは JSON のみ）。

## 起動

**イメージはレジストリで配らない。各自が build する。**

### compose

```bash
cp .env.example .env      # 要る行だけコメントを外す。何も外さなくても起動する
docker compose up --build
```

<http://127.0.0.1:8080> を開く。

- 設計 JSON はホストの `schema/` に書かれる。置き場所を変えるなら
  [`compose.yaml`](compose.yaml) の mount の**左側**
- **`.env` がコンテナへ丸ごと入るわけではない。** [`compose.yaml`](compose.yaml) の
  `environment:` が列挙した env だけが渡る（`env_file:` は使っていない）
- **`=` の右を空にした行を残さない。** 空文字は既定に倒れず、そのまま渡って**起動を落とす**
  （例: `GRABADO_READONLY=`）

### compose を使わない

```bash
docker build -t grabado .
docker run --rm -p 8080:8080 -v "$PWD/schema:/data/schema" grabado
```

`-v` の左側は**設計 JSON を置くホスト側のディレクトリ**。

### 読み取り専用

```bash
GRABADO_READONLY=true docker compose up
```

保存・introspection・AI が止まる（`list` / `load` は生きている）。**公開デモはこの一択** ——
AI は API 費用が自社負担、introspection は SSRF の踏み台になるので、
**知らない人が触れる所には置けない**。

### Linux ホストでの注意

**そのまま動く。** コンテナは**起動時に mount 先の所有者を見て、そこへ降りる** ——
書かれたファイルはあなたの所有になるので、**設計をそのまま `git add` できる**。

仕組みと分岐は [`docker-entrypoint.sh`](docker-entrypoint.sh) の冒頭。**設定は要らない**
（`docker compose up` だけでよい）。

### ローカル開発

```bash
npm install
npm run dev               # Vite dev server
```

<http://127.0.0.1:4173/index.html> を開く。配布物を確かめるときは `npm run build`
（`dist/` が出る）→ `npm run preview`（<http://127.0.0.1:4174>）。

## 設定

env の一覧は [`.env.example`](.env.example)（キー名と 1 行の用途）。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7.3（backend）／ §8.4（AI）／ §9.3（イメージ）。
**既定値の正本は `server/src/main/resources/application.yaml` の 1 か所**で、他へ写していない。

始める前に知っておくとよいのは 2 つ。

- **AI はキーとモデル名が両方そろって初めて有効になる。** キーは各自のコンテナへ env で
  注入するもので、**ブラウザには保存しない**
- **introspection の接続先は設定で名前を付けて列挙する。リクエストでは受けない** ——
  外から JDBC URL を渡す経路がそもそも無い

## 文書

| 文書 | 何を持つか |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 構成、backend と AI の契約、イメージ |
| [`docs/FORMAT.md`](docs/FORMAT.md) | 設計 JSON の形式 |
| [`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) | house 既定が各 DB で何になるか |
| [`docs/TESTING.md`](docs/TESTING.md) | テストの構成と走らせ方 |
| [`docs/BRANCHING.md`](docs/BRANCHING.md) | ブランチ運用 |
| [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) | fork 以降の決定と、その理由のすべて |
| [`CLAUDE.md`](CLAUDE.md) | 作業ルールと Hard Constraints |

## テスト

```bash
npm ci
npx playwright install chromium   # 初回のみ

npm test              # Node 側（jsdom）。速い。日常はこれ
npm run test:browser  # 実ブラウザ（Chromium）。DDL golden の権威
npm run known-issues  # 既知の不具合の再現確認
npm run test:server   # Kotlin backend を実 HTTP で
npm run test:image    # イメージを build してコンテナを起こし、通しで叩く
```

golden はツールが**実際に吐いているバイト列**を固定している。動いたなら、それは不具合か、
記録すべき決定のどちらか —— [`docs/TESTING.md`](docs/TESTING.md)。

## 由来とライセンス

**BSD-3-Clause**（upstream から継承。[`LICENSE`](LICENSE)）。grabado は
**upstream に追従しない**。差分は生じたその都度 [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) に記録する。

---

Issue / PR は受け付けるが、対応は保証しない。
