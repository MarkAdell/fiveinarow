const BOARD_SIZE = 13;

const rooms = new Map();

function createEmptyBoard() {
  return Array(BOARD_SIZE)
    .fill()
    .map(() => Array(BOARD_SIZE).fill(null));
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createRoom(creatorId) {
  const roomId = generateRoomId();
  const room = {
    players: [{ id: creatorId, mark: "X", score: 0 }],
    board: createEmptyBoard(),
    currentTurn: creatorId,
    gameStatus: "waiting",
    lastWinner: null,
    readyToPlay: [],
  };

  rooms.set(roomId, room);
  return { roomId, room };
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

export function removeRoom(roomId) {
  return rooms.delete(roomId);
}

export function playerReadyToPlay(room, playerId) {
  // Don't add duplicates
  if (!room.readyToPlay.includes(playerId)) {
    room.readyToPlay.push(playerId);
  }

  const allReady =
    room.players.length >= 2 &&
    room.players.every((player) => room.readyToPlay.includes(player.id));

  return {
    readyToPlay: room.readyToPlay,
    allReady,
  };
}

export function resetBoard(room) {
  room.board = createEmptyBoard();

  // If there was a last winner, they go first
  if (room.lastWinner && room.players.some((p) => p.id === room.lastWinner)) {
    room.currentTurn = room.lastWinner;
  } else {
    // Default to X going first
    const firstPlayer = room.players.find((p) => p.mark === "X");
    if (firstPlayer) {
      room.currentTurn = firstPlayer.id;
    }
  }

  room.gameStatus = "playing";
  room.lastWinner = null;
  room.readyToPlay = [];

  return room;
}

export function checkWin(board, row, col, mark) {
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];

  for (const [dx, dy] of directions) {
    let consecutiveMarks = 1;
    const winLine = [{ row, col }];

    for (let dir = -1; dir <= 1; dir += 2) {
      if (dir === 0) continue;

      for (let i = 1; i < 5; i++) {
        const newRow = row + dx * dir * i;
        const newCol = col + dy * dir * i;

        // Check bounds
        if (
          newRow < 0 ||
          newRow >= board.length ||
          newCol < 0 ||
          newCol >= board[0].length
        ) {
          break;
        }

        // Check if the cell has our mark
        if (board[newRow][newCol] === mark) {
          winLine.push({ row: newRow, col: newCol });
          consecutiveMarks++;
        } else {
          break;
        }
      }
    }

    if (consecutiveMarks >= 5) {
      return winLine;
    }
  }

  return false;
}

export const getRooms = () => rooms;

export const getBoardSize = () => BOARD_SIZE;
