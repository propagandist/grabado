CREATE TABLE [counters] (
  [id] bigint NOT NULL IDENTITY (1, 1) ,
  [label] tinyint(64) NOT NULL ,
  [hits] bigint NOT NULL , 
CONSTRAINT counters_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO