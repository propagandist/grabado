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

| # | 現象 | 原因 | 直る予定 |
|---|---|---|---|
| 1 | 識別子に `&` を含めると `toXML()` が well-formed でない XML を吐き、保存したファイルを二度と開けない | 属性値のエスケープが `"` → `&quot;` だけ（[js/table.js:277](../../js/table.js#L277), [js/row.js:390](../../js/row.js#L390)）。`<datatype>` と `<part>` は完全に無エスケープ | §4 |
| 2 | nullable かつ default 未指定の行が、保存すると `<default>NULL</default>` を獲得する（情報が増える） | コンストラクタ既定 `def = null`（[js/row.js:13](../../js/row.js#L13)）を `toXML` が `NULL` として書き出す（[js/row.js:403-412](../../js/row.js#L403-L412)） | §4 |
| 3 | `BIGINT` が Big Integer ではなく **Real** に解決される | [db/postgresql/datatypes.xml](../../db/postgresql/datatypes.xml) が `sql="BIGINT"` を 2 か所に持ち、照合ループが `break` しないので後勝ち（[js/row.js:455-462](../../js/row.js#L455-L462)）。`re` もアンカー無しの部分一致 | §6.1 |
| 4 | 型パレットに無い型は黙って先頭の型になる（`UUID` → `INTEGER`） | 一致が無いと初期値 `type: 0` が残る（[js/row.js:438](../../js/row.js#L438)）。現行 PG パレットに uuid が無い | §6.1 |
| 5 | 空の `<default></default>` で ` DEFAULT ` だけが残る壊れた SQL が出る | [db/postgresql/output.xsl:58-64](../../db/postgresql/output.xsl#L58-L64) が要素の存在だけを見る。現行 introspection は値の無いカラムにも空の `<default>` を出す（[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.5） | §6.3 |
| 6 | key が複数あると制約名が `<table>_pkey` で衝突する | [db/postgresql/output.xsl:90-92](../../db/postgresql/output.xsl#L90-L92) が `key/@name` を無視してテーブル名から生成する | §6.3 |
| 7 | `alignTables()` が `tables` を破壊的ソートし、テーブル順と座標を変える | [js/wwwsqldesigner.js:293-295](../../js/wwwsqldesigner.js#L293-L295)。[js/io.js:679](../../js/io.js#L679) の `importresponse` がロード後に呼ぶため、サーバ import 経由で開くと保存 XML の順序が変わる | §4 |
| 8 | `<default>` だけ末尾に改行が付かず diff が読みにくい | [js/row.js:411](../../js/row.js#L411)。HANDOVER §4「1テーブル=独立ブロック・diff フレンドリー」に反する | §4 |
| 9 | introspection サンプル（PG18 実出力）が well-formed でなく index も出ない | 余分な `</key>` と index 収集ループの `break`。詳細は [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.6 | §5.2 |

### ここに無いが記録済みのもの

- **`<!-- Active URL: ... -->` に `location.href` が入り出力が非決定的**
  （[js/wwwsqldesigner.js:329](../../js/wwwsqldesigner.js#L329)）。
  golden の正規化契約そのものなので、[`../browser/serialize.spec.ts`](../browser/serialize.spec.ts) の
  「非決定性の所在」テストで固定している。§4 の決定論要件で撤去される。
- **`CONFIG.AVAILABLE_DBS` に `web2py` が重複／`DEFAULT_BACKEND` が配列**
  （[js/config.js:2-14](../../js/config.js#L2-L14), [js/config.js:55](../../js/config.js#L55)）。
  出力に影響しないため今回は記録のみ（[`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md)）。
