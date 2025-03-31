<script setup>
import { ref, inject } from 'vue';

const emit = defineEmits(['roomCreated', 'joinRoom']);
const socket = inject('socket');
const isCreatingRoom = ref(false);

function createRoomDirectly() {
  isCreatingRoom.value = true;
  
  socket.emit('createRoom', (response) => {
    isCreatingRoom.value = false;
    
    if (response.roomId) {
      emit('roomCreated', {
        roomId: response.roomId,
        mark: response.mark
      });
    }
  });
}
</script>

<template>
  <div class="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-100">
    <div class="text-center mb-6">
      <h2 class="text-3xl font-bold text-gray-800 mb-4">Five In A Row</h2>
      <p class="text-gray-600">
        Play the classic strategy game with friends online!
      </p>
    </div>
    
    <div class="mb-8 flex flex-col space-y-4">
      <button 
        @click="createRoomDirectly" 
        class="btn btn-primary py-3 text-lg flex items-center justify-center gap-2"
        :disabled="isCreatingRoom"
      >
        <svg v-if="isCreatingRoom" class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span v-if="isCreatingRoom">Creating Room...</span>
        <span v-else>Create a New Game</span>
      </button>
      
      <button 
        @click="emit('joinRoom')" 
        class="btn btn-secondary py-3 text-lg flex items-center justify-center gap-2"
        :disabled="isCreatingRoom"
      >
        Join Existing Game
      </button>
    </div>
    
    <div class="bg-blue-50 rounded-lg p-5">
      <h3 class="font-bold text-blue-800 mb-3 text-lg">How to Play</h3>
      <ul class="space-y-3">
        <li class="flex items-start">
          <div class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xs mr-2">1</div>
          <span class="mt-1">Take turns placing your marks on the board</span>
        </li>
        <li class="flex items-start">
          <div class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xs mr-2">2</div>
          <span class="mt-1">Be the first to get <strong>five marks in a row</strong> (horizontal, vertical, or diagonal)</span>
        </li>
        <li class="flex items-start">
          <div class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xs mr-2">3</div>
          <span class="mt-1">Block your opponent from forming five in a row</span>
        </li>
      </ul>
      
      <div class="mt-4 text-sm text-blue-700 flex items-center">
        Share the room link with friends to play together!
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn {
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
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