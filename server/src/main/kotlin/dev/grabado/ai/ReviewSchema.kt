package dev.grabado.ai

import com.anthropic.core.JsonValue
import tools.jackson.databind.json.JsonMapper

/**
 * structured outputs のスキーマ（段階11-2b。`docs/ARCHITECTURE.md` §8.3）。
 *
 * ★ **定数として持つ。動的に組み立てない**（段階11-0 の決めたこと 1）。理由は 2 つ ——
 *   新しいスキーマは初回に**コンパイル費用**が乗り以後 24 時間キャッシュされること、そして
 *   1 バイトでも動かすとそのキャッシュが無効になること。
 *
 * ★ **`op` を `enum` で閉じることが、そのまま「AI は列挙の外を書けない」の実体**（決めたこと 6）。
 *   `drop-table` / `drop-column` は**スキーマに存在しないので生成できない** —— 実行時の検査では
 *   なく形式で潰している。これは org security-baseline §5.2「取り込んだ文書をそのまま
 *   プロンプトに入れる（＝指示の混入）」への答えでもある：**設計のコメントに何が書かれていても、
 *   出力の形は enum の内側に留まる。**
 *
 * ★ **`js/io/ai/suggestion.ts` と同じ語彙**でなければならない。片方だけ動かすと「通る提案が
 *   適用できない」になるので、[ReviewSchemaTest] が両方から語を抜いて突き合わせる。
 *
 * ## 書ける範囲（Claude の JSON Schema サブセット）
 *
 * 使えるのは基本型 ／ `enum` ／ `const` ／ `anyOf` ／ `allOf` ／ `$ref`。**全オブジェクトに
 * `additionalProperties: false` が要る。** 再帰・数値制約（`minimum`）・文字列長制約は使えない
 * —— **件数の上限はスキーマではなくサーバ側で切る**（`AiProperties`）。
 *
 * `$defs` を使わずインラインで書いてあるのは、参照が 1 か所ずつしか無く、
 * **1 枚読めば全部分かる**ほうがこの大きさでは読みやすいため。
 */
object ReviewSchema {

    /** 提案の入れ物のキー（ルートは配列にできないので 1 段包む）。 */
    const val ROOT_PROPERTY: String = "suggestions"

    /** `js/io/ai/suggestion.ts` の `AiCategory` と同じ 7 語。 */
    val CATEGORIES: List<String> = listOf(
        "type_smell",
        "missing_index",
        "naming",
        "normalization",
        "missing_audit",
        "missing_pk",
        "fk_gap",
    )

    /** 同じく `AiSeverity`。 */
    val SEVERITIES: List<String> = listOf("info", "warn", "error")

    /** 同じく `AiPatch` の `op`。**閉じた 8 種で、破壊的な op は存在しない。** */
    val OPS: List<String> = listOf(
        "rename-table",
        "rename-column",
        "change-type",
        "add-column",
        "add-key",
        "set-nullable",
        "set-default",
        "add-comment",
    )

    /** 同じく `AiKeyType`。`FULLTEXT` は入れない（PG では btree の index に落ちるだけ）。 */
    val KEY_TYPES: List<String> = listOf("PRIMARY", "UNIQUE", "INDEX", "FOREIGN")

    /**
     * スキーマ本体。**このバイト列が変わると上流のスキーマキャッシュが無効になる**ので、
     * 意味の無い整形をしない。
     */
    val JSON: String = """
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["suggestions"],
          "properties": {
            "suggestions": {
              "type": "array",
              "description": "設計への指摘。指摘が無ければ空配列。設計に実在しないテーブルや列を対象にしてはならない。",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["category", "severity", "target", "rationale"],
                "properties": {
                  "category": {
                    "type": "string",
                    "description": "指摘の分類。",
                    "enum": ${json(CATEGORIES)}
                  },
                  "severity": {
                    "type": "string",
                    "description": "error は「そのままでは壊れている」、warn は「規約から外れている」、info は「検討の余地がある」。",
                    "enum": ${json(SEVERITIES)}
                  },
                  "target": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["table"],
                    "properties": {
                      "table": { "type": "string", "description": "設計に実在するテーブル名。" },
                      "column": { "type": "string", "description": "列に掛かる指摘だけが持つ。テーブル全体への指摘では省く。" }
                    }
                  },
                  "rationale": {
                    "type": "string",
                    "description": "日本語で 1〜3 文。なぜそれが問題なのかを書く。「〜すべき」だけで理由の無い文にしない。"
                  },
                  "patch": {
                    "description": "承認されたら機械的に当てられる変更。人が判断するしかない指摘では省く。",
                    "anyOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "name"],
                        "properties": {
                          "op": { "const": "rename-table" },
                          "name": { "type": "string", "description": "新しいテーブル名。snake_case・複数形。" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "name"],
                        "properties": {
                          "op": { "const": "rename-column" },
                          "name": { "type": "string", "description": "新しい列名。snake_case。" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "sqlType"],
                        "properties": {
                          "op": { "const": "change-type" },
                          "sqlType": { "type": "string", "description": "解決済みの SQL 型名（例 TEXT / TIMESTAMPTZ / UUID）。その dialect に実在する名前だけ。" },
                          "size": { "type": "string", "description": "サイズを取る型のときだけ。例 255" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "name", "sqlType"],
                        "properties": {
                          "op": { "const": "add-column" },
                          "name": { "type": "string" },
                          "sqlType": { "type": "string" },
                          "size": { "type": "string" },
                          "nullable": { "type": "boolean", "description": "省略すると NOT NULL。" },
                          "default": { "type": "string", "description": "既定値の式。省略または空文字で「既定なし」。" },
                          "comment": { "type": "string" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "keyType"],
                        "properties": {
                          "op": { "const": "add-key" },
                          "keyType": {
                            "type": "string",
                            "description": "FOREIGN のときは target.column が子（参照する側）で references が親。それ以外は columns が要る。",
                            "enum": ${json(KEY_TYPES)}
                          },
                          "columns": {
                            "type": "array",
                            "description": "PRIMARY / UNIQUE / INDEX のとき必須。設計に実在する列名を並べる。",
                            "items": { "type": "string" }
                          },
                          "references": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["table", "column"],
                            "description": "FOREIGN のとき必須。参照先（親）。",
                            "properties": {
                              "table": { "type": "string" },
                              "column": { "type": "string" }
                            }
                          }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "nullable"],
                        "properties": {
                          "op": { "const": "set-nullable" },
                          "nullable": { "type": "boolean" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "value"],
                        "properties": {
                          "op": { "const": "set-default" },
                          "value": { "type": "string", "description": "既定値の式。空文字は「既定を外す」。" }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["op", "value"],
                        "properties": {
                          "op": { "const": "add-comment" },
                          "value": { "type": "string", "description": "日本語のコメント。空文字は受け付けられない。" }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
    """.trimIndent()

    /** SDK に渡す形。`JsonValue` は Jackson で読んだ Map をそのまま包める。 */
    fun asJsonValue(): JsonValue = JsonValue.from(mapper.readValue(JSON, Map::class.java))

    private val mapper = JsonMapper()

    private fun json(values: List<String>): String = values.joinToString(", ", "[", "]") { "\"$it\"" }
}
