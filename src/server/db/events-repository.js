import { sql } from "./config.js";

const VALID_EVENTS = [
  "connection",
  "disconnect",
  "room-created",
  "room-left",
  "game-started",
  "game-won",
  "game-reset",
];

/**
 * Log a game event to the database
 * @param {Object} eventData - Event data
 * @param {string} eventData.eventType - Type of event (connection, game-won, etc)
 * @param {string} eventData.socketId - Socket ID of the player
 * @param {string} [eventData.roomId] - Room ID (if applicable)
 * @param {string} [eventData.playerMark] - Player mark (X or O)
 * @param {Object} [eventData.details] - Additional event details
 * @param {string} [eventData.ipAddress] - IP address of the client
 * @param {string} [eventData.userAgent] - User agent of the client
 * @returns {Promise<Object|null>} The created event or null if error
 */
export async function logEvent({
  eventType,
  socketId,
  roomId = null,
  playerMark = null,
  details = {},
  ipAddress = null,
  userAgent = null,
}) {
  try {
    if (!VALID_EVENTS.includes(eventType)) {
      console.warn(`Invalid event type: ${eventType}`);
      return null;
    }

    await sql`
      INSERT INTO game_events
        (socket_id, ip_address, user_agent, room_id, event_type, player_mark, details)
      VALUES
        (${socketId},
         ${ipAddress},
         ${userAgent},
         ${roomId},
         ${eventType},
         ${playerMark},
         ${JSON.stringify(details)}
      )
    `;
  } catch (error) {
    console.error(`Error logging ${eventType} event:`, error.message);
    return null;
  }
}

export async function getGameStats() {
  try {
    const result = await sql`
      SELECT
        COUNT(DISTINCT room_id) AS total_rooms,
        COUNT(DISTINCT ip_address) AS total_players,
        (
          SELECT COUNT(*)
          FROM game_events
          WHERE event_type = 'game-won'
        ) AS completed_games
      FROM game_events
      WHERE event_type IN ('room-created', 'game-started', 'game-won')
    `;

    return result.result[0];
  } catch (error) {
    console.error("Error getting game stats:", error.message);
    return {
      total_games: 0,
      total_players: 0,
      completed_games: 0,
    };
  }
}
