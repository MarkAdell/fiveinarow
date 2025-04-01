import { sql } from "./config.js";

export async function createSchema() {
  try {
    const result = await sql`
      CREATE TABLE IF NOT EXISTS game_events (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        socket_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        room_id TEXT,
        event_type TEXT NOT NULL,
        player_mark TEXT,
        details JSONB DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_game_events_created_at ON game_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_game_events_event_type ON game_events(event_type);
    `;

    if (!result.success) {
      throw new Error("Failed to create schema");
    }
    console.log("Game events table and indexes created successfully");
  } catch (error) {
    console.error("Error creating schema:", error.message);
  }
}
