CREATE TABLE news (
  id INTEGER PRIMARY KEY NOT NULL,
	source TEXT NOT NULL,
	title TEXT NOT NULL,
	url TEXT NOT NULL,
	external_id TEXT NOT NULL,
	author_name TEXT,
	published_at TEXT NOT NULL,

	CONSTRAINT title_length CHECK (length(title) > 0),
	CONSTRAINT url_length CHECK (length(url) > 0),
	CONSTRAINT author_name_length CHECK (length(author_name) > 0)
);

CREATE UNIQUE INDEX index_news_on_source_and_external_id
ON news (source, external_id);

CREATE INDEX index_news_on_published_at
ON news (published_at);
