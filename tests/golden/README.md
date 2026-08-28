# tests/golden — 現行実装の実出力（house 仕様ではない）

このディレクトリの中身は **「2026-08-09 時点の現行 wwwsqldesigner が実際に吐いたバイト列」** であって、
**正しい出力でも、grabado が目指す house 仕様でもない**。

役割は 1 つだけ — HANDOVER §9 の移植（フロント TS 化 → IO の JSON 化 → 型パレット → backend）で
**意図しない挙動変化が起きたら赤くする**こと。CLAUDE.md の Hard Constraint 1 が言う安全網の実体。

```
ddl/<db>/<fixture>.sql       Designer.toDdl() の出力。8 DB × 7 fixture
orm/<target>/<db>/<f>.<ext>  Designer.toOrm() の出力（§6 段階6-9d で追加。
                             jpa=.kt / prisma=.prisma / drizzle=.ts）
state/<fixture>.json         fromXML() 後のライブツリー＋DOM の状態（§4 段階4-1b で追加）
json/<fixture>.json          Designer.toJson() の出力（§4 段階4-2 で追加）
```

**§6 段階6-6a で入力が DB 別になり、6-6b でその中身が各 DB の実型になった。**
`ddl/<db>/` は [`../fixtures/<db>/`](../fixtures/) を読んで採る（`state/` と `json/` は
`postgresql` の fixture 固定）。6-6b で **21 本が動いている** ——
`mysql` 4 / `mssql` 6 / `oracle` 5 / `sqlite` 3 / `postgresql` 3（`types-matrix` に
`BIGINT` と `UUID` を足したぶん。`ddl` / `json` / `state` の 1 本ずつ）。

**§6 段階6-7a で `sql-standard`、6-7b で `h2` が 7 本ずつ増えた**（そのたびに既存の golden は
1 バイトも動いていない —— 新設プロファイルは既存の出力に触れないので、それが段階の完了判定）。

- `sql-standard` はベンダ非依存で、`COMMENT ON` も `CREATE INDEX` も標準に無いため**行コメントで出る**
- `h2` は **house 既定をほぼそのまま置ける唯一の非 PostgreSQL**（uuid / tz 付き timestamp /
  JSON / boolean がすべてネイティブ）。失うのは `uuidv7()` → `RANDOM_UUID()`（v4）だけ
- `mariadb` は MySQL 系文法（バッククォート・`AUTO_INCREMENT`・列定義内 `COMMENT`）で
  **現代化済み**。**§6 段階6-8a で `mysql` が同じ骨格へ移り**、7 本が動いた
  （飾りブロックと `DROP TABLE IF EXISTS` が消え、`empty.sql` は 192 → 0 バイト）。
  **MySQL だけ `DEFAULT (UUID())` と括弧が付く** —— MySQL 8 の式デフォルトの構文で、
  包まないと構文エラーになる（MariaDB は包まなくても通る）

**これで非 PG の golden が初めて「その DB の DDL」になった。** 6-6a まではどれも
PG 用の型名を読ませた結果で、`oracle` は uuid / jsonb / timestamptz が全部 `INTEGER`、
`sqlite` は全列 `TEXT` に落ちていた。当時は**書けるのが現行パレットに実在する型だけ**だったので
21 本は「**6-8 直前のベースライン**」でしかなかったが、**6-8a 〜 6-8d で 4 本とも現代化され、
56 本すべてが「その DB の DDL」になっている。**

**§6 段階6-5a で `ddl-input/` の 7 本が消えた。** あれは `Designer.toXML()` の出力＝
`db/<db>/output.xsl` への入力で、DDL 生成だけが「モデル -> 中間 XML -> XSLT -> 文字列」の
3 段だったことの副産物だった。XSLT が TS 生成器（[`../../frontend/js/io/ddl/`](../../frontend/js/io/ddl/)）に
なって中間表現が要らなくなり、**XML の書き出しそのものが grabado から無くなっている**
（読み込みは互換で残る）。

