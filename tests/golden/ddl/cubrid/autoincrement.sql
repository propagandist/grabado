--
-- CUBRID SQL Script
--

-- Table `counters`

-- DROP TABLE `counters`;

CREATE TABLE `counters` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `label` VARCHAR(64) NOT NULL,
  `hits` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);


-- Foreign Keys 




-- Test Data

--  INSERT INTO `counters` (`id`,`label`,`hits`) VALUES
--    ('','','');