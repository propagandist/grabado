CREATE TABLE `顧客` (
  id INT NOT NULL,
  `氏名` VARCHAR(255) NOT NULL COMMENT '姓と名は分けない',
  `say "hi"` VARCHAR(255) NULL COMMENT '識別子に " が入る場合の属性エスケープ確認',
  `メモ` LONGTEXT NULL COMMENT '顧客の''愛称''をここに書く',
  PRIMARY KEY (id)
) COMMENT '顧客マスタ。''仮登録'' の状態も含む';