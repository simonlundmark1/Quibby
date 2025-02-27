<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { generateUUID } from '$lib/utils';
  
  let hostName = '';
  let userId = '';
  let categories = [''];
  let useDefaultCategories = true;
  
  onMount(() => {
    // Get or create user ID from local storage
    userId = localStorage.getItem('quibbyUserId') || generateUUID();
    localStorage.setItem('quibbyUserId', userId);
  });
  
  function addCategory() {
    categories = [...categories, ''];
  }
  
  function removeCategory(index: number) {
    categories = categories.filter((_, i) => i !== index);
  }
  
  async function createRoom() {
    if (!hostName.trim()) return;
    
    const finalCategories = useDefaultCategories ? [] : categories.filter(cat => cat.trim());
    console.log('Submitting categories:', finalCategories);
    
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          hostId: userId, 
          hostName,
          categories: finalCategories
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Room created, response:', data);
      
      if (data.roomCode) {
        localStorage.setItem('quibbyUserName', hostName);
        console.log('Redirecting to:', `/host/${data.roomCode}`);
        
        // Use window.location.href instead of goto for more reliable navigation
        window.location.href = `/host/${data.roomCode}`;
      } else {
        console.error('No room code returned from server');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      // Optionally show error message to user
    }
  }
  
  function joinRoom() {
    if (!hostName.trim()) return;
    localStorage.setItem('quibbyUserName', hostName);
    window.location.href = '/join';
  }
</script>

<div class="min-h-screen bg-gradient-to-b from-purple-700 to-indigo-900 flex flex-col items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
    <h1 class="text-5xl font-bold text-center text-indigo-600 mb-6">Quibby</h1>
    <p class="text-center text-gray-600 mb-8">A game of clever lies and silly truths!</p>
    
    <div class="mb-6">
      <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
      <input
        id="name"
        type="text"
        bind:value={hostName}
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        placeholder="Enter your name"
      />
    </div>
    
    <div class="mb-6">
      <div class="flex items-center mb-2">
        <h3 class="text-md font-semibold flex-grow">Question Categories</h3>
        <label class="inline-flex items-center cursor-pointer">
          <span class="mr-2 text-sm text-gray-700">Use Default</span>
          <input type="checkbox" bind:checked={useDefaultCategories} class="form-checkbox h-4 w-4 text-indigo-600">
        </label>
      </div>
      
      {#if !useDefaultCategories}
        <div class="space-y-3 mb-3">
          {#each categories as category, i}
            <div class="flex items-center space-x-2">
              <input
                type="text"
                bind:value={categories[i]}
                class="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., World of Warcraft, Movies, History"
              />
              <button 
                on:click={() => removeCategory(i)}
                class="p-2 text-red-500 hover:text-red-700"
                disabled={categories.length === 1}
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
        
        <button
          on:click={addCategory}
          class="text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
        >
          + Add Another Category
        </button>
      {:else}
        <p class="text-sm text-gray-500 italic">Using random trivia categories</p>
      {/if}
    </div>
    
    <div class="flex flex-col space-y-4">
      <button
        on:click={createRoom}
        class="w-full bg-indigo-600 text-white py-3 px-6 rounded-md font-medium hover:bg-indigo-700 transition-colors"
      >
        Create Room
      </button>
      
      <button
        on:click={joinRoom}
        class="w-full bg-purple-600 text-white py-3 px-6 rounded-md font-medium hover:bg-purple-700 transition-colors"
      >
        Join Room
      </button>
    </div>
  </div>
</div>
