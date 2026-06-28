import * as SQLite from 'expo-sqlite';

const DB_NAME = 'photofind.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await initDb(db);
  }
  return db;
}

async function initDb(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      uri TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at INTEGER,
      indexed_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS photos_fts USING fts5(
      id UNINDEXED,
      description,
      tags,
      content='photos',
      content_rowid='rowid'
    );
  `);
}

export async function savePhoto(params: {
  id: string;
  uri: string;
  description: string;
  tags: string[];
  createdAt?: number;
}) {
  const db = await getDb();
  const tagsStr = params.tags.join(' ');
  await db.runAsync(
    `INSERT OR REPLACE INTO photos (id, uri, description, tags, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [params.id, params.uri, params.description, tagsStr, params.createdAt ?? null]
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO photos_fts (id, description, tags)
     VALUES (?, ?, ?)`,
    [params.id, params.description, tagsStr]
  );
}

export async function searchPhotos(query: string, limit = 30): Promise<SearchResult[]> {
  const db = await getDb();
  const results = await db.getAllAsync<SearchResult>(
    `SELECT p.id, p.uri, p.description, p.tags,
            bm25(photos_fts) AS score
     FROM photos_fts
     JOIN photos p ON p.id = photos_fts.id
     WHERE photos_fts MATCH ?
     ORDER BY score
     LIMIT ?`,
    [query + '*', limit]
  );
  return results;
}

export async function getIndexedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM photos');
  return row?.count ?? 0;
}

export async function isPhotoIndexed(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT id FROM photos WHERE id = ?', [id]);
  return !!row;
}

export interface SearchResult {
  id: string;
  uri: string;
  description: string;
  tags: string;
  score: number;
}
