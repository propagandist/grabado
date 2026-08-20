# FORMAT.md — 設計 JSON（`formatVersion: 2`）

grabado の**正本フォーマット**。git 管理のファイルとして保存され、共有は PR で行う
（CLAUDE.md 制約2）。読み書きは [`../js/io/json-serializer.ts`](../js/io/json-serializer.ts) と
[`../js/io/json-parser.ts`](../js/io/json-parser.ts) の 2 本だけを通る。形の定義（キー順の契約を含む）は
[`../js/io/json-format.ts`](../js/io/json-format.ts) が正本で、本書はその散文版。

> 状態: **確定版**（§4 完了時点・段階4-7 で総点検）。4-2 で新設 → 4-2b で型キーを安定 `id` に →
> 4-3b で UI の全経路に配線 → 4-4 で書き出しの拒否条件（同名テーブル）→ 4-5 で「既定値なし」を
> `""` の 1 通りに → 4-6 で保存前の外部変更検知。保存（textarea / クリップボード / ダウンロード /
> localStorage / server）はすべてこの形式で、読み込みは JSON と XML の両方を受ける
> （形式は中身の先頭 1 文字で判別する。[`../js/io/detect.ts`](../js/io/detect.ts)）。
> **§6 段階6-3（PG18 パレット差し替え）で形式そのものは 1 バイトも変わらなかった** ——
> 動いたのは `columns[].type` に入る値（型 `id`）だけで、`formatVersion` は 2 のまま。
> 移行の規則は「パレットを差し替えるときの移行」に確定版がある。

## 例

```json
{
  "formatVersion": 2,
  "db": "postgresql",
  "tables": [
    {
      "name": "employees",
      "x": 20,
      "y": 20,
      "comment": "従業員",
      "columns": [
        { "name": "id", "type": "integer" },
        {
          "name": "manager_id",
          "type": "integer",
          "nullable": true,
          "comment": "直属の上長（自己参照）",
          "references": [{ "table": "employees", "column": "id" }]
        }
      ],
      "keys": [{ "type": "PRIMARY", "name": "employees_pkey", "columns": ["id"] }]
    }
  ]
}
```

## スキーマ

### ルート

| キー | 型 | 必須 | 意味 |
|---|---|---|---|
| `formatVersion` | `2` | ○ | 形式の版。**2 以外は読み込みを拒む**（`1` は移行コマンドを名指しして拒む） |
| `db` | string | ○ | 型パレット（`db/<db>/datatypes.xml` の `db` 属性）。パレット全文は入れない |
| `tables` | array | ○ | 空でも出す（`"tables": []`） |

`db` は読み込み時に**実行中のパレットと照合し、食い違えば例外**（4-2b。4-2 は読んで捨てていた）。
型 `id` はプロファイル内で一意なだけなので、`db` が load-bearing でないと型キーの安全性が
成立しない。

**UI は拒むだけで、パレットを取り直して開き直すことはしない**（4-3b の決定）。例外メッセージが
そのまま alert に出て、「Options の db を `<ファイル側の db>` に変えてページを再読み込みすること」
という導線を示す。自動で取り直す案を採らなかったのは、読込 5 経路の非同期化が要るうえ、
cookie の `db` は変わらないのでリロードで元に戻る半端な状態を作るため。
4-3b 時点ではもう 1 つ「`typeIndex` / `fkTypeFor` の古いキャッシュを新パレットに当てる既知の癖」を
理由に挙げていたが、**段階6-2 でそのキャッシュごと廃止した**ので現在は成立しない。
残る 2 つで結論は変わらないため決定は保っている。

### `tables[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `name` | string | ○ | — |
| `x` / `y` | number | ○ | — （省略不可。原点に重なるテーブルが黙って生まれるのを避ける） |
| `comment` | string | — | `""` |
| `columns` | array | ○ | 空でも出す |
| `keys` | array | — | `[]` |

