ALTER TABLE tasks
ADD COLUMN `floor` INT NULL AFTER woreda,
ADD COLUMN coordinate_x DECIMAL(18, 8) NULL AFTER `floor`,
ADD COLUMN coordinate_y DECIMAL(18, 8) NULL AFTER coordinate_x;
