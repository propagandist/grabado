CREATE TABLE [counters] (
  [id] int NOT NULL IDENTITY (1, 1) ,
  [label] nvarchar(64) NOT NULL ,
  [hits] int NOT NULL , 
CONSTRAINT counters_pkey PRIMARY KEY ([id])
) ON [PRIMARY]
GO