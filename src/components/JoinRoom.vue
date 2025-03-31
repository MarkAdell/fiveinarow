<script setup>
import { ref, inject, onMounted } from 'vue';

const props = defineProps({
  initialRoomId: {
    type: String,
    default: ''
  },
  initialError: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['roomJoined', 'back']);
const roomId = ref(props.initialRoomId || '');
const error = ref(props.initialError || '');
const isLoading = ref(false);
const socket = inject('socket');

onMounted(() => {
  if (props.initialRoomId) {
    roomId.value = props.initialRoomId;
  }
  
  if (props.initialError) {
    error.value = props.initialError;
  }
});

function joinRoom() {
  if (!roomId.value) {
    error.value = 'Please enter a room ID';
    return;
  }
  
  error.value = '';
  isLoading.value = true;
    
  socket.emit('joinRoom', roomId.value.toUpperCase(), (response) => {
    isLoading.value = false;    
    if (response.error) {
      error.value = response.error;
    } else if (response.success) {      
      emit('roomJoined', {
        roomId: roomId.value.toUpperCase(),
        mark: response.mark,
        currentTurn: response.currentTurn,
        players: response.players
      });
    }
  });
}
</script>

<template>
  <div class="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-100">
    <div class="flex items-center justify-center mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <h2 class="text-2xl font-bold text-gray-800">Join a Game</h2>
    </div>
    
    <p class="mb-6 text-gray-600 text-center">
      Enter the room code shared by your friend
    </p>
    
    <div class="space-y-6">
      <div>
        <input
          id="roomId"
          v-model="roomId"
          type="text"
          placeholder="Enter 6-digit code (e.g. ABC123)"
          class="w-full py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors uppercase text-center tracking-wider font-medium"
          maxlength="6"
          @keyup.enter="joinRoom"
          :disabled="isLoading"
        />
        <div v-if="error" class="mt-2 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
          <div class="flex">
            <svg class="h-5 w-5 text-red-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            {{ error }}
          </div>
        </div>
      </div>
      
      <button 
        @click="joinRoom" 
        class="btn btn-primary py-3 px-8 text-lg w-full flex items-center justify-center"
        :disabled="isLoading"
      >
        <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span v-if="isLoading">Joining Game...</span>
        <span v-else>Join Game</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.btn {
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style> 