`json/` だけは他の 3 つと性格が違う。**現行実装の実出力ではなく、grabado が決めた新しい正本
フォーマット**（`formatVersion: 2`。仕様は [`../../docs/FORMAT.md`](../../docs/FORMAT.md)）で、
現行の癖のうち known-issues #2 / #3 / #4 / #5 は**意図的に持ち込んでいない**
（#2 は §4 段階4-5 で、#3 は §6 段階6-2 で本体ごと消え、#4 は 6-3 で PG から消えたので、
いまは XML 側にも無い）。**7 本は移行ツールが書いたバイト列**（[`../../tools/migrate-design.mjs`](../../tools/migrate-design.mjs)）
で、それが serializer の出力と一致することを golden テストが毎回見ている。
「この形が設計を過不足なく運べる」ことの根拠は golden ではなく、XML 経由と JSON 経由で
状態スナップショットが一致することを見る「情報保存」テストのほう。

`ddl/` が押さえるのは**書き出しの結果**だけで、読み込みが撒く副作用
（選択クラス・型パレット由来の色・relation がどの実体に繋がったか・`clearTables()` の後始末）は
1 つも写らない。`state/` はその穴を埋める。採取項目と**意図的に採らないもの**（レイアウト由来の値と
relation の色）は [`../../docs/TESTING.md`](../../docs/TESTING.md) と
[`../support/state.ts`](../support/state.ts) にある。

## 生成元は実ブラウザだけ

すべて Chromium（本物の `DOMParser` / 描画 DOM）で採取している。段階6-5a まではここに
`XSLTProcessor` も入っていた（DDL 生成が XSLT だったため）。
更新は必ず `npm run golden:update`。Node 側（vitest）は**読むだけで書かない**。
理由と手順は [`../../docs/TESTING.md`](../../docs/TESTING.md)。

## この golden に写り込んでいる現行の癖

正常系の入力でも、現行実装の欠陥はそのまま出力に出る。golden を読むときはこれを踏まえること。
それぞれ [`../known-issues/`](../known-issues/) に独立したテストがあり、**移植で直せばそちらが赤くなる**。

- ~~`users` に PRIMARY と UNIQUE があるため制約名 `users_pkey` が 2 回出る~~
  **§6 段階6-5b で `postgresql` から消えた**（制約名は `key/@name` を優先し、空のときだけ
  §6.3 の規約で組む）。`users` の UNIQUE は fixture が持っていた `users_email_key` として出る。
  他の 7 本は元から `key/@name` を読んでいるのでこの癖を持たない
- ~~`DEFAULT 'now()'` / `DEFAULT 'uuidv7()'` のように式が引用符で囲まれる~~
  **§6 段階6-4 で `postgresql` から消え、6-8a 〜 6-8d で 8 本すべてから消えた**
  （式は `quote` を当てない）。囲む側の規則（値の中の `'` をエスケープしない ＝
  known-issue #11）も **6-5b で `postgresql`、6-8d で残る 7 本**から消えている ——
  `js/io/ddl/shared.ts` の `quoteDefault` から strict / 未現代化の分岐ごと落ちた
- ~~`BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL` のように制約が重なる~~
  **§6 段階6-5b で `postgresql` から消えた**（identity は暗黙で NOT NULL なので句を出さない）。
  同じ段階で `@autoincrement=1` の `BIGSERIAL` 固定も無くなり、型を残して IDENTITY 句を足す形になった
- **`mssql`: 最終列にコメントがあると区切りカンマが `--` に飲まれる**（known-issues #12。
  `ddl/mssql/relations.sql` に実物がある）
- ~~**`sqlite`: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える**~~（known-issues #13）
  **§6 段階6-8d で消えた**（sqlite の現代化）。表定義の中に `CONSTRAINT <名> PRIMARY KEY (...)`
  を置く —— SQLite に `ALTER TABLE ADD CONSTRAINT` は無いのでそれしか無い。あわせて
  識別子が `'` から `"` になり、`) STRICT;` が付き、FK を持つ設計には先頭に
  `PRAGMA foreign_keys = ON;` が出て、**コメントが初めて出るようになった**（`--` の行コメント）