### `tables[].columns[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `name` | string | ○ | — |
| `type` | string | ○ | — （型パレットの **id**。下記） |
| `size` | string | — | `""`（`"11"` / `"10,2"` のような生文字列） |
| `nullable` | boolean | — | `false` |
| `autoincrement` | boolean | — | `false` |
| `default` | string | — | `""`（＝既定値なし）。**引用符は付けない** |
| `comment` | string | — | `""` |
| `references` | array | — | `[]`（この列を子＝ FK 側とする参照） |

### `tables[].columns[].references[]`

| キー | 型 | 必須 |
|---|---|---|
| `table` | string | ○ |
| `column` | string | ○ |

### `tables[].keys[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `type` | string | ○ | — （UI が作るのは `PRIMARY` / `INDEX` / `UNIQUE` / `FULLTEXT` の 4 つ） |
| `name` | string | — | `""` |
| `columns` | array of string | ○ | — |

`type` は **parser も serializer も値を検査しない**（文字列であることだけを見る）。選択肢を持つのは
UI 側（[`../js/keymanager.ts`](../js/keymanager.ts)）で、[`Key`](../js/key.ts) は falsy を `INDEX` に
倒す。**値を列挙して拒まない**というのが §6.3 の判断（段階6-5b）—— 形式側で拒むと、いま開ける
設計が読めなくなる側の変更になる。かわりに生成器が 4 種すべてを受ける。

`name` は空でよい。**空のときだけ**生成器が §6.3 の規約で名前を組む（段階6-5b）。
name 属性の無い XML を読んだ場合も `""` になる（それまでは実行時 `null` が入り、DDL に
`null` という制約名が出ていた）。

## SQL エクスポート規約（HANDOVER §6.3・段階6-5b）

**PostgreSQL のみ。** 未現代化の 4 プロファイル（`mysql` / `mssql` / `oracle` / `sqlite`）は
6-8 でこちら側に移る。規則の実体は [`../js/io/ddl/naming.ts`](../js/io/ddl/naming.ts)。

| 対象 | 名前 | 備考 |
|---|---|---|
| PRIMARY | `<table>_pkey` | PG の自動生成名と一致 |
| UNIQUE | `<table>_<cols>_key` | 同上 |
| INDEX / FULLTEXT | `idx_<table>_<cols>` | `CREATE INDEX` で出す。PG に `KEY (...)` 構文は無い。PG の自動名は `<table>_<cols>_idx` だが、**§6.3 の規約を優先**（index 名はモデルに残るので往復では動かない） |
| FK | `fk_<table>_<参照元の列>` | 列名はテーブル内で一意なので必ず衝突しない。**FK 名はモデルに保存先が無い**（`references[]` は `table` / `column` だけ）ので、外部由来の名前は保持されず必ず組み直される |

いずれも `keys[].name` が空のときだけ。**列を 1 つも持たないキーは 1 文字も出さない**
（`PRIMARY KEY ();` を作らない）。`FULLTEXT` は PG では btree の `CREATE INDEX` に落ちる ——
PG の全文検索索引は `USING gin (to_tsvector(...))` という式インデックスで、モデルは式も
config も持てないため。

### 識別子の引用

`/^[a-z_][a-z0-9_]*$/` に収まり、かつ **PostgreSQL 18 の予約語**（`pg_get_keywords()` の
catcode `R` / `T`。一覧は [`../js/io/ddl/keywords.ts`](../js/io/ddl/keywords.ts)）でなければ**裸**。
それ以外は `"` で囲み、値の中の `"` は `""` にする。テーブル名・列名・制約名・index 名・
FK の参照先まで同じ規則で、`COMMENT ON` だけ別扱いということはない。

house 標準（snake_case・複数形）に従っていれば 1 つも囲まれない。**生成器は識別子を書き換えない**
——「snake_case にする」「複数形にする」を出力側でやると設計と DDL が食い違い、introspection の
往復も壊れる。命名の検査（lint）は 6-9 以降へ送った（CUSTOMIZATIONS.md の段階6-5b）。

