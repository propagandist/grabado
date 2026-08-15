# tests/known-issues — 現行コードの既知の不具合

HANDOVER §7 の特性化テストのうち、**「移植で保存すべき挙動」ではないもの**をここに隔離する。

`tests/golden/` は「移植で変わってはいけない挙動」の記録なので、不具合をそこに焼くと
*期待される正しい出力* に見えてしまう。そのためここでは **golden ファイルを持たず**、
「現在こう壊れている」ことをテストコード内のリテラルで直接アサートする。

```
npm run known-issues     # ここだけを走らせる（npm test / npm run test:browser には含まれない）
```

## 運用

移植（HANDOVER §4 IO 再実装 / §6 型パレット・エクスポート規約）で不具合を直すと、
**このテストが赤くなる**。それが正しい。手順は次のとおり。

1. 赤くなったテストの内容を読み、意図した修正で直ったのかを確認する。
2. 直ったことを [`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md) の決定ログに記録する。
3. 該当テストを削除、または「直った後の挙動」のアサートに書き換える。
4. 影響が `tests/golden/` に出る場合は、**実ブラウザで** `npm run golden:update` して差分をレビューする。

黙って消さない。消えた記録は「そもそも壊れていなかった」ことにされてしまう。

## 収録している不具合

| # | 現象 | 原因 | 経路 | 直る予定 |
|---|---|---|---|---|
| 3 | `BIGINT` が Big Integer ではなく **Real** に解決される | [db/postgresql/datatypes.xml](../../db/postgresql/datatypes.xml) が `sql="BIGINT"` を 2 か所に持ち、照合ループが `break` しないので後勝ち（[js/io/xml-parser.ts:147-153](../../js/io/xml-parser.ts#L147-L153)）。`re` もアンカー無しの部分一致 | **XML 読込のみ** | §6.1 |
| 4 | 型パレットに無い型は黙って先頭の型になる（`UUID` → `INTEGER`） | 一致が無いと初期値 `type: 0` が残る（[js/io/xml-parser.ts:125](../../js/io/xml-parser.ts#L125)）。現行 PG パレットに uuid が無い | **XML 読込のみ** | §6.1 |
| 5 | 空の `<default></default>` で ` DEFAULT ` だけが残る壊れた SQL が出る | [db/postgresql/output.xsl:58-64](../../db/postgresql/output.xsl#L58-L64) が要素の存在だけを見る。現行 introspection は値の無いカラムにも空の `<default>` を出す（[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.5） | **introspection 出力のみ** | §6.3 |
| 6 | key が複数あると制約名が `<table>_pkey` で衝突する | [db/postgresql/output.xsl:90-92](../../db/postgresql/output.xsl#L90-L92) が `key/@name` を無視してテーブル名から生成する | DDL 生成 | §6.3 |
| 9 | introspection サンプル（PG18 実出力）が well-formed でなく index も出ない | 余分な `</key>` と index 収集ループの `break`。詳細は [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.6 | introspection | §5.2 |

**「経路」列は §4 段階4-7 の棚卸しで足した。**残る 5 本はどれも現象が消えていないが、
**§4 を通したことで 3 本は届く範囲が狭まっている** —— そのぶん §6 で直すときの影響も狭い。

- **#3 / #4 は設計 JSON では起きない。** 正本フォーマットの型キーは 4-2b で安定 `id` になり、
  [json-parser.ts](../../js/io/json-parser.ts) は**パレットに無い id を throw** する
  （「一致が無ければ添字 0」を持ち込まない）。残っているのは互換で読む XML 経路
  （[xml-parser.ts](../../js/io/xml-parser.ts)）だけで、そこは「現行の挙動を 1 バイトも変えない」
  逐語移設が要件なので**意図して直していない**。テストが XML fixture を読ませているのはこのため。
- **#5 は書き出し側では構造的に起きなくなった**（段階4-5）。`if (row.def)` が `""` を落とすので、
  grabado が書いた XML に空の `<default>` は出ない。残るのは introspection の出力（外部由来の XML）を
  直接 XSLT に食わせる経路だけ。

`PRIMARY` / `UNIQUE` 以外の key type が PostgreSQL で `ADD CONSTRAINT <table>_pkey KEY (...)` に
落ちる件（`INDEX` も `FULLTEXT` も同じ）は #6 と同じ [output.xsl](../../db/postgresql/output.xsl) の
粗さで、**同じ §6.3 で一緒に直す**。テストは足していない —— #6 の fixture が同じ経路を既に踏んでいて、
制約名を直す作業が必ずここを通るため（[docs/FORMAT.md](../../docs/FORMAT.md) の `tables[].keys[]` に記録）。

### 直したもの（このディレクトリから出た不具合）

運用 3 に従い、テストは消さずに「直った後の挙動」のアサートへ書き換えて移設してある。
**§4（IO）が引き受けた分はこの 4 本で尽きている**（段階4-5 の記録）。次にこの表が伸びるのは
§6.1 で、#3 / #4 がそこへ移る。

| # | 現象 | 直した段階 | 移設先（[`../browser/serialize.spec.ts`](../browser/serialize.spec.ts)） |
|---|---|---|---|
| 1 | 識別子に `&` を含めると `toXML()` が well-formed でない XML を吐き、保存したファイルを二度と開けない | §4 段階4-4 | 「識別子に `&` を含んでも well-formed な XML を吐く」 |
| 2 | nullable かつ default 未指定の行が、保存すると `<default>NULL</default>` を獲得する（情報が増える） | §4 段階4-5 | 「既定値の無い行は保存しても `<default>` を獲得しない」＋「nullable な行の default 欄に NULL と打っても `<default>` は出ない」 |
| 7 | `alignTables()` が `tables` を破壊的ソートし、テーブル順と座標を変える | §4 段階4-4 | 「`alignTables()` はテーブル順を変えない」 |
| 8 | `<default>` だけ末尾に改行が付かず diff が読みにくい | §4 段階4-4 | 「`<default>` の後にも改行が入る」 |

`fixtures/` はそのまま残す（`amp-in-name.xml` は移設先のテストが読む）。正常系
[`../fixtures/`](../fixtures/) へ昇格させると DDL golden の母集団が 63 → 72 本に増え、
「DDL golden が無差分」という段階の完了判定がぼやけるため。

### ここに無いが記録済みのもの

- ~~**`<!-- Active URL: ... -->` に `location.href` が入り出力が非決定的**~~
  **§4 段階4-4 で撤去した**（`<datatypes>` の全文埋め込みも同時に）。
  [`../browser/serialize.spec.ts`](../browser/serialize.spec.ts) のテストは主張を反転させ、
  「環境依存が出力に現れない」ことを固定している。golden の正規化も無くなった。
- **`CONFIG.AVAILABLE_DBS` に `web2py` が重複／`DEFAULT_BACKEND` が配列**
  （[js/config.ts:8-19](../../js/config.ts#L8-L19), [js/config.ts:61](../../js/config.ts#L61)）。
  出力に影響しないため今回は記録のみ（[`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md)）。
