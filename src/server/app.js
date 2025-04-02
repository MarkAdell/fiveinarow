import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import * as roomManager from "./room-manager.js";
import { initDatabase, eventRepository } from "./db/index.js";
import { authenticateApiKey } from "./middlewares/api-key-auth.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());

app.use(express.static(join(__dirname, "../../dist")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initDatabase();

// Track last activity time for each player
const playerLastActivity = new Map(); // socketId -> timestamp

const DEBUG_HEARTBEATS = process.env.DEBUG_HEARTBEATS === "true";

// Disconnect inactive players after 5 minutes
function setupInactivityCheck() {
  const INACTIVITY_TIMEOUT_MS = 300000;

  setInterval(() => {
    const now = Date.now();
    const inactiveSockets = [];

    playerLastActivity.forEach((lastActivityTime, socketId) => {
      if (now - lastActivityTime > INACTIVITY_TIMEOUT_MS) {
        inactiveSockets.push(socketId);
      }
    });

    inactiveSockets.forEach((socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
        playerLastActivity.delete(socketId);
      } else {
        playerLastActivity.delete(socketId);
      }
    });
  }, 60000);
}

setupInactivityCheck();

// Function to get client IP address from various headers
function getClientIp(socket) {
  // CloudFlare
  if (socket.handshake.headers["cf-connecting-ip"]) {
    return socket.handshake.headers["cf-connecting-ip"];
  }

  // Fastly
  if (socket.handshake.headers["fastly-client-ip"]) {
    return socket.handshake.headers["fastly-client-ip"];
  }

  // X-Forwarded-For header
  if (socket.handshake.headers["x-forwarded-for"]) {
    return socket.handshake.headers["x-forwarded-for"].split(",")[0].trim();
  }

  // Forwarded header (standard)
  if (socket.handshake.headers["forwarded"]) {
    const forwardedHeader = socket.handshake.headers["forwarded"];
    for (const directive of forwardedHeader.split(",")[0].split(";")) {
      if (directive.startsWith("for=")) {
        // Remove quotes if present
        return directive.substring(4).replace(/"/g, "").replace(/\[|\]/g, "");
      }
    }
  }

  // Direct connection
  return socket.handshake.address;
}

io.on("connection", async (socket) => {
  const clientIp = getClientIp(socket);
  const userAgent = socket.handshake.headers["user-agent"];

  // Record initial activity time
  playerLastActivity.set(socket.id, Date.now());

  eventRepository.logEvent({
    eventType: "connection",
    socketId: socket.id,
    ipAddress: clientIp,
    userAgent,
  });

  // Heartbeat handler for all devices
  socket.on("heartbeat", ({ roomId }) => {
    // Update last activity time
    playerLastActivity.set(socket.id, Date.now());

    // Actively refresh the room connection
    if (roomId) {
      const room = roomManager.getRoom(roomId);
      if (room) {
        // Refresh socket's presence in the room
        socket.join(roomId);

        // Make sure this player is still in the room's player list
        const playerInRoom = room.players.find((p) => p.id === socket.id);
        if (!playerInRoom) {
          if (DEBUG_HEARTBEATS) {
            console.log(
              `Player ${socket.id} sending heartbeats but not in room ${roomId}, potential reconnection issue`
            );
          }
        }

        // Send a minimal response to keep the connection active
        socket.emit("heartbeatAck", { timestamp: Date.now() });

        if (DEBUG_HEARTBEATS) {
          console.log(`Heartbeat received from ${socket.id} in room ${roomId}`);
        }
      } else {
        if (DEBUG_HEARTBEATS) {
          console.log(`Heartbeat received for non-existent room: ${roomId}`);
        }
      }
    }
  });

  // For all other events, update the activity timestamp
  ["createRoom", "joinRoom", "makeMove", "readyToPlay", "leaveRoom"].forEach(
    (eventName) => {
      socket.on(eventName, (...args) => {
        // Update activity timestamp
        playerLastActivity.set(socket.id, Date.now());
      });
    }
  );

  socket.on("createRoom", async (callback) => {
    const { roomId } = roomManager.createRoom(socket.id);
    socket.join(roomId);

    eventRepository.logEvent({
      eventType: "room-created",
      socketId: socket.id,
      roomId,
      playerMark: "X", // Creator is always X
      ipAddress: clientIp,
      userAgent,
    });

    callback({ roomId, mark: "X" });
  });

  // Join an existing room
  socket.on("joinRoom", async (roomId, callback) => {
    const room = roomManager.getRoom(roomId);

    if (!room) {
      callback({ error: "Room not found" });
      return;
    }

    if (room.players.length >= 2) {
      callback({ error: "Room is full" });
      return;
    }

    // Find the X player (creator)
    const creatorPlayer = room.players.find((player) => player.mark === "X");
    if (!creatorPlayer) {
      callback({ error: "Invalid room state" });
      return;
    }

    // Second player joins as O
    const newPlayer = { id: socket.id, mark: "O", score: 0 };
    room.players.push(newPlayer);
    room.gameStatus = "playing";

    room.currentTurn = creatorPlayer.id;

    socket.join(roomId);

    eventRepository.logEvent({
      eventType: "game-started",
      socketId: socket.id,
      roomId,
      ipAddress: clientIp,
      userAgent,
    });

    // Send full game state to joining player
    callback({
      success: true,
      mark: "O",
      board: room.board,
      players: room.players,
      currentTurn: room.currentTurn,
      gameStatus: room.gameStatus,
    });

    // Notify the creator that someone joined
    socket.to(roomId).emit("opponentJoined", {
      opponentId: socket.id,
      players: room.players,
      gameStatus: room.gameStatus,
      currentTurn: room.currentTurn,
    });
  });

  socket.on("makeMove", async ({ roomId, row, col }) => {
    const room = roomManager.getRoom(roomId);

    if (!room) return;
    if (room.gameStatus !== "playing") return;
    if (room.currentTurn !== socket.id) return;
    if (room.board[row][col] !== null) return;

    const currentPlayer = room.players.find(
      (player) => player.id === socket.id
    );
    if (!currentPlayer) return;

    room.board[row][col] = currentPlayer.mark;

    const winLine = roomManager.checkWin(
      room.board,
      row,
      col,
      currentPlayer.mark
    );
    if (winLine) {
      room.gameStatus = "finished";
      room.lastWinner = socket.id;

      currentPlayer.score += 1;

      eventRepository.logEvent({
        eventType: "game-won",
        socketId: socket.id,
        roomId,
        playerMark: currentPlayer.mark,
        ipAddress: clientIp,
        userAgent,
        details: {
          players: room.players.map((p) => ({
            id: p.id,
            mark: p.mark,
            score: p.score,
          })),
        },
      });

      io.to(roomId).emit("gameOver", {
        winner: socket.id,
        winLine,
        players: room.players,
        lastMove: { row, col },
      });
      return;
    }

    const isBoardFull = room.board.every((row) =>
      row.every((cell) => cell !== null)
    );

    if (isBoardFull) {
      room.gameStatus = "finished";
      io.to(roomId).emit("gameDraw");
      return;
    }

    const otherPlayer = room.players.find((player) => player.id !== socket.id);
    room.currentTurn = otherPlayer.id;

    io.to(roomId).emit("moveMade", {
      board: room.board,
      currentTurn: room.currentTurn,
      gameStatus: room.gameStatus,
      lastMove: { row, col },
    });
  });

  socket.on("readyToPlay", async (roomId) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (room.gameStatus !== "finished") return;

    const { readyToPlay, allReady } = roomManager.playerReadyToPlay(
      room,
      socket.id
    );

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    io.to(roomId).emit("playerReady", {
      playerId: socket.id,
      playerMark: player.mark,
      readyToPlay,
      allReady,
    });

    if (allReady) {
      roomManager.resetBoard(room);

      eventRepository.logEvent({
        eventType: "game-reset",
        socketId: socket.id,
        roomId,
        playerMark: player.mark,
        ipAddress: clientIp,
        userAgent,
        details: {
          players: room.players.map((p) => ({
            id: p.id,
            mark: p.mark,
            score: p.score,
          })),
        },
      });

      io.to(roomId).emit("gameReset", {
        board: room.board,
        currentTurn: room.currentTurn,
        gameStatus: room.gameStatus,
      });
    }
  });

  socket.on("leaveRoom", async (roomId) => {
    await handlePlayerLeaving(socket, roomId, clientIp, userAgent);
  });

  socket.on("disconnect", async () => {
    playerLastActivity.delete(socket.id);

    eventRepository.logEvent({
      eventType: "disconnect",
      socketId: socket.id,
      ipAddress: clientIp,
      userAgent,
    });

    // Find and cleanup any rooms this player is in
    for (const [roomId, room] of roomManager.getRooms().entries()) {
      if (room.players.some((player) => player.id === socket.id)) {
        await handlePlayerLeaving(socket, roomId, clientIp, userAgent);
      }
    }
  });
});

// Helper function to handle player leaving (for both voluntary and disconnect)
async function handlePlayerLeaving(socket, roomId, ipAddress, userAgent) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const playerIndex = room.players.findIndex((p) => p.id === socket.id);
  if (playerIndex === -1) return;

  const player = room.players[playerIndex];

  eventRepository.logEvent({
    eventType: "room-left",
    socketId: socket.id,
    roomId,
    playerMark: player.mark,
    ipAddress,
    userAgent,
    details: {
      players: room.players.map((p) => ({
        id: p.id,
        mark: p.mark,
        score: p.score,
      })),
    },
  });

  socket.leave(roomId);

  io.to(roomId).emit("opponentLeft");

  room.players.forEach((player) => {
    if (player.id !== socket.id) {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.leave(roomId);
      }
    }
  });

  roomManager.removeRoom(roomId);
}

app.get("/api/stats", authenticateApiKey, async (req, res) => {
  try {
    const stats = await eventRepository.getGameStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../../dist", "index.html"));
});

export { app, server };