- ~~**未現代化のプロファイルでは `UUID` が型パレットに無く `INTEGER` に落ちている**~~
  **§6 段階6-6b で golden から消えた** —— 各 DB の fixture がその DB の型で書かれ、
  もう PG の型名を読ませていないため。**#4 / #10 そのものは 6-8 まで残り**、再現は
  known-issues 側が **postgresql の fixture を明示的に読む**形で保っていた。
  **#4 / #10 そのものが消えたのは 6-8d**（8 本すべてが strict になり、
  `js/io/xml-parser.ts` のフォールバックと `indexOfTypeNameLegacy` がコードごと落ちた）
- ~~**`oracle`: `INTEGER` と書いた列が `NUMBER` になる**~~
  **§6 段階6-8c で消えた**（oracle の現代化）。**これで `re` を持つパレットが 1 つも無くなり、
  known-issue #10 は実例ごと尽きた**。あわせて桁揃えと DROP のコメントブロックが落ち、
  SEQUENCE ＋ TRIGGER が identity 列になり、`BOOLEAN` / `JSON` /
  `TIMESTAMP WITH TIME ZONE` がパレットに入った（23ai で実測）
- ~~**`mssql`: `DEFAULT` が 1 つも出ない** ／ **UNIQUE キーが `UNIQUE KEY (...)` で出る**~~
  **§6 段階6-8b で消えた**（mssql の現代化）。あわせて known-issue #12（最終列のコメントが
  区切りカンマを飲む）も直り、`datetimeoffset` / `date` がパレットに入って
  **house 既定の `timestamptz` が tz ごと通る**ようになった
- **`sqlite`: コメントが 1 つも出ない**（6-5a が記録した粗さ）。`ddl/sqlite/house-defaults.sql`
  にテーブルコメントも列コメントも 1 行も無いのがその実物 —— `mysql` の同じ fixture は
  7 行出す。**`mysql` の「60 字で無言に切り詰める」ほうは golden に出ていない**
  （fixture のコメントが最長 26 文字のため）