## 決定論と diff フレンドリー（CLAUDE.md 制約3）

- **同一モデル → 同一バイト列。** 環境依存の入力を 1 つも持たない
  （XML が持っていた `<!-- Active URL -->` に相当するものが無い）。
- **キー順は上の表の並びに固定**。`JSON.stringify` は挿入順を保つので、serializer の
  オブジェクトリテラル / 代入の並びがそのまま契約になる。
- **整形は 2 スペース、末尾に LF 1 つ、改行は LF。**
- **既定値と同じキーは出さない。** 意味のある差分だけが git diff に出る。
- **1 テーブル = 独立ブロック。** テーブルの追加は、既存部分を 1 バイトも動かさずに
  ブロックが 1 つ増えるだけの差分になる（`tests/browser/json.spec.ts` が実際に確認している）。

## 決めたことと、その理由

### 型は `id` で持つ（`label` でも `sql` 名でもない）

型キーは `db/<db>/datatypes.xml` の `<type id="...">`。**永続化専用の属性**で、`label`（表示名）とも
`sql`（出力する型名）とも独立している。

**なぜ `sql` ではないか。** `sql` は §6 のパレット現代化が**変えることを目的にしている属性**そのもの
（`SERIAL` → identity、`CHAR` → `TEXT`、`TIMESTAMP` → `TIMESTAMPTZ`）。正本ファイルの型キーに
最も不安定な属性を選ぶわけにいかない。加えて `db/postgresql/datatypes.xml` は `sql="BIGINT"` を
**Big Integer と Real の 2 か所**に持つ。4-2b 時点ではこれが後勝ちで Real に化けていた
（known-issue #3。6-2 で先勝ちにして直した）が、**重複そのものは残っている** —— sql 名を
キーにすると「同じ名前の型が 2 つある」という構造をファイル形式が引き受けることになる。

**なぜ `label` ではないか**（4-2 はこれを選び、4-2b で変えた）。label は一意ではあったが**表示名**で、
§6 のパレット現代化で動く。動いた瞬間に git 管理下の設計ファイルが読めなくなる。
さらに実測すると **postgresql と mysql は label を 12 個共有**していた（`Integer` / `Text` /
`Timestamp` / `Char` / `Varchar` / `Decimal` / `Date` / `Time` / `Bit` / `Binary` / 単精度 / 倍精度）ので、
4-2 の「`db` を読んで捨てる」と組み合わさると **PG の設計を mysql パレットで開いたときに
12 型が例外にならず黙って別の型に解決される**（PG の `Text`=`TEXT` → mysql の `Text`=`MEDIUMTEXT`）。
`id` 化と `db` の必須化はこの 2 つを同時に塞ぐためのもので、**片方だけでは成立しない**。

#### `id` の規則

| # | 規則 |
|---|---|
| 1 | `^[a-z][a-z0-9_]{0,31}$` に適合し、パレット内で一意 |
| 2 | 語源はその `<type>` が出力する SQL 型名の正規化（小文字化 → 英数字以外を `_` → 前後の `_` を落とす） |
| 3 | **意味が同じ型の `id` は変えない。意味が変わったら必ず変える。`id` を別の意味で再利用しない** |
| 4 | 規則 2 の結果が衝突する / 語源が壊れている entry には `x_` を付ける（撤去予定の印） |

**規則 3 が唯一の契約**で、`label` と `sql` は §6 がいくらでも動かしてよい。
規則 1 が小文字始まりなのは安全装置でもある —— **現行 5 パレットの label はこの形に 1 つも一致しない**
ので、移行し忘れた `formatVersion: 1` のファイルが「たまたま読めてしまう」ことが原理的に起きない。

4-2b 時点で `x_` が付いているのは実測 2 件だけだった（`postgresql: x_real` ＝ known-issue #3 の本体、
`vfp9: x_integer_not_key`）。6-1 の撤去で `vfp9` が対応 DB から外れ、**6-3 の PG18 パレット
差し替えで `x_real` も消えて 0 件になった**（移行先は `bigint`）。
規則そのものの検査は [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts) で、
6-3 から `sql` と `aka` がパレット内で重複しないことも同じ場所が見る。

