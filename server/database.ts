import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { CollectionItem, ItemInput } from '../shared/types.ts';

export function createRepository(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, url TEXT NOT NULL,
      content TEXT NOT NULL, description TEXT NOT NULL, cover TEXT NOT NULL,
      source TEXT NOT NULL, author TEXT NOT NULL, tags TEXT NOT NULL,
      status TEXT NOT NULL, starred INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unique_item_url ON items(url) WHERE url <> '';
    CREATE INDEX IF NOT EXISTS items_created_at ON items(created_at DESC);`);
  function map(row: Record<string, unknown>): CollectionItem {
    return {
      id: String(row.id),
      title: String(row.title),
      type: row.type as CollectionItem['type'],
      url: String(row.url),
      content: String(row.content),
      description: String(row.description),
      cover: String(row.cover),
      source: String(row.source),
      author: String(row.author),
      tags: JSON.parse(String(row.tags)),
      status: row.status as CollectionItem['status'],
      starred: Boolean(row.starred),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  function list() {
    return db
      .prepare('SELECT * FROM items ORDER BY created_at DESC, rowid DESC')
      .all()
      .map((row) => map(row));
  }

  function get(id: string) {
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    return row ? map(row) : undefined;
  }

  function findUrl(url: string) {
    const row = db.prepare('SELECT * FROM items WHERE url = ?').get(url);
    return row ? map(row) : undefined;
  }

  function save(input: ItemInput, id?: string): CollectionItem {
    const now = new Date().toISOString();
    const existing = id ? get(id) : undefined;
    const item = {
      ...input,
      id: id || randomUUID(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    db.prepare(
      `INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, type=excluded.type, url=excluded.url,
      content=excluded.content, description=excluded.description, cover=excluded.cover,
      source=excluded.source, author=excluded.author, tags=excluded.tags, status=excluded.status,
      starred=excluded.starred, updated_at=excluded.updated_at`,
    ).run(
      item.id,
      item.title,
      item.type,
      item.url,
      item.content,
      item.description,
      item.cover,
      item.source,
      item.author,
      JSON.stringify(item.tags),
      item.status,
      Number(item.starred),
      item.createdAt,
      now,
    );
    return item;
  }

  function remove(id: string) {
    return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
  }

  return { list, get, findUrl, save, remove, close: () => db.close() };
}

export type ItemRepository = ReturnType<typeof createRepository>;
