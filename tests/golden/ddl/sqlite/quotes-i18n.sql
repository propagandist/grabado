CREATE TABLE "顧客" (
  id INTEGER NOT NULL,
  "氏名" TEXT NOT NULL,
  "say ""hi""" TEXT,
  "メモ" TEXT,
  CONSTRAINT "顧客_pkey" PRIMARY KEY (id)
) STRICT;

-- "顧客": 顧客マスタ。'仮登録' の状態も含む
-- "顧客"."氏名": 姓と名は分けない
-- "顧客"."say ""hi""": 識別子に " が入る場合の属性エスケープ確認
-- "顧客"."メモ": 顧客の'愛称'をここに書く