`label` が実際に動いたのは 6-3 が最初（`Timestamp w/ TZ` → `Timestamptz`、`Decimal` → `Numeric`）。
**設計ファイルは 1 バイトも影響を受けていない** —— それが規則 3 の目的そのもので、
`fk` を label 参照から id 参照に移した 6-2 の下準備がここで効いている。

#### 初期テーブルテンプレート（**段階6-4 で新設**）

`db/<db>/datatypes.xml` は型パレットに加えて、**新規テーブルの初期列**（HANDOVER §6.2）を持つ。
設計 JSON の形式には現れない —— テンプレートは「作った直後の中身」であって、保存された
ファイルからは普通の列と区別が付かない。ここに書くのは**型キーと同じ `id` 参照の契約**を持つため。

```xml
<datatypes db="postgresql" strict="1" newrowtype="text">
	<template>
		<row name="id" type="uuid" null="0" default="uuidv7()" key="PRIMARY" />
		<row name="created_at" type="timestamp_with_time_zone" null="0" default="now()" />
		<row name="updated_at" type="timestamp_with_time_zone" null="0" default="now()" />
	</template>
```

| 属性 | 意味 |
|---|---|
| `name` | 列名。SQL 識別子なので locale の対象にしない |
| `type` | **型 `id` 参照**（`sql` 名ではない。`fk` と同じ規約）。引けなければ例外 |
| `size` | 省略可。`NUMERIC(12,2)` のような精度 |
| `default` | 既定値。`quote` を当てるかは値が式かどうかで決まる（段階6-4。下記） |
| `null` | 設計 XML の `<row null>` と同じ。`"1"` が NULL 許可 |
| `autoincrement` | 同じく `"1"` が identity |
| `key` | `"PRIMARY"` なら PRIMARY キーに入る。複数行に付ければ複合 PK |

ルート属性 `newrowtype` は「Add row ボタンで足す行の既定型」（同じく `id` 参照）。
テンプレートとは別概念なので `<template>` の中に入れない。**どちらも省略でき、
省略したプロファイルは従来どおり**（初期列は `id` 1 列 ＋ autoincrement、既定型は添字 0）。

**テンプレートを持つのは現代化済み（`strict="1"`）のプロファイルだけ。** 段階6-4 時点では
`postgresql` の 1 本で、未現代化の 4 本は 6-8 で入る（`uuid` 相当の型が `mssql` の
`uniqueidentifier` しか無く、先に決めると 6-8 の現代化方針を先取りすることになるため）。

読むのは [`../js/io/template.ts`](../js/io/template.ts)、`type` / `newrowtype` が実在の `id` で
あることの検査は [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts)。

#### 既定値を `quote` で囲むか（**段階6-4 で規則になった**）

`<type quote="'">` は「文字列型の既定値をリテラルとして囲む」ための属性で、6-4 まで**式にも
当たっていた**。PG18 パレットの `uuid` は `quote="'"` なので、house 既定の `DEFAULT uuidv7()` が
`DEFAULT 'uuidv7()'` になる —— uuid 列に文字列を入れる DDL なので PG が実行時に弾く。
§6.2 のテンプレートは既定値に `uuidv7()` / `now()` を持つため、直さずに入れると
**新規テーブルが必ず壊れた DDL を吐く**。それが 6-4 でここを触った理由。

**strict プロファイルでは、次のいずれかに当たる値を式とみなして囲まない。**

| # | 条件 | 例 |
|---|---|---|
| 1 | 数値リテラル | `0` `-1.5` `1e3` |
| 2 | キーワード（大小無視の完全一致） | `TRUE` `NULL` `CURRENT_TIMESTAMP` `LOCALTIME` |
| 3 | 関数呼び出しの形 | `now()` `uuidv7()` `pg_catalog.now()` |
| 4 | 先頭が `'`（自分で引用符を書いた） | `'{}'::jsonb` |
| 5 | `::` を含む（キャスト） | `ARRAY[]::text[]` |
| 6 | `ARRAY[` で始まる | `ARRAY[1,2]` |

