<script setup>
import { ref, inject } from 'vue';

const emit = defineEmits(['roomCreated', 'back']);
const isLoading = ref(false);
const socket = inject('socket');

function createRoom() {
  isLoading.value = true;
  
  socket.emit('createRoom', (response) => {
    isLoading.value = false;
    
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
  <div class="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
    <h2 class="text-2xl font-bold text-center mb-6">Create a New Room</h2>
    
    <p class="mb-6 text-gray-600 text-center">
      Create a new game room and invite a friend to play
    </p>
    
    <div class="flex flex-col items-center justify-center space-y-4">
      <button 
        @click="createRoom" 
        class="btn btn-primary py-3 px-8 text-lg w-full max-w-xs"
        :disabled="isLoading"
      >
        <span v-if="isLoading">Creating...</span>
        <span v-else>Create Room</span>
      </button>
      
      <button 
        @click="emit('back')" 
        class="btn btn-secondary py-2 px-4"
        :disabled="isLoading"
      >
        Back to Home
      </button>
    </div>
  </div>
</template> 