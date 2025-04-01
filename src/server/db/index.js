import { testConnection } from "./config.js";
import { createSchema } from "./schema.js";
import * as eventRepository from "./events-repository.js";

export async function initDatabase() {
  try {
    await testConnection();
    await createSchema();
  } catch (error) {
    console.error("Database initialization failed:", error.message);
  }
}

export { eventRepository };
