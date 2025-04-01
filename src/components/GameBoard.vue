<script setup>
import { ref, onMounted, onUnmounted, inject, computed } from 'vue';

// --- Constants ---
const BOARD_SIZE = 13;
const PLAYER_MARKS = { X: 'X', O: 'O' };
const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
  DRAW: 'draw', // Added distinct status for draw
};

// --- Props and Emits ---
const props = defineProps({
  roomId: { type: String, required: true },
  playerMark: { type: String, required: true }, // Assume 'X' or 'O'
  isCreator: { type: Boolean, required: true }
});

const emit = defineEmits(['leaveGame', 'opponentLeft']);

// --- Injected Dependencies ---
const socket = inject('socket');

// --- Reactive State ---
const board = ref(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
const currentTurn = ref(''); // Socket ID of the player whose turn it is
const gameStatus = ref(GAME_STATUS.WAITING);
const players = ref([]); // Array of { id: String, mark: String, score: Number }
const winLine = ref([]); // Array of { row: Number, col: Number }
const statusMessage = ref('Initializing...');
const shareLink = ref('');
const latestMove = ref({ row: null, col: null });

// State for the "Play Again" flow
const iAmReadyForNextGame = ref(false);
const opponentReadyForNextGame = ref(false);

// State for copy feedback
const roomCodeCopied = ref(false);
const linkCopied = ref(false);

// --- Computed Properties ---
const isMyTurn = computed(() => socket?.id === currentTurn.value);
const isWaiting = computed(() => gameStatus.value === GAME_STATUS.WAITING);
const isPlaying = computed(() => gameStatus.value === GAME_STATUS.PLAYING);
const isFinished = computed(() => gameStatus.value === GAME_STATUS.FINISHED || gameStatus.value === GAME_STATUS.DRAW);

const scores = computed(() => {
  const result = { [PLAYER_MARKS.X]: 0, [PLAYER_MARKS.O]: 0 };
  players.value.forEach(player => {
    if (player.mark in result) {
      result[player.mark] = player.score;
    }
  });
  return result;
});

const opponentPlayer = computed(() => {
    return players.value.find(p => p.id !== socket?.id);
});

// Determines if the "Play Again" button should be shown
const showPlayAgainButton = computed(() => isFinished.value && !iAmReadyForNextGame.value);

// Determines if the "Waiting for opponent..." indicator should be shown
const showWaitingIndicator = computed(() => isFinished.value && iAmReadyForNextGame.value && !opponentReadyForNextGame.value);

// --- Lifecycle Hooks ---
onMounted(() => {
  if (!socket) {
    console.error("Socket instance not injected correctly.");
    statusMessage.value = "Error: Connection failed.";
    // Potentially emit an error or handle this state more gracefully
    return;
  }

  shareLink.value = `${window.location.origin}?room=${props.roomId}`;

  // Initial setup based on props - might be overwritten by server state if joining
  if (props.isCreator) {
    currentTurn.value = socket.id; // Creator (X) usually goes first
    gameStatus.value = GAME_STATUS.WAITING;
    players.value = [{ id: socket.id, mark: PLAYER_MARKS.X, score: 0 }];
    statusMessage.value = 'Waiting for opponent to join...';
  } else {
    // Assume joining player needs state from server or initial message
    // The 'opponentJoined' or a dedicated 'gameState' event should set the correct initial state
    statusMessage.value = "Connecting to game...";
    // Request initial game state if needed (optional, depends on server logic)
    // socket.emit('requestInitialState', props.roomId);
  }

  setupSocketListeners();
});

onUnmounted(() => {
  if (socket) {
    // Clean up socket listeners to prevent memory leaks
    socket.off('gameState', handleGameStateUpdate); // Use a generic state update handler
    socket.off('opponentJoined', handleOpponentJoined);
    socket.off('moveMade', handleMoveMade);
    socket.off('gameOver', handleGameOver);
    socket.off('gameDraw', handleGameDraw);
    socket.off('gameReset', handleGameReset);
    socket.off('opponentLeft', handleOpponentLeft);
    socket.off('playerReady', handlePlayerReady);
    // Consider leaving the room explicitly on unmount if not handled by parent
    // leaveGame();
  }
});

// --- Socket Event Handlers ---
// Consider a more generic game state update handler if the server sends full state often
function handleGameStateUpdate(data) {
  board.value = data.board ?? board.value; // Use nullish coalescing
  currentTurn.value = data.currentTurn ?? currentTurn.value;
  gameStatus.value = data.gameStatus ?? gameStatus.value;
  players.value = data.players ?? players.value;
  winLine.value = data.winLine ?? winLine.value;
  latestMove.value = data.lastMove ? { row: data.lastMove.row, col: data.lastMove.col } : { row: null, col: null };

  // Update status message based on the new state
  updateStatusMessage();
}

function handleOpponentJoined(data) {
   console.log('Opponent joined:', data);
   // Use the generic handler or specific logic
   players.value = data.players;
   gameStatus.value = data.gameStatus; // Should be 'playing'
   currentTurn.value = data.players.find(p => p.mark === PLAYER_MARKS.X)?.id; // X always starts? Confirm this rule.
   updateStatusMessage();
}

function handleMoveMade(data) {
    console.log('Move made:', data);
    board.value = data.board;
    currentTurn.value = data.currentTurn;
    gameStatus.value = data.gameStatus; // Should still be 'playing'
    if (data.lastMove) {
       latestMove.value = { row: data.lastMove.row, col: data.lastMove.col };
    }
    updateStatusMessage();
}

function handleGameOver(data) {
    console.log('Game over:', data);
    winLine.value = data.winLine;
    players.value = data.players; // Update scores
    gameStatus.value = GAME_STATUS.FINISHED;
    currentTurn.value = ''; // No one's turn

    // Ensure the final move is reflected on the board if needed
    if (data.lastMove && data.winner) {
      latestMove.value = { row: data.lastMove.row, col: data.lastMove.col };
      const winnerMark = players.value.find(p => p.id === data.winner)?.mark;
      if (winnerMark && board.value[data.lastMove.row]?.[data.lastMove.col] === null) {
         board.value[data.lastMove.row][data.lastMove.col] = winnerMark;
      }
    }

    updateStatusMessage(data.winner); // Pass winner ID to status update
}

function handleGameDraw(data) {
    console.log('Game draw:', data);
    // Update state if necessary (e.g., board might have last move)
    board.value = data.board ?? board.value;
    latestMove.value = data.lastMove ? { row: data.lastMove.row, col: data.lastMove.col } : { row: null, col: null };
    gameStatus.value = GAME_STATUS.DRAW;
    currentTurn.value = ''; // No one's turn
    winLine.value = []; // No winning line in a draw
    updateStatusMessage();
}

function handleGameReset(data) {
    console.log('Game reset:', data);
    board.value = data.board; // Reset board
    currentTurn.value = data.currentTurn; // Server decides who starts next
    gameStatus.value = GAME_STATUS.PLAYING;
    winLine.value = [];
    latestMove.value = { row: null, col: null };
    iAmReadyForNextGame.value = false; // Reset readiness flags
    opponentReadyForNextGame.value = false;
    updateStatusMessage();
}

function handleOpponentLeft() {
    console.log('Opponent left');
    statusMessage.value = "Your opponent left the game.";
    // Reset game state partially or fully depending on desired behavior
    gameStatus.value = GAME_STATUS.WAITING; // Or a custom 'opponent_left' status
    currentTurn.value = '';
    players.value = players.value.filter(p => p.id === socket?.id); // Keep only self
    winLine.value = [];
    // Reset readiness flags if a game was finished
    iAmReadyForNextGame.value = false;
    opponentReadyForNextGame.value = false;
    emit('opponentLeft', "Your opponent left the game");
}

function handlePlayerReady(data) {
    console.log('Player ready:', data);
    if (data.playerId === socket?.id) {
      iAmReadyForNextGame.value = true;
    } else {
      opponentReadyForNextGame.value = true;
    }

    // Status message update can happen here or in updateStatusMessage based on flags
    if (data.playerId !== socket?.id) {
       statusMessage.value = `Player ${opponentPlayer.value?.mark ?? '?'} is ready! Waiting for you...`;
    } else if (!opponentReadyForNextGame.value) {
        statusMessage.value = "Waiting for opponent to play again...";
    }

    // The server should emit 'gameReset' when both are ready.
    // Client-side reset of flags happens in `handleGameReset`.
}

function setupSocketListeners() {
  // Prefer specific handlers unless server sends a generic state update
  socket.on('opponentJoined', handleOpponentJoined);
  socket.on('moveMade', handleMoveMade);
  socket.on('gameOver', handleGameOver);
  socket.on('gameDraw', handleGameDraw);
  socket.on('gameReset', handleGameReset);
  socket.on('opponentLeft', handleOpponentLeft);
  socket.on('playerReady', handlePlayerReady);
  // Example for generic state update:
  // socket.on('gameState', handleGameStateUpdate);
}

// --- Methods ---
function updateStatusMessage(winnerId = null) {
  if (isWaiting.value) {
    statusMessage.value = players.value.length < 2 ? 'Waiting for opponent to join...' : 'Waiting for game to start...';
  } else if (isPlaying.value) {
    statusMessage.value = isMyTurn.value ? "Your turn" : "Opponent's turn";
  } else if (gameStatus.value === GAME_STATUS.FINISHED) {
    const winner = players.value.find(p => p.id === winnerId);
    if (winner) {
      statusMessage.value = winner.id === socket?.id ? "You won!" : "You lost!";
    } else {
       statusMessage.value = "Game Over!"; // Fallback if winner info is missing
    }
    // Add ready status if applicable
    if (iAmReadyForNextGame.value && !opponentReadyForNextGame.value) {
       statusMessage.value += " Waiting for opponent...";
    } else if (!iAmReadyForNextGame.value && opponentReadyForNextGame.value) {
        statusMessage.value += ` ${opponentPlayer.value?.mark ?? 'Opponent'} is ready!`;
    }

  } else if (gameStatus.value === GAME_STATUS.DRAW) {
    statusMessage.value = "Game ended in a draw!";
     // Add ready status if applicable
     if (iAmReadyForNextGame.value && !opponentReadyForNextGame.value) {
       statusMessage.value += " Waiting for opponent...";
    } else if (!iAmReadyForNextGame.value && opponentReadyForNextGame.value) {
        statusMessage.value += ` ${opponentPlayer.value?.mark ?? 'Opponent'} is ready!`;
    }
  } else {
     statusMessage.value = "Game status unknown"; // Should not happen
  }
}

function makeMove(row, col) {
  if (!isPlaying.value || !isMyTurn.value || board.value[row]?.[col] !== null) {
    console.warn("Invalid move attempt:", { isPlaying: isPlaying.value, isMyTurn: isMyTurn.value, cell: board.value[row]?.[col] });
    return; // Ignore click if not playable
  }

  // Optimistic UI update (optional, makes it feel faster)
  // board.value[row][col] = props.playerMark;
  // currentTurn.value = ''; // Temporarily disable further clicks

  latestMove.value = { row, col }; // Highlight the square immediately

  socket.emit('makeMove', {
    roomId: props.roomId,
    row,
    col
  });
}

async function copyToClipboard(textToCopy, feedbackRef) {
  if (!navigator.clipboard) {
    console.error("Clipboard API not available.");
    // Provide fallback or message if needed
    return;
  }
  try {
    await navigator.clipboard.writeText(textToCopy);
    feedbackRef.value = true; // Signal success
    setTimeout(() => {
      feedbackRef.value = false; // Reset after a delay
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
    // Optionally show an error message to the user
  }
}

function copyRoomCode() {
  copyToClipboard(props.roomId, roomCodeCopied);
}

function copyLink() {
  copyToClipboard(shareLink.value, linkCopied);
}

function readyToPlay() {
  if (!isFinished.value || iAmReadyForNextGame.value) return; // Prevent multiple clicks or clicks during game
  socket.emit('readyToPlay', props.roomId);
  iAmReadyForNextGame.value = true; // Assume success, update based on 'playerReady' event
  statusMessage.value = "Waiting for opponent to play again..."; // Update status immediately
}

function leaveGame() {
  if (props.roomId && socket) {
    socket.emit('leaveRoom', props.roomId);
  }
  emit('leaveGame'); // Notify parent component
}

function isWinningCell(row, col) {
  return winLine.value.some(cell => cell.row === row && cell.col === col);
}

// Call initially and whenever dependent state changes might affect it
// watch([gameStatus, currentTurn, players, iAmReadyForNextGame, opponentReadyForNextGame], () => updateStatusMessage(), { deep: true });
// Note: Calling updateStatusMessage within each handler might be simpler than a complex watcher.
</script>

<template>
  <div>
    <div class="mb-3 sm:mb-4 bg-white p-3 sm:p-6 rounded-lg shadow-lg">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-4 gap-2 sm:gap-4">
        <div class="w-full flex flex-col items-center">
          <h2 class="text-base sm:text-xl font-bold flex items-center">
            <span class="mr-1 sm:mr-2">Room:</span>
            <div class="relative flex items-center">
              <span class="bg-blue-100 text-blue-800 text-sm sm:text-base px-1 sm:px-2 py-0.5 sm:py-1 rounded-md mr-1 sm:mr-2 font-mono">{{ roomId }}</span>
              <button
                v-if="isWaiting"
                @click="copyRoomCode"
                class="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                :title="roomCodeCopied ? 'Room code copied!' : 'Copy room code'"
              >
                <span v-if="roomCodeCopied" class="text-green-600">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </span>
                <span v-else class="text-gray-500">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </span>
                <span class="absolute -top-7 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 transition-opacity duration-300 pointer-events-none" :class="{ 'opacity-100': roomCodeCopied }">
                  Copied!
                </span>
              </button>
            </div>
          </h2>

          <h2 v-if="isWaiting" class="text-base sm:text-xl font-bold flex items-center mt-1 sm:mt-2">
            <span class="mr-1 sm:mr-2">Invite:</span>
            <div class="relative flex items-center min-w-0"> <span class="bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 sm:py-1 rounded-md mr-1 sm:mr-2 text-xs sm:text-sm overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px] sm:max-w-xs md:max-w-sm">
                {{ shareLink }}
              </span>
              <button
                @click="copyLink"
                class="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                :title="linkCopied ? 'Invite link copied!' : 'Copy invite link'"
              >
                 <span v-if="linkCopied" class="text-green-600">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                 </span>
                 <span v-else class="text-gray-500">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                 </span>
                  <span class="absolute -top-7 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 transition-opacity duration-300 pointer-events-none" :class="{ 'opacity-100': linkCopied }">
                    Copied!
                 </span>
              </button>
            </div>
          </h2>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row justify-between items-center gap-2">
         <div
          aria-live="polite"
          class="text-sm sm:text-lg font-medium px-2 sm:px-4 py-1 sm:py-2 rounded-lg bg-gray-50 w-full mx-auto sm:mx-0 sm:w-auto text-center mb-2 sm:mb-0 max-w-xs sm:max-w-md truncate"
          :title="statusMessage"
          >
          {{ statusMessage }}
        </div>

        <div class="flex items-center space-x-2 sm:space-x-4">
           <button
            v-if="showPlayAgainButton"
            @click="readyToPlay"
            class="btn btn-primary text-xs sm:text-sm flex items-center gap-1 py-1 sm:py-2 px-2 sm:px-3"
          >
             <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Play Again
          </button>

          <button
            @click="leaveGame"
            class="btn btn-secondary text-xs sm:text-sm flex items-center gap-1 py-1 sm:py-2 px-2 sm:px-3"
          >
             <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Leave
          </button>

          <div v-if="showWaitingIndicator"
               class="text-xs sm:text-sm text-yellow-600 bg-yellow-50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg flex items-center whitespace-nowrap">
            <svg class="animate-spin -ml-1 mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Waiting...
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-center mb-1 sm:mb-4 gap-2 sm:gap-8">
      <div class="score-card shadow-md" :class="{ 'current-turn-indicator': currentTurn === players.find(p => p.mark === PLAYER_MARKS.X)?.id }">
        <div class="bg-blue-100 text-blue-800 font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-l-lg text-sm sm:text-base flex items-center">
          {{ PLAYER_MARKS.X }} <span v-if="playerMark === PLAYER_MARKS.X" class="text-xs ml-0.5">(you)</span>
        </div>
        <div class="score-value">{{ scores[PLAYER_MARKS.X] }}</div>
      </div>
      <div class="score-card shadow-md" :class="{ 'current-turn-indicator': currentTurn === players.find(p => p.mark === PLAYER_MARKS.O)?.id }">
        <div class="bg-red-100 text-red-800 font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-l-lg text-sm sm:text-base flex items-center">
           {{ PLAYER_MARKS.O }} <span v-if="playerMark === PLAYER_MARKS.O" class="text-xs ml-0.5">(you)</span>
        </div>
         <div class="score-value">{{ scores[PLAYER_MARKS.O] }}</div>
      </div>
    </div>

    <div class="bg-white p-2 sm:p-6 rounded-lg shadow-lg overflow-auto">
      <div class="board-container mx-auto">
        <div class="board-grid" :style="{ 'grid-template-columns': `repeat(${BOARD_SIZE}, minmax(1.5vw, 1fr))` }">
          <template v-for="(row, rowIndex) in board" :key="'row-' + rowIndex">
            <div
              v-for="(cell, colIndex) in row"
              :key="`${rowIndex}-${colIndex}`"
              @click="makeMove(rowIndex, colIndex)"
              class="board-cell"
              :class="{
                'winning-cell': isWinningCell(rowIndex, colIndex),
                'non-playable': cell !== null || !isPlaying || !isMyTurn,
                'playable': cell === null && isPlaying && isMyTurn,
                'recent-move': rowIndex === latestMove.row && colIndex === latestMove.col
              }"
              :aria-label="`Cell ${rowIndex + 1}, ${colIndex + 1}: ${cell ? cell : 'Empty'}${ (cell === null && isPlaying && isMyTurn) ? '. Click to place your mark.' : ''}`"
            >
              <span
                v-if="cell === PLAYER_MARKS.X"
                class="mark x-mark"
                aria-hidden="true"
              >
                {{ PLAYER_MARKS.X }}
              </span>
              <span
                v-else-if="cell === PLAYER_MARKS.O"
                class="mark o-mark"
                aria-hidden="true"
              >
                {{ PLAYER_MARKS.O }}
              </span>
               <span v-if="cell === null && isPlaying && isMyTurn" class="hover-mark" :class="playerMark === PLAYER_MARKS.X ? 'x-mark' : 'o-mark'">
                 {{ playerMark }}
               </span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- General & Layout --- */
.btn {
  @apply font-semibold rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}
.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}
.btn-secondary {
  @apply bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-indigo-500;
}

/* --- Score Card --- */
.score-card {
  display: flex;
  border-radius: 0.5rem; /* Tailwind: rounded-lg */
  overflow: hidden;
  border: 2px solid transparent; /* Base border */
  transition: border-color 0.3s ease-in-out;
}
.score-value {
  @apply bg-gray-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-r-lg font-bold text-lg sm:text-xl min-w-[1.5rem] sm:min-w-[2rem] text-center flex items-center justify-center; /* Tailwind classes */
}
.current-turn-indicator {
   border-color: #facc15; /* Tailwind: border-yellow-400 */
   box-shadow: 0 0 0 2px #facc15; /* Optional outer glow */
}


/* --- Board --- */
.board-container {
  max-width: 100%;
  overflow-x: auto; /* Keep horizontal scroll for smaller screens */
  padding: 5px; /* Add some padding around the grid */
}

.board-grid {
 /* grid-template-columns is set inline via :style */
  background-color: #d9b38c; /* Wood-like color */
  padding: 4px;
  border-radius: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); /* Tailwind: shadow-md */
  display: grid; /* Ensure grid display */
  gap: 2px; /* Space between cells */
  width: fit-content; /* Make grid only as wide as its content */
  margin-left: auto;
  margin-right: auto;
}

