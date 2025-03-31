# Five in a Row - Server

This directory contains the server-side code for the Five in a Row game.

## Structure

- `RoomManager.js` - Handles game room management and game logic
- `index.js` - Contains Express and Socket.IO setup and event handlers
- `start.js` - Entry point for starting the server directly

## Development

To run the server in development:

```bash
# Using the main entry point (server.js)
npm run server

# Using the direct server path with auto-restart on changes
npm run server:dev
```

## Production

There are two ways to run the server in production:

```bash
# Using the main entry point (recommended)
npm run start

# Using the direct server path
npm run start:direct
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run server` | Start game server (via main entry point) |
| `npm run server:dev` | Start game server with auto-restart on changes |
| `npm run start` | Start server in production mode (via main entry point) |
| `npm run start:direct` | Start server directly from src/server/start.js in production mode |
| `npm run production` | Build frontend and start server in production mode |
| `npm run production:direct` | Build frontend and start server directly from src/server/start.js | 