import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { app } from "electron";
import { runMigrations } from "./migrations";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration_seconds: number;
  calendar_event_id: string | null;
  attendees: string; // JSON stringified array
  recipe_id: string | null;
  created_at: string;
}

export interface MeetingInput {
  title: string;
  date: string;
  duration_seconds?: number;
  calendar_event_id?: string;
  attendees?: string[];
  recipe_id?: string;
}

export interface MeetingUpdate {
  title?: string;
  date?: string;
  duration_seconds?: number;
  calendar_event_id?: string;
  attendees?: string[];
  recipe_id?: string;
}

export interface Note {
  id: string;
  meeting_id: string;
  content: string;
  raw_user_notes: string;
  transcript_text: string;
  ai_output: string;
  created_at: string;
  updated_at: string;
}

export interface NoteContent {
  content?: string;
  raw_user_notes?: string;
  transcript_text?: string;
  ai_output?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: number;
  created_at: string;
}

export interface RecipeInput {
  name: string;
  description?: string;
  system_prompt: string;
  is_default?: boolean;
}

// ── Database Singleton ───────────────────────────────────────────────────────

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = path.join(app.getPath("home"), ".phillnola");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "phillnola.db");
}

export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations and seed data
  runMigrations(db);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Meetings CRUD ────────────────────────────────────────────────────────────

export function getMeetings(): Meeting[] {
  const database = getDatabase();
  return database.prepare("SELECT * FROM meetings ORDER BY date DESC").all() as Meeting[];
}

export function getMeeting(id: string): Meeting | undefined {
  const database = getDatabase();
  return database.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as Meeting | undefined;
}

export function createMeeting(data: MeetingInput): Meeting {
  const database = getDatabase();
  const id = crypto.randomUUID();
  const attendees = JSON.stringify(data.attendees || []);

  database
    .prepare(
      `INSERT INTO meetings (id, title, date, duration_seconds, calendar_event_id, attendees, recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.title,
      data.date,
      data.duration_seconds || 0,
      data.calendar_event_id || null,
      attendees,
      data.recipe_id || null
    );

  return getMeeting(id) as Meeting;
}

export function updateMeeting(id: string, data: MeetingUpdate): Meeting | undefined {
  const database = getDatabase();
  const existing = getMeeting(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) {
    fields.push("title = ?");
    values.push(data.title);
  }
  if (data.date !== undefined) {
    fields.push("date = ?");
    values.push(data.date);
  }
  if (data.duration_seconds !== undefined) {
    fields.push("duration_seconds = ?");
    values.push(data.duration_seconds);
  }
  if (data.calendar_event_id !== undefined) {
    fields.push("calendar_event_id = ?");
    values.push(data.calendar_event_id);
  }
  if (data.attendees !== undefined) {
    fields.push("attendees = ?");
    values.push(JSON.stringify(data.attendees));
  }
  if (data.recipe_id !== undefined) {
    fields.push("recipe_id = ?");
    values.push(data.recipe_id);
  }

  if (fields.length === 0) return existing;

  values.push(id);
  database.prepare(`UPDATE meetings SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getMeeting(id);
}

export function deleteMeeting(id: string): boolean {
  const database = getDatabase();
  // Delete associated notes first (cascade manually since SQLite FK cascade needs explicit setup)
  database.prepare("DELETE FROM notes WHERE meeting_id = ?").run(id);
  const result = database.prepare("DELETE FROM meetings WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Notes CRUD ───────────────────────────────────────────────────────────────

export function getNotes(meetingId: string): Note | undefined {
  const database = getDatabase();
  return database
    .prepare("SELECT * FROM notes WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(meetingId) as Note | undefined;
}

export function saveNotes(meetingId: string, content: NoteContent): Note {
  const database = getDatabase();
  const existing = getNotes(meetingId);

  if (existing) {
    // Update existing notes
    const fields: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];

    if (content.content !== undefined) {
      fields.push("content = ?");
      values.push(content.content);
    }
    if (content.raw_user_notes !== undefined) {
      fields.push("raw_user_notes = ?");
      values.push(content.raw_user_notes);
    }
    if (content.transcript_text !== undefined) {
      fields.push("transcript_text = ?");
      values.push(content.transcript_text);
    }
    if (content.ai_output !== undefined) {
      fields.push("ai_output = ?");
      values.push(content.ai_output);
    }

    values.push(existing.id);
    database.prepare(`UPDATE notes SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    return getNotes(meetingId) as Note;
  } else {
    // Create new notes
    const id = crypto.randomUUID();
    database
      .prepare(
        `INSERT INTO notes (id, meeting_id, content, raw_user_notes, transcript_text, ai_output)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        meetingId,
        content.content || "{}",
        content.raw_user_notes || "",
        content.transcript_text || "",
        content.ai_output || ""
      );

    return getNotes(meetingId) as Note;
  }
}

export function searchNotes(query: string): (Note & { meeting_title: string })[] {
  const database = getDatabase();
  const pattern = `%${query}%`;
  return database
    .prepare(
      `SELECT n.*, m.title as meeting_title
       FROM notes n
       JOIN meetings m ON n.meeting_id = m.id
       WHERE n.raw_user_notes LIKE ?
          OR n.transcript_text LIKE ?
          OR n.ai_output LIKE ?
          OR n.content LIKE ?
       ORDER BY n.updated_at DESC`
    )
    .all(pattern, pattern, pattern, pattern) as (Note & { meeting_title: string })[];
}

// ── Recipes CRUD ─────────────────────────────────────────────────────────────

export function getRecipes(): Recipe[] {
  const database = getDatabase();
  return database
    .prepare("SELECT * FROM recipes ORDER BY is_default DESC, name ASC")
    .all() as Recipe[];
}

export function getRecipe(id: string): Recipe | undefined {
  const database = getDatabase();
  return database.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as Recipe | undefined;
}

export function saveRecipe(data: RecipeInput & { id?: string }): Recipe {
  const database = getDatabase();

  if (data.id) {
    // Update existing recipe
    database
      .prepare(
        `UPDATE recipes SET name = ?, description = ?, system_prompt = ?, is_default = ?
         WHERE id = ?`
      )
      .run(
        data.name,
        data.description || "",
        data.system_prompt,
        data.is_default ? 1 : 0,
        data.id
      );
    return getRecipe(data.id) as Recipe;
  } else {
    // Create new recipe
    const id = crypto.randomUUID();
    database
      .prepare(
        `INSERT INTO recipes (id, name, description, system_prompt, is_default)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, data.name, data.description || "", data.system_prompt, data.is_default ? 1 : 0);
    return getRecipe(id) as Recipe;
  }
}

// ── Settings CRUD ────────────────────────────────────────────────────────────

export function getSetting(key: string): string | undefined {
  const database = getDatabase();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const database = getDatabase();
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const database = getDatabase();
  const rows = database.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
