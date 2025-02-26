<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { generateUUID } from '$lib/utils';
  
  let roomCode = '';
  let playerName = '';
  let errorMessage = '';
  
  onMount(() => {
    playerName = localStorage.getItem('quibbyUserName') || '';
    
    // Generate a unique user ID if not exists
    if (!localStorage.getItem('quibbyUserId')) {
      const userId = crypto.randomUUID();
      localStorage.setItem('quibbyUserId', userId);
    }
  });
  
  function joinGame() {
    if (!roomCode.trim() || !playerName.trim()) return;
    
    localStorage.setItem('quibbyUserName', playerName);
    window.location.href = `/join/${roomCode.toUpperCase()}`;
  }
</script>

<div class="min-h-screen bg-gradient-to-b from-purple-700 to-indigo-900 flex flex-col items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
    <h1 class="text-4xl font-bold text-center text-indigo-600 mb-6">Join Game</h1>
    
    {#if errorMessage}
      <div class="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
        {errorMessage}
      </div>
    {/if}
    
    <div class="mb-6">
      <label for="room-code" class="block text-sm font-medium text-gray-700 mb-1">Room Code</label>
      <input
        id="room-code"
        type="text"
        bind:value={roomCode}
        class="w-full px-4 py-2 border border-gray-300 rounded-md uppercase focus:ring-indigo-500 focus:border-indigo-500"
        placeholder="Enter room code"
        maxlength="4"
      />
    </div>
    
    <div class="mb-6">
      <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
      <input
        id="name"
        type="text"
        bind:value={playerName}
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        placeholder="Enter your name"
      />
    </div>
    
    <button
      on:click={joinGame}
      class="w-full bg-indigo-600 text-white py-3 px-6 rounded-md font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
      disabled={!roomCode.trim() || !playerName.trim()}
    >
      Join Game
    </button>
  </div>
</div> 