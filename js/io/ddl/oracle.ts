/* ------------------------- ddl: oracle ------------------------ */
/*
 * grabado: db/oracle/output.xsl（327 行）の逐語移植（HANDOVER §6 段階6-5a）。
 *
 * 5 本のうち唯一「識別子引用を関数化し（ora_ident）、名前長の制限を意識し
 * （ora_fk_constraint_name）、桁揃えを持つ」プロファイル。他 4 本より一段作り込まれて
 * いるぶん、移植でも写す量が多い。
 *
 * **この 1 本が Node 側の DDL 回帰から外れていた**（tests/node/parity-exceptions.ts）。
 * トップレベルの xsl:variable を xslt-processor が解決できず XPST0008 で落ちるためで、
 * XSLT 1.0 としては正当な書き方だった。TS になるとエンジン差そのものが無くなるので、
 * **oracle は 6-5a で Node 回帰に復帰する**（7 件が skipped から passed へ）。
 *
 * 逐語で持ち込んだ粗さ（直すのは 6-8。CUSTOMIZATIONS.md の段階6-5a の記録）:
 *   - 日本語識別子が ora_ident を素通りして裸で出る（translate() は非 ASCII を変えない）
 *   - 複数列が autoincrement だと同名の CREATE SEQUENCE が重複して出る
 *   - PRIMARY / UNIQUE 以外の key type が ??<type>?? という壊れた SQL になる
 *     （XSLT 側が意図的にそう書いている。「黙って落とすよりは目に見える形で壊す」）
 */

import { replaceSubstring, type DdlTable, type DdlKey } from "./shared.ts";

const QUOTE = '"';
const APOS = "'";
/*                          |"MAXIMUM_ORACLE_COLUMN_NAME_LEN"| */
const PADDING_NAME = "                                "; /* 32 */
/*                          |VARCHAR2(4000 CHAR) |            */
const PADDING_TYPE = "                    "; /* 20 */
const SMALLCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RULE = "-------------------------------------------------------------------------------";

/** XPath の translate($s, $smallcase, $uppercase)。非 ASCII は 1 文字も変えない */
function translateCase(s: string): string {
    let out = "";
    for (const ch of s) {
        const at = SMALLCASE.indexOf(ch);
        out += at === -1 ? ch : UPPERCASE[at]!;
    }
    return out;
}

/** Quotes oracle identifier, if required (if it contains non-uppercase letters) */
function oraIdent(ident: string): string {
    return translateCase(ident) === ident ? ident : QUOTE + ident + QUOTE;
}

/**
 * XPath の substring($padding, 1, $len)。$len が 0 以下なら空文字になる
 * （名前が padding より長いときに負の length を渡す経路がある）。
 */
function pad(padding: string, len: number): string {
    return len <= 0 ? "" : padding.substring(0, len);
}

/**
 * Constructs FK constraint name from 2 table names, fitted into 30 symbols per
 * identifier limitation. XPath は substring(s, start) の start が 1 未満でも
 * 「位置が start 以上の文字」を返すので、13 文字に満たない名前は全体が残る。
 */
function oraFkConstraintName(tblFr: string, tblTo: string): string {
    return oraIdent("FK_" + tail13(tblFr) + "_" + tail13(tblTo));
}

function tail13(name: string): string {
    const start = 1 + name.length - (30 - 4) / 2;
    return name.substring(Math.max(0, start - 1));
}

function quoteComment(comment: string): string {
    return replaceSubstring(comment, APOS, APOS + APOS);
}

