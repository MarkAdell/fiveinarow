import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import RoomManager from "./RoomManager.js";

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

const roomManager = new RoomManager();

io.on("connection", (socket) => {
  // Create a new game room
  socket.on("createRoom", (callback) => {
    const { roomId, room } = roomManager.createRoom(socket.id);
    socket.join(roomId);
    callback({ roomId, mark: "X" });
  });

  // Join an existing room
  socket.on("joinRoom", (roomId, callback) => {
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

  socket.on("makeMove", ({ roomId, row, col }) => {
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

  socket.on("readyToPlay", (roomId) => {
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

      io.to(roomId).emit("gameReset", {
        board: room.board,
        currentTurn: room.currentTurn,
        gameStatus: room.gameStatus,
      });
    }
  });

  socket.on("leaveRoom", (roomId) => {
    handlePlayerLeaving(socket, roomId);
  });

  socket.on("disconnect", () => {
    // Find and cleanup any rooms this player is in
    for (const [roomId, room] of roomManager.rooms.entries()) {
      if (room.players.some((player) => player.id === socket.id)) {
        handlePlayerLeaving(socket, roomId);
      }
    }
  });
});

// Helper function to handle player leaving (for both voluntary and disconnect)
function handlePlayerLeaving(socket, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const playerIndex = room.players.findIndex((p) => p.id === socket.id);
  if (playerIndex === -1) return;

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

app.use(express.static(join(__dirname, "../../dist")));

// Handle SPA routing - always return index.html for any route
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../../dist", "index.html"));
});

export { app, server };