**列挙するのは「囲まない側」だけ**で、判定漏れは「囲む」（＝従来どおり）に倒れる。
未現代化プロファイルは `CURRENT_TIMESTAMP` だけを特例にする従来規則のままで、6-8 で移る。
**囲む側の規則（値の中の `'` をエスケープしない）は 6-4 では直していない** ——
known-issues #11 に隔離してある。**段階6-5a は規則を 1 文字も変えずに
[`../js/io/ddl/shared.ts`](../js/io/ddl/shared.ts) へ移設しただけ**で、囲む側の規則ごと
設計し直すのは 6-5b。

#### パレットを差し替えるときの移行（**規則は段階6-3 で確定**）

読み込み時に**現在の型パレットに無い `id` は例外**にする（known-issues #4 の「一致が無ければ
先頭の型」を持ち込まない）。正本を黙って別の型で開くのが最悪の失敗だから。

§6 でパレットを現代化すると、撤去された型を使っているファイルはここで落ちる。**その段階が
同じ PR で移行を持つ**（移行表とパレットが別の PR に分かれると、その間リポジトリの設計ファイルが
読めない ＝ CLAUDE.md 制約1「半移行を放置しない」に反する）。6-3 が PG18 パレットで
実際にそれをやったので、以下がその規則。

| # | 規則 |
|---|---|
| 1 | **`formatVersion` は上げない。** キーの構造は変わらず値（型 `id`）だけが変わる。移行漏れは「その `id` が現在のパレットに無い」で parser が位置つきに落とすので、版を上げなくても機械判定できる（4-2b は型キーが `label` → `id` と**構造ごと**変わったので上げた） |
| 2 | 表は**プロファイルごと**に持つ（`tools/migrate-design.mjs` の `TYPE_MIGRATIONS`）。型 `id` はプロファイル内で一意なだけなので、`db` を見ずに当てると別プロファイルの同名 `id` を巻き込む |
| 3 | 寄せ先が `length="0"`（サイズを取らない型）なら **`size` キーも落とす**。`char(10)` → `text` で残すと `TEXT(10)` という壊れた DDL が出る。**同じ判断を読み込み側（[`../js/io/xml-parser.ts`](../js/io/xml-parser.ts)）も持つ**ので、両者が食い違うと「移行したファイル」と「XML から読み直したファイル」が別物になる |
| 4 | **表に無い未知の `id` はツールが動かさない。** そのまま残して parser に落とさせる —— ツールが勝手に寄せると、移行表に無い判断を静かに下すことになる |
| 5 | 移行先が現在のパレットに実在することをツールが毎回検算する（表とパレットの食い違いで**黙って読めないファイルを書く**のを止める） |

段階6-3 の表（PG18・7 型）:

| 旧 `id` | 新 `id` | 備考 |
|---|---|---|
| `serial` / `bigserial` | `bigint_identity` | HANDOVER §6.1「`serial` → identity」。`serial` は int4 → int8 に広がる（安全側） |
| `x_real` | `bigint` | 実態が `BIGINT` を出力していた（known-issues #3 の本体） |
| `char` | `text` | §6.1「`char(n)` → `text`」。**`size` が落ちる**（唯一の情報の損失） |
| `timestamp` / `timestamp_without_time_zone` | `timestamp_with_time_zone` | §6.1「`timestamp` → `timestamptz`」。`size` は**残す**（PG の `timestamptz(p)` は秒精度を取れる） |
| `json` | `jsonb` | §6.1「`json` → `jsonb`」 |

4-2b の移行が「`label` → `id`」の全射だったのに対し、この移行は「消えた型をどこに寄せるか」という
意味的判断を含む。**だから表は 6-0 で設計してから 6-3 が実装した**（経緯は
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)）。ツールは 2 種類の移行を同じ 1 パスで適用する
ので、`formatVersion: 1` のファイルは「`label` → `id` → 寄せ先」と連鎖する。

**互換で読む XML 側は別の仕掛けで受ける。** 撤去した型の旧 `sql` 名（`SERIAL` / `CHAR` /
`TIMESTAMP` …）と、`sql` を PG18 の正式名に直した 4 型の旧名（`DECIMAL` / `FLOAT` / `DOUBLE` /
`TIMESTAMP WITH TIME ZONE`）は、`<type aka="…">` の別名として解決する。
移行表が「旧 `id` → 新 `id`」なのに対し `aka` は「旧 `sql` 名 → 新しい型」で、**別物**。
`TIMESTAMP WITH TIME ZONE` は introspection の実出力そのもの（`docs/samples/`）なので、
ここを落とすと information_schema 由来の XML が読めなくなる。

### 参照は名前で持つ

現行 XML と同じく `{table, column}` の名前。**同名のテーブルが 2 つあると復元時に両端が先頭の
テーブルへ解決される既知の不具合**がこの名前解決に由来するが、id 参照へ移すには描画クラス側に
id の発番が要る。「壊れた設計を保存させない」方向の始末は 4-4。

### 「既定値なし」は `""` の 1 通り（`DEFAULT NULL` の内部表現は持たない）

`default` が `""` のときはキーを出さず、読み戻しはキーが無ければ `""` を入れる。

段階4-2 の時点では内部表現が `null`（＝ `DEFAULT NULL`）と `""`（＝既定なし）の 2 つに割れて
いて、JSON はどちらも「キーを出さない」に潰していた —— XML が nullable な行に
`<default>NULL</default>` を生やす不具合（known-issues #2）と、空の `<default>` で壊れた SQL が
出る不具合（#5）を **JSON 経路に最初から持ち込まない**ため。**段階4-5 で `null` を撤去した**ので、
いまは形式・内部表現ともに `""` の 1 通りしかない。

`default` 欄に `"NULL"`（大小問わず）と打った場合、**nullable な列では `""` に潰れる**
（[`Row.update()`](../js/row.ts) の正規化。nullable 列の `DEFAULT NULL` は SQL 上も暗黙の既定と
同義なので情報は失われない）。`NOT NULL` の列では文字列としてそのまま保存される —— 現行の
条件をそのまま残したためで、意図した既定値を勝手に消さないという意味でもこちらが安全側。
正規化は `Row.update()` の 1 箇所だけにあり、parser は読んだ生値を渡す（[`js/io/model.ts`](../js/io/model.ts)）。

## ファイル名（段階4-3b）

**拡張子は `.json`。** server 経路（`?action=save&keyword=…`）は keyword に `.json` を付けて送るので
backend 上のファイルは `<name>.json` になり、ダウンロードは `new-database.json` で落ちる。
`jsonKeyword()`（[`../js/io.ts`](../js/io.ts)）が二重付与を防ぐので、`list` が返した名前を
そのまま prompt に貼っても壊れない。設計の名前（`setTitle` に渡す値）には付けない。

拡張子が要るのは、`.gitattributes` / `.prettierignore` / 移行 glob
（`npm run migrate:design -- schema/*.json`）のいずれもファイルを名指しできないため。
正本の置き場所は各プロダクトのリポジトリの `schema/`（[`BRANCHING.md`](BRANCHING.md)）。

**読み込み側は拡張子を見ない。** 中身の先頭 1 文字で判別する（[`../js/io/detect.ts`](../js/io/detect.ts)）
ので、拡張子なしで保存された 4-3b 以前のファイルも、`.txt` で書き出した旧 XML もそのまま読める。

拡張子の**強制**（`.json` 以外の save を拒む・`list` が `*.json` だけを返す）は正本ディレクトリの
責務なので、Kotlin backend（HANDOVER §5.1）に送ってある。

