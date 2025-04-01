# Five in a Row - Analytics Database

This directory contains the database layer for tracking game analytics using Neon Postgres.

## Setup

1. Create a Neon Postgres database at [console.neon.tech](https://console.neon.tech/)
2. Copy the connection string from your Neon dashboard
3. Create a `.env` file in the project root based on `.env.example`
4. Add your Neon connection string to the `.env` file as `DATABASE_URL`

## Structure

- `config.js` - Database connection configuration
- `schema.js` - Database schema definition and validation
- `events.js` - Event tracking repository
- `index.js` - Entry point for database initialization

## Events Tracked

The following events are tracked for analytics:

- `connection` - When users connect
- `disconnect` - When users leave
- `room-created` - When a room is created
- `room-joined` - When a player joins a room
- `room-left` - When a player leaves
- `game-started` - When both players are ready
- `game-won` - Game victory (with winner info)
- `game-reset` - Players started a new game

## Analytics Queries

Here are some useful queries for analyzing game data:

```sql
-- Total games played
SELECT COUNT(DISTINCT room_id) FROM game_events WHERE event_type = 'room-created';

-- Games completed vs abandoned
SELECT 
  COUNT(DISTINCT r.room_id) AS total_games,
  COUNT(DISTINCT w.room_id) AS completed_games,
  ROUND(COUNT(DISTINCT w.room_id) * 100.0 / COUNT(DISTINCT r.room_id), 2) AS completion_rate
FROM 
  game_events r
LEFT JOIN
  game_events w ON r.room_id = w.room_id AND w.event_type = 'game-won'
WHERE 
  r.event_type = 'room-created';

-- Win distribution by player mark
SELECT
  player_mark,
  COUNT(*) AS wins,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM game_events WHERE event_type = 'game-won'), 2) AS win_percentage
FROM
  game_events
WHERE
  event_type = 'game-won'
GROUP BY
  player_mark;

-- Unique players per day
SELECT 
  DATE(timestamp) AS day,
  COUNT(DISTINCT socket_id) AS unique_players
FROM 
  game_events
GROUP BY 
  DATE(timestamp)
ORDER BY 
  day;
```

## API Endpoints

- `GET /api/stats` - Get basic game statistics 