**§6 段階6-5b で `postgresql` の 5 本・31 行が動いた**（`autoincrement` 1 / `types-matrix` 2 /
`quotes-i18n` 6 / `relations` 7 / `house-defaults` 15）。内訳は 1 行ずつ
[`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md) の段階6-5b に対応表がある。
**他 4 プロファイルの `ddl` 28 本は 1 バイトも動いていない** —— それが段階の完了判定。
`empty` / `minimal` が動かないのは、識別子が裸のまま・key もコメントも FK も無いため。

**§6 段階6-2 の型解決の再設計では 1 バイトも動かなかった** —— 直したのは `sql="BIGINT"` の
重複を後勝ちで拾う癖（#3）で、`types-matrix` fixture が `BIGINT` を持たないため
（隔離先は [`../known-issues/fixtures/bigint-drift.xml`](../known-issues/fixtures/bigint-drift.xml)）。

**§6 段階6-3（PG18 パレット差し替え）で `postgresql` の 11 本が動いた**（`ddl` 2 / `ddl-input` 2 /
`json` 2 / `state` 5）。`UUID` → `INTEGER` の落ち方（#4）が PG から消えたのが主で、ほかに
`NUMERIC` / `TIMESTAMPTZ` / `REAL` / `DOUBLE PRECISION` / identity への置き換え。
**他 4 プロファイルの `ddl` 28 本は 1 バイトも動いていない** —— それが段階の完了判定。

**§6 段階6-4（初期テーブルテンプレート）で動いたのは 2 本だけ**（`ddl-input/house-defaults.xml` と
`ddl/postgresql/house-defaults.sql`）。テンプレートそのものは golden に 1 ビットも写らない ——
golden はすべて fixture を読み込んでから採るので、「テーブル追加ボタンで何ができるか」は
どのファイルにも現れない（受け皿は [`../browser/template.spec.ts`](../browser/template.spec.ts)）。
動いた 2 本はどちらも**式の引用が外れたぶん**で、`DEFAULT 'uuidv7()'` → `DEFAULT uuidv7()`、
`DEFAULT ''{}'::jsonb'` → `DEFAULT '{}'::jsonb` のように PG に流せる形になっている。
`json` / `state` は不変 —— 既定値は元から引用符を剥がした値で持っているため。

§4 段階4-4 で `<default>` の後だけ改行が無い癖（旧 known-issues #8）は消えた。
**§4 段階4-5 で「既定値の無い行に `<default>NULL</default>` が生える」癖（旧 known-issues #2）も
消えた** —— このとき `ddl/` の 16 本から ` DEFAULT NULL`（cubrid / mysql / sqlite）と vfp9 の
` UL ` ゴミが、`state/` の 5 本から `"def": null` が落ちている。

## 正規化しているもの

**無い。§4 段階4-4 以降、golden は 1 バイトも加工していない。**

4-4 までは `ddl-input/`（当時 `xml/`）の `<!-- Active URL: {{ACTIVE_URL}} -->` の 1 行だけを
正規化していた。現行 `toXML()` が `location.href` を埋め込んで出力が環境依存になるためで、
「§4 でこれを撤去した」ことが diff に現れるよう行ごとは消さずに残していた。
4-4 でその行と `<datatypes>` の全文埋め込みを撤去し、書き出し側の環境依存が 0 になったので、
[`../support/normalize.ts`](../support/normalize.ts) から正規化関数ごと落とした。

**改行コードを含めてバイト一致で比較する。**

**§6 段階6-5a（`output.xsl` の TS 生成器化）で `ddl/` は 1 バイトも動いていない。**
5 本の XSLT（計 952 行）を [`../../frontend/js/io/ddl/`](../../frontend/js/io/ddl/) へ**逐語移植**した段階なので、
それが完了判定そのもの。上に挙げた癖はすべて TS 側で忠実に再現してある（PG のぶんを直すのが
6-5b、残る 4 本のぶんが 6-8a 〜 6-8d）。**動いたのは `ddl-input/` の 7 本が消えたことだけ。**

## ORM 出力（`orm/` — §6 段階6-9d で新設）

**DDL と違って 8 × 7 = 56 本にしていない。** ORM 出力は「型の写像」と「構造の組み立て」に
分かれ、**構造の側はプロファイルに依らない**（生成器が見るのは正規型 `kind` と関係とキーだけで、
SQL 型名も識別子の引用も通らない）。母集団は 2 つで足りる:

```
型の写像   8 プロファイル × types-matrix   そのプロファイルの全型が 1 列ずつ入っている
構造       postgresql × 残り 6 本           複合 PK・自己参照 FK・identity・日本語識別子
```

ターゲット 1 本につき **14 本**（6-9e で Prisma、**6-9f で Drizzle** が入って 42 本）。
ORM が 4 本になっても 56 本で、DDL の 56 本と同じ桁に収まる。母集団の定義は
[`../support/fixtures.ts`](../support/fixtures.ts) の `ormGoldenCases`。

**★ このバイト列を実物の道具が受け付けるかは、別の層が見る**（issue #120）——
`npm run test:orm-tools`。運用は [`../orm-tools/README.md`](../orm-tools/README.md)。

**`db/` にディレクトリを作っていない**のが要点 —— 作った瞬間 `DB_PROFILES` に入り、
ORM が型パレットの契約（`strict` / `<template>` / `newrowtype` / 全型網羅）を背負うことになる。
ORM は下敷きの db プロファイルの上に乗る別の軸で、**同じ設計から DDL と ORM の両方が出せる**。
