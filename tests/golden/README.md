# tests/golden — 現行実装の実出力（house 仕様ではない）

このディレクトリの中身は **「2026-08-09 時点の現行 wwwsqldesigner が実際に吐いたバイト列」** であって、
**正しい出力でも、grabado が目指す house 仕様でもない**。

役割は 1 つだけ — HANDOVER §9 の移植（フロント TS 化 → IO の JSON 化 → 型パレット → backend）で
**意図しない挙動変化が起きたら赤くする**こと。CLAUDE.md の Hard Constraint 1 が言う安全網の実体。

```
ddl/<db>/<fixture>.sql   Designer.toDdl() の出力。6 DB × 7 fixture
state/<fixture>.json     fromXML() 後のライブツリー＋DOM の状態（§4 段階4-1b で追加）
json/<fixture>.json      Designer.toJson() の出力（§4 段階4-2 で追加）
```

**§6 段階6-6a で入力が DB 別になり、6-6b でその中身が各 DB の実型になった。**
`ddl/<db>/` は [`../fixtures/<db>/`](../fixtures/) を読んで採る（`state/` と `json/` は
`postgresql` の fixture 固定）。6-6b で **21 本が動いている** ——
`mysql` 4 / `mssql` 6 / `oracle` 5 / `sqlite` 3 / `postgresql` 3（`types-matrix` に
`BIGINT` と `UUID` を足したぶん。`ddl` / `json` / `state` の 1 本ずつ）。

**§6 段階6-7a で `sql-standard` の 7 本が新規に増えた**（既存 35 本は 1 バイトも動いていない ——
新設プロファイルは既存の出力に触れないので、それが段階の完了判定）。ベンダ非依存のプロファイルで、
`COMMENT ON` も `CREATE INDEX` も標準に無いため**行コメントで出る**のが他 5 本と違う。

**これで非 PG の golden が初めて「その DB の DDL」になった。** 6-6a まではどれも
PG 用の型名を読ませた結果で、`oracle` は uuid / jsonb / timestamptz が全部 `INTEGER`、
`sqlite` は全列 `TEXT` に落ちていた。ただし**書けるのは現行パレットに実在する型だけ**なので、
21 本は「**6-8 直前のベースライン**」であってその DB の理想形ではない。

**§6 段階6-5a で `ddl-input/` の 7 本が消えた。** あれは `Designer.toXML()` の出力＝
`db/<db>/output.xsl` への入力で、DDL 生成だけが「モデル -> 中間 XML -> XSLT -> 文字列」の
3 段だったことの副産物だった。XSLT が TS 生成器（[`../../js/io/ddl/`](../../js/io/ddl/)）に
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
  未現代化の 4 本は元から `key/@name` を読んでいるのでこの癖を持たない
- ~~`DEFAULT 'now()'` / `DEFAULT 'uuidv7()'` のように式が引用符で囲まれる~~
  **§6 段階6-4 で `postgresql` から消えた**（式は `quote` を当てない）。未現代化の 4 本は
  従来規則のままだが、そちらは `UUID` が先頭型（`quote=""`）に落ちるので元から裸で出ている
  —— つまり**この癖はもうどの golden にも無い**。囲む側の規則（値の中の `'` を
  エスケープしない）も **6-5b で `postgresql` からは消えた**（未現代化の 4 本には残る。
  known-issues #11 の脚注）
- ~~`BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL` のように制約が重なる~~
  **§6 段階6-5b で `postgresql` から消えた**（identity は暗黙で NOT NULL なので句を出さない）。
  同じ段階で `@autoincrement=1` の `BIGSERIAL` 固定も無くなり、型を残して IDENTITY 句を足す形になった
- **`mssql`: 最終列にコメントがあると区切りカンマが `--` に飲まれる**（known-issues #12。
  `ddl/mssql/relations.sql` に実物がある）
- **`sqlite`: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える**（known-issues #13。
  `ddl/sqlite/relations.sql`）
- ~~**未現代化のプロファイルでは `UUID` が型パレットに無く `INTEGER` に落ちている**~~
  **§6 段階6-6b で golden から消えた** —— 各 DB の fixture がその DB の型で書かれ、
  もう PG の型名を読ませていないため。**#4 / #10 そのものは 6-8 まで残り**、再現は
  known-issues 側が **postgresql の fixture を明示的に読む**形で保っている
- **`oracle`: `INTEGER` と書いた列が `NUMBER` になる**（known-issues #10）。
  `number` の `re="INT"` が `integer` の `sql` 完全一致を後勝ちで上書きするので、
  **このパレットで `integer` 型にはどう書いても到達できない**。
  `ddl/oracle/types-matrix.sql` の `c_integer` がその実物
- **`mssql`: `DEFAULT` が 1 つも出ない**（生成器に分岐が無い。6-5a が記録した 9 件の 1 つ）。
  `ddl/mssql/house-defaults.sql` では `NEWID()` も `GETDATE()` も既定値 `1` も丸ごと落ちる
- **`mssql`: UNIQUE キーが T-SQL に無い `UNIQUE KEY (...)` で出る**（known-issues #14）
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
5 本の XSLT（計 952 行）を [`../../js/io/ddl/`](../../js/io/ddl/) へ**逐語移植**した段階なので、
それが完了判定そのもの。上に挙げた癖はすべて TS 側で忠実に再現してある（PG のぶんを直すのが
6-5b、未現代化 4 本のぶんが 6-8）。**動いたのは `ddl-input/` の 7 本が消えたことだけ。**
