CREATE TABLE [顧客] (
  [id] int NOT NULL ,
  [氏名] nvarchar(255) NOT NULL , -- 姓と名は分けない
  [say "hi"] nvarchar(255) , -- 識別子に " が入る場合の属性エスケープ確認
  [メモ] nvarchar(4000)  -- 顧客の'愛称'をここに書く, 
CONSTRAINT 顧客_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO