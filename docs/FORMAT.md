# FORMAT.md — 設計 JSON（`formatVersion: 2`）

grabado の**正本フォーマット**。git 管理のファイルとして保存され、共有は PR で行う
（CLAUDE.md 制約2）。読み書きは [`../js/io/json-serializer.ts`](../js/io/json-serializer.ts) と
[`../js/io/json-parser.ts`](../js/io/json-parser.ts) の 2 本だけを通る。形の定義（キー順の契約を含む）は
[`../js/io/json-format.ts`](../js/io/json-format.ts) が正本で、本書はその散文版。

> 状態: **§4 段階4-2 で新設し、4-2b で型キーを安定 `id` に移した。UI にはまだ配線されていない**
> （保存 / 読込ボタンは XML のまま）。切り替えは 4-3。本書は 4-7 で仕上げる。

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
成立しない。UI が食い違いに何をするか（そのパレットを取り直して開く / 拒むだけ）は 4-3 の判断で、
形式側は「黙って別の型で開かない」ことだけを保証する。

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
| `default` | string | — | 既定値なし。**引用符は付けない** |
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
| `type` | string | ○ | — （`PRIMARY` / `UNIQUE` / `INDEX`） |
| `name` | string | — | `""` |
| `columns` | array of string | ○ | — |

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
**Big Integer と Real の 2 か所**に持ち、照合ループが `break` しないので後勝ちになる
（known-issues #3）—— sql 名で焼くと Big Integer → `"BIGINT"` → Real にドリフトする。

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
規則 1 が小文字始まりなのは安全装置でもある —— **現行 9 パレットの label はこの形に 1 つも一致しない**
ので、移行し忘れた `formatVersion: 1` のファイルが「たまたま読めてしまう」ことが原理的に起きない。

4-2b 時点で `x_` が付いているのは実測 2 件だけ（`postgresql: x_real` ＝ known-issue #3 の本体、
`vfp9: x_integer_not_key`）。§6 で各プロファイルを現代化すると 0 件になる。
規則そのものの検査は [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts)。

#### パレットを差し替えるときの移行

読み込み時に**現在の型パレットに無い `id` は例外**にする（known-issues #4 の「一致が無ければ
先頭の型」を持ち込まない）。正本を黙って別の型で開くのが最悪の失敗だから。

§6 でパレットを現代化すると、撤去された型を使っているファイルはここで落ちる。**その段階が
同じ PR で移行を持つ**（移行表とパレットが別の PR に分かれると、その間リポジトリの設計ファイルが
読めない ＝ CLAUDE.md 制約1「半移行を放置しない」に反する）。移行表の形と規則は 6-7 の着手時に決める
—— 4-2b の移行が「label → id」の全射だったのに対し、§6 の移行は「消えた型をどこに寄せるか」という
意味的判断を含むので、形が違う。

### 参照は名前で持つ

現行 XML と同じく `{table, column}` の名前。**同名のテーブルが 2 つあると復元時に両端が先頭の
テーブルへ解決される既知の不具合**がこの名前解決に由来するが、id 参照へ移すには描画クラス側に
id の発番が要る。「壊れた設計を保存させない」方向の始末は 4-4。

### `default` は `null` と `""` を区別しない

どちらも「既定値なし」としてキーを出さない。現行 XML が nullable な行に
`<default>NULL</default>` を生やす不具合（known-issues #2）と、空の `<default>` で壊れた SQL が
出る不具合（#5）を **JSON 経路に最初から持ち込まない**ため。読み戻しは `null` を入れ、
[`Row.update()`](../js/row.ts) の既存規則（`!nullable` かつ `def === null` なら `""`）が正規化する。

## 壊れた入力の扱い

parser は**部分的に読み込まない**。次のいずれかで例外を投げ、その時点で開いている設計は変えない
（[`Designer.fromJson()`](../js/wwwsqldesigner.ts) は parse を `clearTables()` より先に置いてある）。

- JSON として構文が壊れている（`JSON.parse` の `SyntaxError` がそのまま出る）
- `formatVersion` が 2 でない
- **`formatVersion` が 1**（下記。移行コマンドを名指しする専用のメッセージ）
- **`db` が実行中の型パレットと違う**
- 必須キーの欠落・型違い（メッセージに `tables[0].columns[2].name` の形で位置が入る）
- 型パレットに無い `type`

例外の message は開発者向けで locale を通さない。ユーザーへの見せ方は 4-3 で決める。

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
