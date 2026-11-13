CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    title_fa   TEXT,
    title_en   TEXT,
    link       TEXT,
    source     TEXT,
    source_en  TEXT,
    lang       TEXT,
    flag       TEXT,
    published  TEXT,
    high       INTEGER DEFAULT 0,
    medium     INTEGER DEFAULT 0,
    domestic   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_published ON items (published DESC);

CREATE TABLE IF NOT EXISTS snapshots (
    key      TEXT PRIMARY KEY,
    body     TEXT NOT NULL,
    updated  TEXT NOT NULL,
    count    INTEGER DEFAULT 0
);
