<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  
  interface Player {
    id: string;
    name: string;
    [key: string]: any;
  }

  interface Question {
    id: string;
    text: string;
    correctAnswer: string;
    roomId: string;
    roundNumber: number;
    [key: string]: any;
  }

  interface Answer {
    id: string;
    text: string;
    userId: string;
    questionId: string;
    votes: number;
    user?: {
      name: string;
    };
    [key: string]: any;
  }
  
  let roomCode = $page.params.code;
  let roomStatus = 'LOBBY';
  let players: Player[] = [];
  let room: any = null;
  let currentQuestion: Question | null = null;
  let answers: Answer[] = [];
  let castingAvailable = false;
  let castButton: any;
  let currentRound = 0;
  
  // Set up real-time subscription
  let subscription: any;
  
  // Fallback polling every 2 seconds
  let pollingInterval: ReturnType<typeof setInterval>;
  
  // Add some game stats
  let totalRounds = 0;
  let leaderboard = [];
  
  onMount(async () => {
    // Load room data
    await fetchRoomData();
    
    // Subscribe to room changes
    setupRealtimeSubscription();
    
    // Set up Chromecast
    setupChromecast();
    
    // Fallback polling every 2 seconds
    pollingInterval = setInterval(fetchRoomData, 2000);
  });
  
  onDestroy(() => {
    if (subscription) {
      subscription.unsubscribe();
    }
    
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });
  
  async function fetchRoomData() {
    console.log('Fetching room data for room:', roomCode);
    
    try {
      const response = await fetch(`/api/rooms/${roomCode}`);
      if (!response.ok) {
        console.error('Error fetching room data:', response.status);
        return;
      }
      
      const data = await response.json();
      
      // Log the raw data to check if players are included
      console.log('Raw API response:', data);
      
      if (data.error) {
        console.error('API returned error:', data.error);
        return;
      }
      
      room = data.room;
      players = data.players || [];
      roomStatus = data.room.status;
      currentRound = data.room.currentRound;
      
      console.log('Room data processed. Players:', players);
      
      // If we have the current question data from the API
      if (data.currentQuestion) {
        currentQuestion = data.currentQuestion;
        answers = data.answers;
      } else if (roomStatus !== 'LOBBY') {
        // Fallback to fetching question separately if needed
        await fetchCurrentQuestion();
      }
      
      // Calculate leaderboard if in results phase
      if (roomStatus === 'RESULTS') {
        // Create leaderboard from players and answers
        leaderboard = players.map(player => {
          // Find player's answers
          const playerAnswers = data.allAnswers?.filter(a => a.userId === player.id) || [];
          
          // Calculate votes received on player's bluffs
          const bluffPoints = playerAnswers.reduce((sum, answer) => sum + (answer.votes * 100), 0);
          
          // Calculate correct votes (300 points each)
          const correctVotes = data.votes?.filter(vote => 
            vote.userId === player.id && 
            data.allAnswers?.find(a => 
              a.id === vote.answerId && 
              a.text.toLowerCase() === a.question.correctAnswer.toLowerCase()
            )
          ).length || 0;
          
          const correctPoints = correctVotes * 300;
          
          return {
            id: player.id,
            name: player.name,
            score: bluffPoints + correctPoints
          };
        });
        
        // Sort by score
        leaderboard.sort((a, b) => b.score - a.score);
      }
    } catch (error) {
      console.error('Error fetching room data:', error);
    }
  }
  
  async function fetchCurrentQuestion() {
    const { data: question } = await supabase
      .from('Question')
      .select('*')
      .eq('roomId', roomCode)
      .eq('roundNumber', currentRound)
      .single();
      
    if (question) {
      currentQuestion = question;
      await fetchAnswers();
    }
  }
  
  async function fetchAnswers() {
    if (!currentQuestion) return;
    
    const { data } = await supabase
      .from('Answer')
      .select('*, user:User(name)')
      .eq('questionId', currentQuestion.id);
      
    if (data) {
      answers = data;
    }
  }
  
  function setupRealtimeSubscription() {
    console.log('Setting up realtime subscription for room:', roomCode);
    
    subscription = supabase
      .channel('room-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'Room',
        filter: `code=eq.${roomCode}`
      }, (payload) => {
        console.log('Room update received:', payload);
        fetchRoomData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'User'
      }, (payload) => {
        console.log('User update received:', payload);
        fetchRoomData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Question'
      }, fetchCurrentQuestion)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Answer'
      }, fetchAnswers)
      .subscribe();
  }
  
  async function startGame() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}/start`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const data = await response.json();
        console.error('Error starting game:', data.error);
        return;
      }
      
      console.log('Game started successfully');
      fetchRoomData();
    } catch (error) {
      console.error('Error starting game:', error);
    }
  }
  
  function setupChromecast() {
    // Cast API will be loaded asynchronously
    window['__onGCastApiAvailable'] = function(isAvailable) {
      if (isAvailable) {
        initializeCastApi();
      }
    };
  }
  
  function initializeCastApi() {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    
    castingAvailable = true;
    castButton = new cast.framework.CastButton(document.getElementById('cast-button'));
  }
  
  // Add function to move to voting phase
  async function startVoting() {
    await fetch(`/api/rooms/${roomCode}/start-voting`, {
      method: 'POST'
    });
  }
</script>

<svelte:head>
  <script type="text/javascript" src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-blue-800 to-purple-900 p-4">
  <div class="max-w-4xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <div class="flex items-center">
        <h1 class="text-4xl font-bold text-white mr-2">Quibby</h1>
        <div class="bg-yellow-400 text-blue-900 font-bold rounded-lg px-4 py-2 text-xl">
          {roomCode}
        </div>
      </div>
      
      <div class="flex items-center space-x-4">
        {#if currentRound > 0}
          <div class="bg-white rounded-lg px-4 py-2 text-blue-800 font-bold">
            Round {currentRound}
          </div>
        {/if}
        <div id="cast-button"></div>
      </div>
    </div>
    
    {#if roomStatus === 'LOBBY'}
      <div class="grid md:grid-cols-2 gap-8">
        <div class="bg-white rounded-xl shadow-lg p-8">
          <h2 class="text-3xl font-bold text-center mb-6">Game Setup</h2>
          
          <button 
            on:click={startGame}
            disabled={players.length < 2}
            class="w-full bg-blue-600 text-white py-3 px-6 rounded-md text-xl font-bold hover:bg-blue-700 transition-colors"
            class:opacity-50={players.length < 2}
          >
            {players.length < 2 ? 'NEED MORE PLAYERS' : 'START GAME'}
          </button>
          
          <div class="text-center text-sm text-gray-500 mt-2">
            {players.length < 2 ? `At least 2 players needed (currently ${players.length})` : 'Ready to start!'}
          </div>
        </div>
        
        <div class="bg-white rounded-xl shadow-lg p-8">
          <h2 class="text-2xl font-bold mb-4">Players ({players.length})</h2>
          
          {#if players.length === 0}
            <div class="text-center text-gray-500 py-4">
              No players have joined yet
            </div>
          {:else}
            <div class="space-y-2">
              {#each players as player}
                <div class="bg-blue-100 p-3 rounded-lg">
                  <div class="font-medium text-blue-800">{player.name}</div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if roomStatus === 'QUESTION' || roomStatus === 'ANSWERING'}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          PLAYERS ARE ANSWERING
        </div>
        <div class="p-8">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <p class="text-center text-xl font-bold text-blue-900">{currentQuestion.text}</p>
            <p class="text-center text-green-700 font-bold mt-2">Answer: {currentQuestion.correctAnswer}</p>
          </div>
          
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-3 text-blue-800">Player Answers ({answers.length}/{players.length}):</h3>
            
            {#if answers.length === 0}
              <div class="text-center text-gray-500 py-4">
                Waiting for players to submit answers...
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each answers as answer}
                  <div class="bg-blue-100 p-3 rounded-lg border-2 border-blue-300">
                    <div class="font-medium text-blue-800">{answer.text}</div>
                    <div class="text-sm text-gray-600">{answer.user?.name}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          
          <!-- Add button to move to voting once enough answers are in -->
          {#if answers.length > 0}
            <button 
              on:click={startVoting}
              class="w-full bg-blue-600 text-white py-3 px-6 rounded-md text-xl font-bold hover:bg-blue-700 transition-colors transform hover:scale-105 transition-transform"
            >
              START VOTING ({answers.length}/{players.length} answers)
            </button>
          {/if}
        </div>
      </div>
    {:else if roomStatus === 'VOTING' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          PLAYERS ARE VOTING
        </div>
        <div class="p-8">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <p class="text-center text-xl font-bold text-blue-900">{currentQuestion.text}</p>
            <p class="text-center text-green-700 font-bold mt-2">Answer: {currentQuestion.correctAnswer}</p>
          </div>
          
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-3 text-blue-800">All Answers:</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {#each [...answers, { text: currentQuestion.correctAnswer, isCorrect: true }] as answer, index}
                <div class="bg-blue-100 p-4 rounded-lg text-center border-2"
                  class:border-green-500={answer.isCorrect}
                  class:border-blue-300={!answer.isCorrect}>
                  <div class="inline-block w-8 h-8 bg-blue-600 text-white rounded-full text-center font-bold leading-8 mb-2">
                    {String.fromCharCode(65 + index)}
                  </div>
                  <div class="font-bold text-lg text-blue-800">{answer.text}</div>
                  {#if answer.isCorrect}
                    <div class="text-green-600 font-bold mt-1">TRUTH!</div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          
          <div class="flex justify-center">
            <div class="animate-pulse text-blue-800 font-bold">
              Waiting for players to vote...
            </div>
          </div>
        </div>
      </div>
    {:else if roomStatus === 'RESULTS' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          ROUND RESULTS
        </div>
        <div class="p-8">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-4">
            <p class="text-center text-xl font-bold text-blue-900">{currentQuestion.text}</p>
          </div>
          
          <div class="bg-green-100 border-2 border-green-500 p-4 rounded-lg mb-6 text-center">
            <p class="text-green-800 font-bold mb-1 text-sm">CORRECT ANSWER</p>
            <p class="text-2xl font-bold text-blue-800">{currentQuestion.correctAnswer}</p>
          </div>
          
          <div class="space-y-4 mb-8">
            <h3 class="text-lg font-bold text-blue-800 mb-3">Round Stats:</h3>
            {#each answers.sort((a, b) => b.votes - a.votes) as answer}
              <div class="flex justify-between items-center bg-blue-50 p-4 rounded-lg border-l-4"
                class:border-green-500={answer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()}
                class:border-blue-500={answer.text.toLowerCase() !== currentQuestion.correctAnswer.toLowerCase()}>
                <div>
                  <span class="font-bold text-blue-800">{answer.text}</span>
                  <span class="text-gray-500 text-sm"> - {answer.user?.name}</span>
                  
                  {#if answer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()}
                    <span class="ml-2 text-green-600 font-bold">✓ TRUTH!</span>
                  {/if}
                </div>
                <div class="text-purple-700 font-bold">
                  {answer.votes} {answer.votes === 1 ? 'vote' : 'votes'}
                </div>
              </div>
            {/each}
          </div>
          
          {#if leaderboard.length > 0}
            <div class="mb-8">
              <h3 class="text-lg font-bold text-blue-800 mb-3">Leaderboard:</h3>
              <div class="bg-blue-50 rounded-lg overflow-hidden border border-blue-200">
                {#each leaderboard as player, index}
                  <div class="flex items-center p-3 border-b border-blue-200 last:border-0"
                    class:bg-yellow-50={index === 0}>
                    <div class="w-8 text-center font-bold text-blue-800">{index + 1}</div>
                    <div class="flex-grow font-bold text-blue-800">{player.name}</div>
                    <div class="font-bold text-lg">{player.score}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          
          <button 
            on:click={startGame}
            class="w-full bg-blue-600 text-white py-3 px-6 rounded-md text-xl font-bold hover:bg-blue-700 transition-colors transform hover:scale-105 transition-transform"
          >
            NEXT ROUND
          </button>
        </div>
      </div>
    {/if}
  </div>
</div> 