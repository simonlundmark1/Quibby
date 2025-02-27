<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  let roomCode = $page.params.code;
  let loading = true;
  let stats = null;
  let playerStats = [];
  let chartData = {
    labels: [],
    datasets: []
  };
  
  onMount(async () => {
    try {
      // Fetch stats for this room
      const response = await fetch(`/api/rooms/${roomCode}/stats`);
      
      if (!response.ok) {
        throw new Error('Failed to load stats');
      }
      
      const data = await response.json();
      stats = data.stats;
      playerStats = data.playerStats;
      
      // Prepare chart data
      chartData.labels = Array.from({ length: stats.totalRounds }, (_, i) => `Round ${i+1}`);
      
      // Create a dataset for each player
      chartData.datasets = playerStats.map((player, index) => {
        // Generate colors based on index
        const hue = (index * 137) % 360;
        
        return {
          label: player.name,
          data: chartData.labels.map(label => {
            const roundNum = parseInt(label.split(' ')[1]);
            return player.scoreBreakdown.roundBreakdown[roundNum] || 0;
          }),
          backgroundColor: `hsla(${hue}, 70%, 60%, 0.6)`,
          borderColor: `hsl(${hue}, 70%, 50%)`,
          borderWidth: 2
        };
      });
      
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-gray-100 py-12 px-4">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold text-center text-blue-800 mb-8">
      Game Statistics: Room {roomCode}
    </h1>
    
    {#if loading}
      <div class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    {:else if stats}
      <div class="grid md:grid-cols-2 gap-8">
        <!-- Game summary -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold text-blue-700 mb-4">Game Summary</h2>
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-gray-600">Total Rounds:</span>
              <span class="font-bold">{stats.totalRounds}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Total Players:</span>
              <span class="font-bold">{stats.totalPlayers}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Total Points Awarded:</span>
              <span class="font-bold">{stats.totalPoints}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Average Points Per Round:</span>
              <span class="font-bold">{Math.round(stats.avgPointsPerRound)}</span>
            </div>
          </div>
        </div>
        
        <!-- Leaderboard -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold text-blue-700 mb-4">Leaderboard</h2>
          <div class="space-y-3">
            {#each playerStats as player, i}
              <div class="flex items-center p-3 rounded-lg" 
                class:bg-yellow-100={i === 0}
                class:bg-blue-50={i !== 0 && i < 3}
                class:bg-gray-50={i >= 3}>
                <div class="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold mr-3"
                  class:bg-yellow-500={i === 0}
                  class:bg-blue-500={i === 1}
                  class:bg-blue-400={i === 2}
                  class:bg-gray-400={i >= 3}>
                  {i + 1}
                </div>
                <div class="flex-grow">
                  <div class="font-bold">{player.name}</div>
                  <div class="text-xs text-gray-500">
                    {player.scoreBreakdown.correctGuesses} pts from correct guesses • 
                    {player.scoreBreakdown.playersDeceived} pts from deceptions
                  </div>
                </div>
                <div class="text-xl font-bold text-blue-700">{player.totalScore}</div>
              </div>
            {/each}
          </div>
        </div>
        
        <!-- Round performance chart -->
        <div class="bg-white rounded-xl shadow-md p-6 md:col-span-2">
          <h2 class="text-xl font-bold text-blue-700 mb-4">Score Progression</h2>
          <div class="h-80">
            <!-- You would need to integrate a chart library like Chart.js here -->
            <p class="text-center text-gray-500 italic">
              Chart visualization would go here - using data from player round breakdowns
            </p>
          </div>
        </div>
        
        <!-- Player performance breakdown -->
        <div class="bg-white rounded-xl shadow-md p-6 md:col-span-2">
          <h2 class="text-xl font-bold text-blue-700 mb-4">Player Performance Breakdown</h2>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Score</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Correct Guesses</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Players Deceived</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Best Round</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each playerStats as player}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap font-medium">{player.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap">{player.totalScore}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      {player.scoreBreakdown.correctGuesses} pts
                      ({Math.round(player.scoreBreakdown.correctGuesses/player.totalScore*100) || 0}%)
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      {player.scoreBreakdown.playersDeceived} pts
                      ({Math.round(player.scoreBreakdown.playersDeceived/player.totalScore*100) || 0}%)
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      {player.bestRound ? `Round ${player.bestRound.round} (${player.bestRound.score} pts)` : 'N/A'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {:else}
      <div class="text-center text-red-600 p-8">
        Failed to load statistics. Please try again.
      </div>
    {/if}
    
    <div class="mt-8 text-center">
      <a href="/host/{roomCode}" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">
        Back to Game
      </a>
    </div>
  </div>
</div> 