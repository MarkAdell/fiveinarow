import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import * as roomManager from "./RoomManager.js";
import { initDatabase, eventRepository } from "./db/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initDatabase();

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

  eventRepository.logEvent({
    eventType: "connection",
    socketId: socket.id,
    ipAddress: clientIp,
    userAgent,
  });

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
          score: room.players[0].score, // getting any because score is the same for both players
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
          score: room.players[0].score, // getting any because score is the same for both players
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
      score: room.players[0].score, // getting any because score is the same for both players
    },
  });

  socket.leave(roomId);

  io.to(roomId).emit("opponentLeft");

  // Force all remaining players to leave the room
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

// Basic analytics endpoint
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await eventRepository.getGameStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.use(express.static(join(__dirname, "../../dist")));

// Handle SPA routing - always return index.html for any route
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../../dist", "index.html"));
});

export { app, server };
