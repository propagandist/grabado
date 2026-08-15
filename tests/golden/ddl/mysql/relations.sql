-- ---
-- Globals
-- ---

-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
-- SET FOREIGN_KEY_CHECKS=0;

-- ---
-- Table 'employees'
-- 
-- ---

DROP TABLE IF EXISTS `employees`;
		
CREATE TABLE `employees` (
  `id` INTEGER NOT NULL,
  `name` MEDIUMTEXT NOT NULL,
  `manager_id` INTEGER NULL COMMENT '直属の上長（自己参照）',
  PRIMARY KEY (`id`)
);

-- ---
-- Table 'projects'
-- 
-- ---

DROP TABLE IF EXISTS `projects`;
		
CREATE TABLE `projects` (
  `id` INTEGER NOT NULL,
  `title` MEDIUMTEXT NOT NULL,
  `owner_id` INTEGER NOT NULL,
  `team_id` INTEGER NULL,
  PRIMARY KEY (`id`)
);

-- ---
-- Table 'teams'
-- 
-- ---

DROP TABLE IF EXISTS `teams`;
		
CREATE TABLE `teams` (
  `id` INTEGER NOT NULL,
  `name` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`id`)
);

-- ---
-- Table 'employee_projects'
-- 
-- ---

DROP TABLE IF EXISTS `employee_projects`;
		
CREATE TABLE `employee_projects` (
  `employee_id` INTEGER NOT NULL,
  `project_id` INTEGER NOT NULL,
  PRIMARY KEY (`employee_id`, `project_id`)
);

-- ---
-- Foreign Keys 
-- ---

ALTER TABLE `employees` ADD FOREIGN KEY (manager_id) REFERENCES `employees` (`id`);
ALTER TABLE `projects` ADD FOREIGN KEY (owner_id) REFERENCES `employees` (`id`);
ALTER TABLE `projects` ADD FOREIGN KEY (team_id) REFERENCES `teams` (`id`);
ALTER TABLE `employee_projects` ADD FOREIGN KEY (employee_id) REFERENCES `employees` (`id`);
ALTER TABLE `employee_projects` ADD FOREIGN KEY (project_id) REFERENCES `projects` (`id`);

-- ---
-- Table Properties
-- ---

-- ALTER TABLE `employees` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
-- ALTER TABLE `projects` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
-- ALTER TABLE `teams` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
-- ALTER TABLE `employee_projects` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ---
-- Test Data
-- ---

-- INSERT INTO `employees` (`id`,`name`,`manager_id`) VALUES
-- ('','','');
-- INSERT INTO `projects` (`id`,`title`,`owner_id`,`team_id`) VALUES
-- ('','','','');
-- INSERT INTO `teams` (`id`,`name`) VALUES
-- ('','');
-- INSERT INTO `employee_projects` (`employee_id`,`project_id`) VALUES
-- ('','');