## 壊れた入力の扱い

parser は**部分的に読み込まない**。次のいずれかで例外を投げ、その時点で開いている設計は変えない
（[`Designer.fromJson()`](../js/wwwsqldesigner.ts) は parse を `clearTables()` より先に置いてある）。

- JSON として構文が壊れている（`JSON.parse` の `SyntaxError` がそのまま出る）
- `formatVersion` が 2 でない
- **`formatVersion` が 1**（下記。移行コマンドを名指しする専用のメッセージ）
- **`db` が実行中の型パレットと違う**
- 必須キーの欠落・型違い（メッセージに `tables[0].columns[2].name` の形で位置が入る）
- 型パレットに無い `type`

例外の message は開発者向けで **locale を通さない**（価値の本体が `tables[0].columns[2].name` の
位置情報で、訳すと壊れるため）。**ユーザーへの見せ方は 4-3b で「見出しだけ locale・詳細は素通し」に
確定した** —— [`../js/io.ts`](../js/io.ts) の `loadDesignText()` が
`alert(_("jsonerror") + ": " + e.message)` に流す。現行の 18 か所と同じ形。

そもそも parser に渡らない入力が 2 つある（[`../js/io/detect.ts`](../js/io/detect.ts) の判別）。
どちらも locale 付きの短い alert で終わり、**開いている設計は変わらない**。

| 入力 | 判別 | 出るもの |
|---|---|---|
| 空（空白と BOM だけを含む） | `empty` | `_("empty")` |
| 先頭が `{` でも `<` でもない | `unknown` | `_("unknownformat")` |

「JSON として読んで駄目なら XML」というフォールバックは**作らない**。壊れた JSON を XML として
読み直すと「Null document」に着地し、ユーザーが直せない位置のメッセージになるため（同ファイル冒頭）。

## 書き出せない設計

serializer 側にも拒否条件がある。いずれも **1 バイトも書かずに例外**で、受け止めは
[`IO.toJsonOrAlert()`](../js/io.ts) 1 か所（失敗したら textarea を空で上書きしたり
空ファイルを保存したりしない）。

- 型パレットに `db` 属性が無い / 型 `id` が無い（4-2b）
- **同名のテーブルが 2 つ以上ある**（4-4）

同名テーブルを拒むのは、上の `references` が**名前参照**だから。同名があると読み戻したときに
参照先が常に先頭のテーブルへ解決され、**名前は合っているのに設計が変わる**。形式を id 参照へ
移して直す案は 4-2 で採らなかった（id の発番が描画クラス側に要り、「4-2 以降はライブ側を
触らない」という 4-1c の申し送りを破る）ので、**壊れた設計をファイルに書かせない**方向で始末する。
正本が git 管理のファイルである以上、黙って壊れたものをコミットさせるほうが害が大きい。

### `formatVersion: 1` は後方互換で読まない

4-2 が書いた版 1 のファイルは、**parser がアップグレードせずに落とす**。移行は
[`../tools/migrate-design.mjs`](../tools/migrate-design.mjs) を通す。

```bash
npm run migrate:design -- schema/*.json
```

実行時に黙ってアップグレードすると、開いて保存し直すまでファイルは旧世代のままで、
リポジトリ内に 2 世代が混在し「どれが移行済みか」を機械判定できない（CLAUDE.md 制約2 は
正本が git 管理のファイルであることを要求している）。かつ**意味の変化が `git diff` に出ない** ——
制約3 が避けたい形そのもの。**移行は 1 コミットとして出す**。parser が持つ後方互換は、
このコマンドを名指しする例外メッセージ 1 つだけ。

ツールは冪等（v2 のファイルは触らない）で、**serializer が書いた正規形でない入力は変換せずに落とす**
（手編集されたファイルを書き直すと、数値リテラルの表記揺れのような意図しない差分が移行コミットに
紛れ込むため）。変換されるのは `formatVersion` の行と `columns[].type` の行だけで、それ以外は
キーの位置も値も動かない。

