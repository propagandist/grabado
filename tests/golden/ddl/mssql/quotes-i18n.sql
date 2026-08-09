CREATE TABLE [顧客] (
  [id] bigint NOT NULL ,
  [氏名] tinyint NOT NULL , -- 姓と名は分けない
  [say "hi"] tinyint , -- 識別子に " が入る場合の属性エスケープ確認
  [メモ] tinyint  -- 顧客の'愛称'をここに書く, 
CONSTRAINT 顧客_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO