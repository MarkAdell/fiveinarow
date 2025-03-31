<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import HomePage from './components/HomePage.vue';
import JoinRoom from './components/JoinRoom.vue';
import GameBoard from './components/GameBoard.vue';

// Get socket for room joining
const socket = inject('socket');

const currentView = ref('home');
const roomId = ref('');
const playerMark = ref('');
const isCreator = ref(false);
const joinError = ref('');
const gameMessage = ref('');
const showGameMessage = ref(false);

function setView(view, data = {}) {
  currentView.value = view;
  
  if (view === 'join' && !data.roomId) {
    roomId.value = '';
    joinError.value = '';
  }
  else if (data.roomId) {
    roomId.value = data.roomId;
  }
  
  if (data.mark) {
    playerMark.value = data.mark;
    isCreator.value = data.mark === 'X';
  }
}

function handleRoomCreated(data) {
  setView('game', data);
}

// Automatically join a room from URL
function joinRoomFromId(roomIdToJoin) {
  if (!roomIdToJoin) return;
  
  joinError.value = '';
  
  socket.emit('joinRoom', roomIdToJoin, (response) => {
    if (response.error) {
      joinError.value = response.error;
      currentView.value = 'join';
    } else if (response.success) {
      roomId.value = roomIdToJoin;
      playerMark.value = response.mark;
      isCreator.value = response.mark === 'X';
      currentView.value = 'game';
    }
  });
}

function handleOpponentLeft(message) {
  gameMessage.value = message || "Your opponent left the game";
  showGameMessage.value = true;
  
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url);
  
  currentView.value = 'home';
  
  setTimeout(() => {
    showGameMessage.value = false;
  }, 3000);
}

function goHome() {
  if (currentView.value === 'game' && roomId.value) {
    socket.emit('leaveRoom', roomId.value);
  }
  
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url);
  
  currentView.value = 'home';
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  
  if (roomParam) {
    roomId.value = roomParam;
    joinRoomFromId(roomParam);
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <header class="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5 shadow-lg">
      <div class="container mx-auto flex justify-center items-center">
        <h1 
          class="text-3xl font-bold cursor-pointer hover:text-blue-100 transition-colors flex items-center"
          @click="goHome"
        >
          Five In A Row
        </h1>
      </div>
    </header>

    <main class="flex-1 container mx-auto px-4 py-8">
      <!-- Game message notification -->
      <transition name="fade">
        <div 
          v-if="showGameMessage" 
          class="mb-6 bg-yellow-50 border border-yellow-200 p-4 rounded-lg shadow-md flex items-start"
        >
          <svg class="h-6 w-6 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="text-lg font-medium text-yellow-800">{{ gameMessage }}</p>
          </div>
        </div>
      </transition>
      
      <!-- Main content section -->
      <div>
        <HomePage 
          v-if="currentView === 'home'" 
          @room-created="handleRoomCreated" 
          @join-room="setView('join')" 
        />
        
        <JoinRoom 
          v-if="currentView === 'join'" 
          :initial-room-id="roomId"
          :initial-error="joinError"
          @room-joined="setView('game', $event)" 
          @back="setView('home')" 
        />
        
        <GameBoard 
          v-if="currentView === 'game'" 
          :room-id="roomId" 
          :player-mark="playerMark"
          :is-creator="isCreator"
          @leave-game="setView('home')" 
          @opponent-left="handleOpponentLeft"
        />
      </div>
    </main>

    <footer class="bg-gray-800 text-white p-2">
      <div class="container mx-auto text-center">
        <p class="text-sm text-gray-300">Five In A Row © {{ new Date().getFullYear() }}</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(-5%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}
.animate-bounce {
  animation: bounce 1s infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