export function generateOracle(tables: readonly DdlTable[]): string {
    let out = "";

    /*
     * Generate commented DROPs for same objects that later would be created.
     * This is useful when re-creating DB schema.
     */
    if (tables.length > 0) {
        out += "\n/*";

        for (const table of tables) {
            for (const row of table.rows) {
                for (const rel of row.relations) {
                    out += "\nALTER TABLE " + oraIdent(table.name);
                    out += " DROP CONSTRAINT " + oraFkConstraintName(table.name, rel.table);
                    out += ";";
                }
            }
        }

        for (const table of tables) {
            out += "\nDROP TABLE " + oraIdent(table.name) + " PURGE;";
            for (const row of table.rows) {
                if (row.autoincrement) {
                    out += "\nDROP SEQUENCE " + oraIdent("SQ_" + table.name) + ";";
                }
            }
        }

        out += "\n-- */";
    }

    /* <!-- tables --> */
    for (const table of tables) {
        out += "\n";
        out += "\n" + RULE;
        out += "\n--            " + table.name;
        out += "\n" + RULE;
        out += "\n";
        out += "\nCREATE TABLE " + oraIdent(table.name) + " (";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            out += i === 0 ? "\n    " : "\n  , ";
            out += oraIdent(row.name);

            /* 桁揃えは ora_ident 適用前の生の名前長で決まる（現行どおり） */
            out += pad(PADDING_NAME, PADDING_NAME.length - row.name.length) + row.datatype;

            if (row.hasDefault && row.def !== "NULL") {
                out +=
                    pad(PADDING_TYPE, PADDING_TYPE.length - row.datatype.length) +
                    "DEFAULT " +
                    row.def;
            }
            if (!row.nullable) {
                out += pad(PADDING_TYPE, PADDING_TYPE.length - row.datatype.length) + "NOT NULL";
            }
        }

        /* <!-- keys --> */
        for (let k = 0; k < table.keys.length; k++) {
            out += "\n  , CONSTRAINT ";
            out += keyConstraint(table.keys[k]!, table.name, k + 1);
        }

        out += "\n);\n";

        if (table.comment) {
            out += "\nCOMMENT ON TABLE  " + oraIdent(table.name);
            /* ここだけ padding を切らずに 32 スペースまるごと連結する（現行どおり） */
            out += PADDING_NAME + " IS " + APOS;
            out += quoteComment(table.comment);
            out += APOS + ";";
        }

        for (const row of table.rows) {
            if (row.comment) {
                out += "\nCOMMENT ON COLUMN " + oraIdent(table.name);
                out += "." + oraIdent(row.name);
                out += pad(PADDING_NAME, PADDING_NAME.length - row.name.length) + "IS " + APOS;
                out += quoteComment(row.comment);
                out += APOS + ";";
            }
        }

        const aiRows = table.rows.filter((r) => r.autoincrement);
        if (aiRows.length > 0) {
            out += "\n";

            /* create auto increment sequence */
            for (let s = 0; s < aiRows.length; s++) {
                out += "\nCREATE SEQUENCE " + oraIdent("SQ_" + table.name) + ";";
            }

            /* create auto increment trigger */
            out += "\n";
            out += "\nCREATE OR REPLACE TRIGGER " + oraIdent("TG_" + table.name + "_BI");
            out += "\n    BEFORE INSERT ON " + oraIdent(table.name);
            out += "\n    FOR EACH ROW";
            out += "\nBEGIN";
            for (const row of aiRows) {
                out += "\n    if :NEW." + oraIdent(row.name) + " is NULL then";
                out += "\n        :NEW." + oraIdent(row.name) + " := ";
                out += oraIdent("SQ_" + table.name) + ".nextVal;";
                out += "\n    end if;";
            }
            out += "\nEND;";
            out += "\n/";
            out += "\n";
            out += "\nSHOW ERRORS;";
        }
    }

    /* Generate all FKs in the end - when all tables are present */
    const withRelations = tables.filter((t) => t.rows.some((r) => r.relations.length > 0));
    if (withRelations.length > 0) {
        out += "\n";
        out += "\n" + RULE;
        out += "\n";
    }
    for (const table of withRelations) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                out += "\nALTER TABLE " + oraIdent(table.name);
                out += " ADD CONSTRAINT " + oraFkConstraintName(table.name, rel.table);
                out += " FOREIGN KEY ( " + oraIdent(row.name);
                out += " ) REFERENCES " + oraIdent(rel.table);
                out += " ( " + oraIdent(rel.row) + " );";
            }
        }
    }

    return out;
}

function keyConstraint(key: DdlKey, tableName: string, position: number): string {
    /*
     * XSLT の <xsl:if test="@name"> は「属性が在るか」なので、値が空でも真になり
     * ora_ident("") が呼ばれる（結果は空文字）。grabado が書く <key> は必ず name 属性を
     * 持つので、実質「値が空なら下の invent へ落ちる」と同じ挙動になる。
     */
    let out = oraIdent(key.name);

    if (key.type === "PRIMARY") {
        if (key.name === "") {
            /* if PK KEY constraint name was NOT specified - invent it */
            out += oraIdent("PK_" + tableName);
        }
        out += " PRIMARY KEY";
    } else if (key.type === "UNIQUE") {
        if (key.name === "") {
            /* if QU KEY constraint name was NOT specified - invent it */
            out += oraIdent("UQ_" + position);
        }
        out += " UNIQUE";
    } else {
        /* if other? KEY constraint name was NOT specified - invent it */
        if (key.name === "") {
            out += oraIdent("KK_" + position);
        }
        out += " ??" + key.type + "??";
    }

    out += " ( ";
    out += key.parts.map(oraIdent).join(", ");
    out += " )";
    return out;
}
