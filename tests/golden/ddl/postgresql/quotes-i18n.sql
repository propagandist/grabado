CREATE TABLE "顧客" (
 id INTEGER NOT NULL,
 "氏名" TEXT NOT NULL,
 "say ""hi""" TEXT,
 "メモ" TEXT
);


ALTER TABLE "顧客" ADD CONSTRAINT "顧客_pkey" PRIMARY KEY (id);
COMMENT ON TABLE "顧客" IS '顧客マスタ。''仮登録'' の状態も含む';
COMMENT ON COLUMN "顧客"."氏名" IS '姓と名は分けない';
COMMENT ON COLUMN "顧客"."say ""hi""" IS '識別子に " が入る場合の属性エスケープ確認';
COMMENT ON COLUMN "顧客"."メモ" IS '顧客の''愛称''をここに書く';