.board-cell {
  /* Sizing handled by grid columns and aspect ratio */
  aspect-ratio: 1 / 1; /* Maintain square shape */
  background-color: #e9c497; /* Lighter wood color */
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  border-radius: 2px; /* Slightly rounded cells */
}

.non-playable {
  cursor: not-allowed;
  background-color: #e2c099; /* Slightly different shade when non-playable */
}
.non-playable .hover-mark {
   display: none; /* Hide hover mark when not playable */
}


.playable:hover {
  background-color: #f0d2a8; /* Hover color */
}
.playable .hover-mark {
  display: block;
  opacity: 0.3; /* Show mark faded on hover */
  font-size: inherit; /* Inherit size from .mark */
  position: absolute; /* Position within cell */
}


.winning-cell {
  background-color: #9ae6b4 !important; /* Tailwind green-300, use !important to override hover */
  position: relative;
  overflow: hidden;
  z-index: 1;
}
/* Optional: Keep or adjust the shimmer effect */
.winning-cell::before {
 content: '';
  position: absolute;
  top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: conic-gradient(transparent, rgba(255,255,255,0.5), transparent 30%);
  animation: rotate 4s linear infinite;
  z-index: 0; /* Behind the mark */
}
@keyframes rotate {
  100% { transform: rotate(360deg); }
}


.recent-move {
   /* Use a subtle border or inset shadow */
   box-shadow: inset 0 0 0 2px rgba(66, 153, 225, 0.6); /* Tailwind blue-500 */
}

.mark {
  font-weight: bold; /* Tailwind: font-bold */
  font-size: clamp(14px, 2.5vw, 25px); /* Responsive font size */
  z-index: 2; /* Above potential effects */
  position: relative; /* Ensure z-index works */
  user-select: none; /* Prevent text selection */
}

.winning-cell .mark {
  /* Make winning marks stand out more */
  color: black; /* Or a contrasting color */
  transform: scale(1.1);
  text-shadow: 0 0 5px white;
}

.x-mark {
  color: #2b6cb0; /* Tailwind blue-700 */
}

.o-mark {
  color: #c53030; /* Tailwind red-700 */
}

.hover-mark {
  display: none; /* Hidden by default */
}

/* Small screen adjustments if needed - Tailwind handles most */
@media (max-width: 640px) {
  .mark {
     /* Adjust clamp if needed for very small screens */
      font-size: clamp(12px, 4vw, 20px);
  }
  .board-grid {
      gap: 1px; /* Smaller gap on small screens */
  }
}

</style>
