CREATE TABLE counters (
  id int IDENTITY (1, 1) NOT NULL,
  label nvarchar(64) NOT NULL,
  hits int NOT NULL DEFAULT 0,
  CONSTRAINT counters_pkey PRIMARY KEY (id)
);
GO