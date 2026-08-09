--
-- CUBRID SQL Script
--

-- Table `employees`

-- DROP TABLE `employees`;

CREATE TABLE `employees` (
  `id` INTEGER NOT NULL,
  `name` SHORT NOT NULL,
  `manager_id` INTEGER DEFAULT NULL,
  PRIMARY KEY (`id`)
);

-- Table `projects`

-- DROP TABLE `projects`;

CREATE TABLE `projects` (
  `id` INTEGER NOT NULL,
  `title` SHORT NOT NULL,
  `owner_id` INTEGER NOT NULL,
  `team_id` INTEGER DEFAULT NULL,
  PRIMARY KEY (`id`)
);

-- Table `teams`

-- DROP TABLE `teams`;

CREATE TABLE `teams` (
  `id` INTEGER NOT NULL,
  `name` SHORT NOT NULL,
  PRIMARY KEY (`id`)
);

-- Table `employee_projects`

-- DROP TABLE `employee_projects`;

CREATE TABLE `employee_projects` (
  `employee_id` INTEGER NOT NULL,
  `project_id` INTEGER NOT NULL,
  PRIMARY KEY (`employee_id`, `project_id`)
);


-- Foreign Keys 

ALTER TABLE `employees` ADD FOREIGN KEY (`manager_id`) REFERENCES `employees` (`id`);
ALTER TABLE `projects` ADD FOREIGN KEY (`owner_id`) REFERENCES `employees` (`id`);
ALTER TABLE `projects` ADD FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`);
ALTER TABLE `employee_projects` ADD FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`);
ALTER TABLE `employee_projects` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);



-- Test Data

--  INSERT INTO `employees` (`id`,`name`,`manager_id`) VALUES
--    ('','','');
--  INSERT INTO `projects` (`id`,`title`,`owner_id`,`team_id`) VALUES
--    ('','','','');
--  INSERT INTO `teams` (`id`,`name`) VALUES
--    ('','');
--  INSERT INTO `employee_projects` (`employee_id`,`project_id`) VALUES
--    ('','');