CREATE TABLE type_samples (
  c_integer INTEGER NOT NULL,
  c_real REAL,
  c_text TEXT,
  c_blob BLOB,
  c_any ANY,
  CONSTRAINT type_samples_pkey PRIMARY KEY (c_integer)
) STRICT;