## 保存の前に読む（外部変更検知・段階4-6）

正本が git 管理のファイルである以上、**他人の PR を `git pull` で取り込んだ後に古い編集状態のまま
保存すると、相手の変更が黙って消える**。HANDOVER §4 はこれを「ファイルが app 外で変化したら検知し
再読込を促す。古い編集状態でファイルを上書きしない」と定義していて、**server 経路の save
（`#serversave` と F2 の `#quicksave`）は保存の前に同じ名前を 1 回 load する**。

判定は [`verdictForSave()`](../js/io/conflict.ts)（純関数）の 4 値で、confirm を出すかどうかは
[`../js/io.ts`](../js/io.ts) の `preflightresponse()` が決める。

| 判定 | 状況 | 挙動 |
|---|---|---|
| `absent` | サーバに無い（404） | そのまま保存（新規保存の正常系） |
| `clean` | 最後に観測した版と一致 | そのまま保存 |
| `exists` | 派生元を持たない名前に実体がある | **confirm**（他人／別セッションのファイルを踏む） |
| `conflict` | 観測した後に外部で変わった | **confirm**（本機能の主眼） |

- 台帳（派生元）は **keyword ごとの Map ではなく 1 本**。「今の編集セッションの派生元」という
  意味づけで、別名で保存すれば派生元も移る。載せるのは load / save で**実際に観測したバイト列**。
- **500 / 501 / 503 は中止**する。読めなかったものを「無かったこと」にして上書きするのは、
  本機能が防ぎたいことそのもの。
- 衝突しても**上書きの道は残す**（confirm で承諾すれば保存される）。正本は git なので復元できる ——
  ただし無言では通さない。
- **TOCTOU の窓は残る**（プリフライトと save の間に他者が書けば、そちらが負ける）。閉じるには
  backend 側の条件付き更新が要るので、ETag ＋ `If-Match`（不一致は 412）を Kotlin 実装
  （HANDOVER §5.1）へ申し送ってある。**そこでプリフライトは 1 往復に畳める。**
- **時間駆動にしない**（CLAUDE.md 制約2）。定期ポーリングも自動再読込も入れない ——
  編集中に勝手に読み直すと、pull 上書き事故を「編集の消失」という別の形で作り直すことになる。

対象は **server 経路だけ**。localStorage・ダウンロード・クリップボードは app の外で書き換わる
経路を持たない（あるいは書き換わっても上書き先が無い）ので、プリフライトを投げない。

## テスト

[`../tests/browser/json.spec.ts`](../tests/browser/json.spec.ts)（golden の権威）と
[`../tests/node/json.test.ts`](../tests/node/json.test.ts)（高速回帰）。golden は
`tests/golden/json/<fixture>.json` の 7 本。詳細は [`TESTING.md`](TESTING.md)。

`id` 規則そのものは [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts) が
全プロファイルについて押さえ、移行ツールの規則は
[`../tests/node/migrate-design.test.ts`](../tests/node/migrate-design.test.ts) が見る。
**ツールが serializer と同じバイト列を書くこと**の根拠は golden テスト —— `tests/golden/json/` の
7 本はツールで移行したもので、それが serializer の出力と一致するかを毎回見ている。

**「JSON が XML と同じ情報を運ぶ」ことの根拠は「情報保存」テスト** —— 同じ fixture を
XML 経由（`toXML` → `fromXML`）と JSON 経由（`toJson` → `fromJson`）で往復させ、
ライブツリー＋DOM の状態スナップショットがバイト一致することを 7 fixture すべてで確認している。

形式の外側 2 つは別のテストが見る。判別（`{` / `<` / 空 / それ以外）は
[`../tests/node/detect.test.ts`](../tests/node/detect.test.ts)、外部変更検知は
[`../tests/node/conflict.test.ts`](../tests/node/conflict.test.ts)（判定の純関数）と
[`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts)（仮想 backend を相手に
プリフライト → confirm → save の往復を通す）。
