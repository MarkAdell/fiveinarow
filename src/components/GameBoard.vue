<script setup>
import { ref, onMounted, inject, computed } from 'vue';

const props = defineProps({
  roomId: String,
  playerMark: String,
  isCreator: Boolean
});

const emit = defineEmits(['leaveGame', 'opponentLeft']);
const socket = inject('socket');

const board = ref(Array(15).fill().map(() => Array(15).fill(null)));
const currentTurn = ref('');
const gameStatus = ref('waiting');
const players = ref([]);
const winLine = ref([]);
const statusMessage = ref('Waiting for opponent to join...');
const shareLink = ref('');
const latestMove = ref({ row: null, col: null });

const waitingForOpponent = ref(false);
const opponentReady = ref(false);
const iAmReady = ref(false);

const isMyTurn = computed(() => {
  return socket.id === currentTurn.value;
});

const scores = computed(() => {
  const result = { X: 0, O: 0 };
  players.value.forEach(player => {
    result[player.mark] = player.score;
  });
  return result;
});

onMounted(() => {
  shareLink.value = `${window.location.origin}?room=${props.roomId}`;

  if (props.isCreator) {
    currentTurn.value = socket.id;
    gameStatus.value = 'waiting';
    players.value = [{ id: socket.id, mark: 'X', score: 0 }];
    statusMessage.value = 'Waiting for opponent to join...';
  } else {
    gameStatus.value = 'playing';
    statusMessage.value = "Opponent's turn";
  }

  setupSocketListeners();
  
  // Clean up socket listeners when component is unmounted
  return () => {
    socket.off('opponentJoined');
    socket.off('moveMade');
    socket.off('gameOver');
    socket.off('gameDraw');
    socket.off('gameReset');
    socket.off('opponentLeft');
    socket.off('playerReady');
  };
});

function setupSocketListeners() {
  socket.on('opponentJoined', (data) => {
    players.value = data.players;
    gameStatus.value = data.gameStatus;
    currentTurn.value = data.players.find(p => p.mark === 'X').id; // X goes first
    
    statusMessage.value = currentTurn.value === socket.id ? "Your turn" : "Opponent's turn";
  });

  socket.on('moveMade', (data) => {
    board.value = data.board;
    currentTurn.value = data.currentTurn;
    gameStatus.value = data.gameStatus;
    
    if (data.lastMove && data.currentTurn === socket.id) {
      latestMove.value = { row: data.lastMove.row, col: data.lastMove.col };
    }
    
    if (gameStatus.value === 'playing') {
      statusMessage.value = currentTurn.value === socket.id ? "Your turn" : "Opponent's turn";
    }
  });

  socket.on('gameOver', (data) => {
    winLine.value = data.winLine;
    players.value = data.players;
    gameStatus.value = 'finished';
    
    if (data.lastMove) {
      latestMove.value = { row: data.lastMove.row, col: data.lastMove.col };
      
      if (board.value[data.lastMove.row][data.lastMove.col] === null) {
        const winner = players.value.find(p => p.id === data.winner);
        if (winner) {
          board.value[data.lastMove.row][data.lastMove.col] = winner.mark;
        }
      }
    }
    
    const winner = players.value.find(p => p.id === data.winner);
    if (winner) {
      if (winner.mark === props.playerMark) {
        statusMessage.value = "You won!";
      } else {
        statusMessage.value = "You lost!";
      }
    }
  });

  socket.on('gameDraw', () => {
    statusMessage.value = "Game ended in a draw!";
  });

  socket.on('gameReset', (data) => {
    board.value = data.board;
    currentTurn.value = data.currentTurn;
    gameStatus.value = data.gameStatus;
    winLine.value = [];
    latestMove.value = { row: null, col: null };
    
    const myPlayer = players.value.find(p => p.id === socket.id);
    const firstPlayer = players.value.find(p => p.id === data.currentTurn);
    
    if (firstPlayer) {
      if (myPlayer && myPlayer.id === data.currentTurn) {
        statusMessage.value = `New game started. You go first (winners start)!`;
      } else {
        statusMessage.value = `New game started. Player ${firstPlayer.mark} goes first!`;
      }
    } else {
      statusMessage.value = "Game restarted";
    }
  });

  socket.on('opponentLeft', () => {
    statusMessage.value = "Your opponent left the game.";
    emit('opponentLeft', "Your opponent left the game");
  });

  socket.on('playerReady', (data) => {
    if (data.playerId === socket.id) {
      iAmReady.value = true;
    } else {
      opponentReady.value = true;
    }
    
    if (data.playerId !== socket.id) {
      statusMessage.value = `Player ${data.playerMark} is ready to play again!`;
    }
    
    if (data.allReady) {
      waitingForOpponent.value = false;
      opponentReady.value = false;
      iAmReady.value = false;
    }
  });
}

