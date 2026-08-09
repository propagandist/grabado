--
-- CUBRID SQL Script
--

-- Table `顧客`

-- DROP TABLE `顧客`;

CREATE TABLE `顧客` (
  `id` INTEGER NOT NULL,
  `氏名` SHORT NOT NULL,
  `say "hi"` SHORT DEFAULT NULL,
  `メモ` SHORT DEFAULT NULL,
  PRIMARY KEY (`id`)
);


-- Foreign Keys 




-- Test Data

--  INSERT INTO `顧客` (`id`,`氏名`,`say "hi"`,`メモ`) VALUES
--    ('','','','');