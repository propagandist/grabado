# FORMAT.md — 設計 JSON（`formatVersion: 1`）

grabado の**正本フォーマット**。git 管理のファイルとして保存され、共有は PR で行う
（CLAUDE.md 制約2）。読み書きは [`../js/io/json-serializer.ts`](../js/io/json-serializer.ts) と
[`../js/io/json-parser.ts`](../js/io/json-parser.ts) の 2 本だけを通る。形の定義（キー順の契約を含む）は
[`../js/io/json-format.ts`](../js/io/json-format.ts) が正本で、本書はその散文版。

> 状態: **§4 段階4-2 で新設。UI にはまだ配線されていない**（保存 / 読込ボタンは XML のまま）。
> 切り替えは 4-3。本書は 4-7 で仕上げる。

## 例

```json
{
  "formatVersion": 1,
  "db": "postgresql",
  "tables": [
    {
      "name": "employees",
      "x": 20,
      "y": 20,
      "comment": "従業員",
      "columns": [
        { "name": "id", "type": "Integer" },
        {
          "name": "manager_id",
          "type": "Integer",
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
| `formatVersion` | `1` | ○ | 形式の版。**1 以外は読み込みを拒む** |
| `db` | string | — | 書き出したときの型パレット（`db/<db>/datatypes.xml` の `db` 属性）。パレット全文は入れない |
| `tables` | array | ○ | 空でも出す（`"tables": []`） |

`db` は読み込み時に**読んで捨てる**。実行中のパレットと食い違うときに何をするかは 4-3 の判断。

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
| `type` | string | ○ | — （型パレットの **label**。下記） |
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

### 型は `label` で持つ（`sql` 名ではない）

`db/postgresql/datatypes.xml` は `sql="BIGINT"` を **Big Integer と Real の 2 か所**に持ち、
現行の照合ループは `break` しないので後勝ちになる（known-issues #3）。型を sql 名で焼くと
Big Integer → `"BIGINT"` → Real にドリフトする。`label` は 9 DB すべてで一意であることを実測済みで、
JSON 経路ではこのドリフトが起きない。

読み込み時に**現在の型パレットに無い label は例外**にする（known-issues #4 の「一致が無ければ
先頭の型」を持ち込まない）。正本を黙って別の型で開くのが最悪の失敗だから。
§6.1 で PostgreSQL 18 パレットへ差し替えると旧 label のファイルはここで落ちる —— その移行は §6.1 の仕事。

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
- `formatVersion` が 1 でない
- 必須キーの欠落・型違い（メッセージに `tables[0].columns[2].name` の形で位置が入る）
- 型パレットに無い `type`

例外の message は開発者向けで locale を通さない。ユーザーへの見せ方は 4-3 で決める。

## テスト

[`../tests/browser/json.spec.ts`](../tests/browser/json.spec.ts)（golden の権威）と
[`../tests/node/json.test.ts`](../tests/node/json.test.ts)（高速回帰）。golden は
`tests/golden/json/<fixture>.json` の 7 本。詳細は [`TESTING.md`](TESTING.md)。

**「JSON が XML と同じ情報を運ぶ」ことの根拠は「情報保存」テスト** —— 同じ fixture を
XML 経由（`toXML` → `fromXML`）と JSON 経由（`toJson` → `fromJson`）で往復させ、
ライブツリー＋DOM の状態スナップショットがバイト一致することを 7 fixture すべてで確認している。