function makeMove(row, col) {
  if (gameStatus.value !== 'playing') {
    return;
  }
  
  if (!isMyTurn.value) {
    return;
  }
  
  if (board.value[row][col] !== null) {
    return;
  }

  latestMove.value = { row, col };

  socket.emit('makeMove', {
    roomId: props.roomId,
    row,
    col
  });
}

function copyRoomCode() {
  navigator.clipboard.writeText(props.roomId)
    .then(() => {
      roomCodeCopied.value = true;
      setTimeout(() => {
        roomCodeCopied.value = false;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy room code: ', err);
    });
}

const roomCodeCopied = ref(false);
const linkCopied = ref(false);

function readyToPlay() {
  socket.emit('readyToPlay', props.roomId);
  waitingForOpponent.value = true;
  statusMessage.value = "Waiting for opponent to play again...";
}

function copyLink() {
  navigator.clipboard.writeText(shareLink.value)
    .then(() => {
      linkCopied.value = true;
      setTimeout(() => {
        linkCopied.value = false;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy link: ', err);
    });
}

function leaveGame() {
  if (props.roomId) {
    socket.emit('leaveRoom', props.roomId);
  }
  
  emit('leaveGame');
}

function isWinningCell(row, col) {
  return winLine.value.some(cell => cell.row === row && cell.col === col);
}
</script>

<template>
  <div>
    <div class="mb-3 sm:mb-4 bg-white p-3 sm:p-6 rounded-lg shadow-lg">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-4 gap-2 sm:gap-4">
        <div class="w-full flex flex-col items-center">
          <h2 class="text-base sm:text-xl font-bold flex items-center">
            <span class="mr-1 sm:mr-2">Room:</span> 
            <div class="relative flex items-center">
              <span class="bg-blue-100 text-blue-800 text-sm sm:text-base px-1 sm:px-2 py-0.5 sm:py-1 rounded-md mr-1 sm:mr-2">{{ roomId }}</span>
              <button 
                v-if="gameStatus === 'waiting'"
                @click="copyRoomCode" 
                class="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Copy room code"
              >
                <span v-if="roomCodeCopied" class="text-green-600">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
                <span v-else class="text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </span>
              </button>
            </div>
          </h2>
          
          <h2 v-if="gameStatus === 'waiting'" class="text-base sm:text-xl font-bold flex items-center mt-1 sm:mt-2">
            <span class="mr-1 sm:mr-2">Invite:</span>
            <div class="relative flex items-center">
              <span class="bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 sm:py-1 rounded-md mr-1 sm:mr-2 text-xs sm:text-sm overflow-hidden text-ellipsis max-w-[180px] sm:max-w-none">{{ shareLink }}</span>
              <button 
                @click="copyLink" 
                class="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Copy invite link"
              >
                <span v-if="linkCopied" class="text-green-600">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
                <span v-else class="text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </span>
              </button>
            </div>
          </h2>
        </div>
      </div>
      
      <div class="flex flex-col sm:flex-row justify-between items-center">
        <div class="text-sm sm:text-lg font-medium px-2 sm:px-4 py-1 sm:py-2 rounded-lg bg-gray-50 w-full mx-auto sm:mx-0 sm:w-auto text-center mb-2 sm:mb-0 max-w-xs sm:max-w-none">
          {{ statusMessage }}
        </div>
        
        <div class="flex items-center space-x-3 sm:space-x-6">
          <!-- Show Play Again button to both players when game is finished -->
          <button 
            v-if="gameStatus === 'finished' && !iAmReady" 
            @click="readyToPlay" 
            class="btn btn-primary text-xs sm:text-sm flex items-center gap-1 py-1 sm:py-2 px-2 sm:px-3"
            :disabled="waitingForOpponent"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Play Again
          </button>
          
          <button 
            @click="leaveGame" 
            class="btn btn-secondary text-xs sm:text-sm flex items-center gap-1 py-1 sm:py-2 px-2 sm:px-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Leave
          </button>
          
          <!-- Show "Waiting" indicator when player is ready but opponent is not -->
          <div v-if="waitingForOpponent && iAmReady && !opponentReady && gameStatus === 'finished'" 
               class="text-xs sm:text-sm text-yellow-600 bg-yellow-50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg flex items-center">
            <svg class="animate-spin -ml-1 mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Waiting for opponent...
          </div>
        </div>
      </div>
    </div>
    
    <!-- Score cards - moved outside of board container and responsive design applied -->
    <div class="flex justify-center mb-1 sm:mb-4 gap-2 sm:gap-8">
      <div class="score-card shadow-md">
        <div class="bg-blue-100 text-blue-800 font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-l-lg text-sm sm:text-base flex items-center">
          X <span v-if="playerMark === 'X'" class="text-xs ml-0.5">(you)</span>
        </div>
        <div class="bg-gray-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-r-lg font-bold text-lg sm:text-xl min-w-[1.5rem] sm:min-w-[2rem] text-center flex items-center justify-center">{{ scores.X }}</div>
      </div>
      <div class="score-card shadow-md">
        <div class="bg-red-100 text-red-800 font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-l-lg text-sm sm:text-base flex items-center">
          O <span v-if="playerMark === 'O'" class="text-xs ml-0.5">(you)</span>
        </div>
        <div class="bg-gray-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-r-lg font-bold text-lg sm:text-xl min-w-[1.5rem] sm:min-w-[2rem] text-center flex items-center justify-center">{{ scores.O }}</div>
      </div>
    </div>
    
    <div class="bg-white p-2 sm:p-6 rounded-lg shadow-lg overflow-auto">
      <div class="board-container mx-auto">
        <div class="grid gap-0.5 w-fit mx-auto board-grid">
          <template v-for="(row, rowIndex) in board" :key="'row-' + rowIndex">
            <div 
              v-for="(cell, colIndex) in row" 
              :key="`${rowIndex}-${colIndex}`"
              @click="makeMove(rowIndex, colIndex)"
              class="board-cell"
              :class="{ 
                'winning-cell': isWinningCell(rowIndex, colIndex),
                'non-playable': cell !== null || gameStatus !== 'playing' || !isMyTurn,
                'playable': cell === null && gameStatus === 'playing' && isMyTurn,
                'recent-move': rowIndex === latestMove.row && colIndex === latestMove.col
              }"
            >
              <span 
                v-if="cell === 'X'" 
                class="mark x-mark"
              >
                X
              </span>
              <span 
                v-else-if="cell === 'O'" 
                class="mark o-mark"
              >
                O
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-card {
  display: flex;
  border-radius: 0.5rem;
  overflow: hidden;
}

.board-grid {
  grid-template-columns: repeat(15, minmax(1.5vw, 1fr));
  background-color: #d9b38c;
  padding: 4px;
  border-radius: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.board-container {
  max-width: 100%;
  overflow-x: auto;
}

.board-cell {
  width: 2.8vw;
  height: 2.8vw;
  max-width: 30px;
  max-height: 30px;
  min-width: 20px;
  min-height: 20px;
  background-color: #e9c497;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

@media (min-width: 640px) {
  .board-cell {
    width: 3vw;
    height: 3vw;
    max-width: 40px;
    max-height: 40px;
  }
}

.non-playable {
  cursor: not-allowed;
}

.playable:hover {
  background-color: #f0d2a8;
}

.winning-cell {
  background-color: #9ae6b4 !important;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.winning-cell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    45deg,
    rgba(0, 200, 0, 0.2),
    rgba(0, 200, 0, 0.2) 5px,
    rgba(0, 200, 0, 0.3) 5px,
    rgba(0, 200, 0, 0.3) 10px
  );
  animation: shimmer 2s linear infinite;
  z-index: -1;
}

@keyframes shimmer {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 28px 28px;
  }
}

.recent-move {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.mark {
  font-weight: bold;
  font-size: 16px;
  z-index: 2;
  position: relative;
}

@media (min-width: 640px) {
  .mark {
    font-size: 25px;
  }
}

.winning-cell .mark {
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
}

.x-mark {
  color: #2b6cb0;
}

.o-mark {
  color: #c53030;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style> 