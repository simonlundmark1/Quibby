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
    alternatives?: string[];
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
  let roomStatus: 'LOBBY' | 'QUESTION' | 'ANSWERING' | 'VOTING' | 'RESULTS' = 'LOBBY';
  let players: Player[] = [];
  let room: any = null;
  let currentQuestion: Question | null = null;
  let answers: Answer[] = [];
  let castingAvailable = false;
  let castButton: any;
  let currentRound = 0;
  
  // Set up real-time subscription
  let roomSubscription: any;
  
  // Add some game stats
  let totalRounds = 0;
  let leaderboard = [];
  
  // Add these to your existing variables
  let pollingInterval;
  let lastUpdate = Date.now();
  const REFRESH_INTERVAL = 3000; // 3 seconds
  
  let votes: any[] = [];
  let hostId: string;
  
  // Add at the top with your other variables
  let isLoading = false;
  
  onMount(async () => {
    // Load room data
    await fetchRoomData();
    
    // Set up both realtime and polling as backup
    setupRealtimeSubscriptions();
    
    // Fallback polling every 3 seconds
    pollingInterval = setInterval(() => {
      // Only poll if it's been more than REFRESH_INTERVAL since last update
      if (Date.now() - lastUpdate > REFRESH_INTERVAL) {
        fetchRoomData();
      }
    }, REFRESH_INTERVAL);
    
    // Set up Chromecast
    setupChromecast();
  });
  
  onDestroy(() => {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
    }
    
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });
  
  async function fetchRoomData() {
    console.log('Fetching room data for room:', roomCode);
    
    try {
      // First clear any existing data to avoid stale UI
      if (roomStatus === 'RESULTS' && room?.status === 'ANSWERING') {
        // We're transitioning to a new round, clear everything
        answers = [];
        currentQuestion = null;
      }
      
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
        
        // Make sure answers has the right format for the host UI
        answers = data.answers.map(answer => ({
          id: answer.id,
          text: answer.text,
          userId: answer.userId,
          questionId: answer.questionId,
          votes: answer.votes || 0,
          user: answer.user || null
        }));
        
        console.log('Processed answers:', answers);
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
      
      // After fetching data successfully:
      lastUpdate = Date.now();
      
      // After fetching answers, also fetch votes
      if (roomStatus === 'VOTING' && currentQuestion) {
        const votesResponse = await fetch(`/api/rooms/${roomCode}/votes`);
        if (votesResponse.ok) {
          const votesData = await votesResponse.json();
          // Store votes for hasEveryoneVoted check
          votes = votesData.votes;
        }
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
  
  function setupRealtimeSubscriptions() {
    console.log('Setting up realtime subscription for room:', roomCode);
    
    roomSubscription = supabase
      .channel('room-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'Room',
        filter: `code=eq.${roomCode}`
      }, (payload) => {
        console.log('Room update received via realtime:', payload);
        roomStatus = payload.new.status;
        lastUpdate = Date.now(); // Mark that we received an update
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
      }, (payload) => {
        console.log('Question updated:', payload);
        fetchRoomData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Answer'
      }, (payload) => {
        console.log('Answer updated:', payload);
        if (currentQuestion && payload.new.questionId === currentQuestion.id) {
          fetchRoomData();
        }
      })
      .subscribe((status) => {
        console.log('Supabase subscription status:', status);
      });
    
    // Initial fetch
    fetchRoomData();
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
  
  // Update hasEveryoneVoted function to check localStorage
  function hasEveryoneVoted() {
    if (!players.length) return false;
    
    // Use our vote tracking to see who has voted
    const votedPlayerIds = new Set();
    
    // Count votes from database (for player answers)
    for (const vote of votes) {
      if (vote.userId) {
        votedPlayerIds.add(vote.userId);
      }
    }
    
    // Filter to just include players in the current room who aren't the host
    const nonVotingPlayers = players.filter(p => !votedPlayerIds.has(p.id) && p.id !== hostId);
    
    // If everyone except the host has voted
    return nonVotingPlayers.length === 0;
  }
  
  // Update fetchVotes function
  async function fetchVotes() {
    if (!currentQuestion) return;
    
    try {
      const response = await fetch(`/api/rooms/${roomCode}/votes?questionId=${currentQuestion.id}`);
      if (!response.ok) {
        console.error('Error fetching votes:', response.status);
        return;
      }
      
      const data = await response.json();
      votes = data.votes || [];
      
      console.log('Fetched votes:', votes);
      
      // Add this call during your regular polling
      if (roomStatus === 'VOTING') {
        fetchVotes();
      }
      
      // Update UI
      lastUpdate = Date.now();
    } catch (error) {
      console.error('Error fetching votes:', error);
    }
  }
  
  // Function to show results
  async function showResults() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}/show-results`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        console.error('Failed to show results');
      }
    } catch (error) {
      console.error('Error showing results:', error);
    }
  }
  
  // Update startNextRound function
  async function startNextRound() {
    console.log('Next Round button clicked');
    
    // Set loading state
    isLoading = true;
    
    try {
      // Reset question-related state
      currentQuestion = null;
      answers = [];
      
      console.log(`Calling API to start next round for room ${roomCode}`);
      
      // Add more debugging
      console.log('Current room state:', { roomStatus, currentRound });
      
      // Use more robust fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      const response = await fetch(`/api/rooms/${roomCode}/start`, {
        method: 'POST',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', response.status, errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          console.error('Parsed error data:', errorData);
          alert(`Failed to start next round: ${errorData.error || 'Unknown error'}`);
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
          alert(`Failed to start next round: ${response.status} ${response.statusText}`);
        }
      } else {
        let data;
        try {
          const responseText = await response.text();
          console.log('Raw API response text:', responseText);
          data = JSON.parse(responseText);
          console.log('API response for next round:', data);
        } catch (parseError) {
          console.error('Error parsing API response:', parseError);
          throw new Error('Invalid response from server');
        }
        
        // Update local state based on API response
        if (data && data.success) {
          currentRound = data.newRound;
          roomStatus = 'ANSWERING'; // Force status update
          
          // Force an immediate fetch of the new data
          console.log('Next round started, fetching new data...');
          await fetchRoomData();
          
          // Give a visual confirmation
          console.log('Round successfully advanced to:', currentRound);
        } else {
          throw new Error('API returned success:false');
        }
      }
    } catch (error) {
      console.error('Error starting next round:', error);
      alert(`Error starting next round: ${error.message || error}`);
    } finally {
      isLoading = false;
    }
  }
  
  async function endGame() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}/end`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        console.error('Failed to end game');
      }
    } catch (error) {
      console.error('Error ending game:', error);
    }
  }
  
  // Add this helper function
  function getQuestionText() {
    return currentQuestion ? currentQuestion.text : 'Loading question...';
  }
  
  function getCorrectAnswer() {
    return currentQuestion ? currentQuestion.correctAnswer : 'Loading answer...';
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
            <p class="text-center text-xl font-bold text-blue-900">{getQuestionText()}</p>
          </div>
          
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-3 text-blue-800">Player Answers ({answers.length}/{players.length}):</h3>
            
            {#if answers.length === 0}
              <div class="text-center text-gray-500 py-4">
                Waiting for players to submit answers...
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each players as player}
                  {@const hasAnswered = answers.some(a => a.userId === player.id)}
                  <div class="bg-blue-100 p-3 rounded-lg border-2"
                    class:border-green-500={hasAnswered}
                    class:border-red-300={!hasAnswered}>
                    <div class="font-medium text-blue-800">{player.name}</div>
                    <div class="text-sm mt-1" class:text-green-600={hasAnswered} class:text-red-500={!hasAnswered}>
                      {hasAnswered ? 'Answer submitted' : 'Not answered yet'}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          
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
          VOTING IN PROGRESS
        </div>
        <div class="p-8">
          {#if currentQuestion}
            <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
              <p class="text-center text-xl font-bold text-blue-900">{getQuestionText()}</p>
            </div>
            
            <!-- Show vote count as a progress bar at the top -->
            <div class="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p class="text-center text-blue-800 font-bold mb-2">
                {votes.length} of {players.length - 1} players have voted
              </p>
              <div class="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div class="bg-blue-600 h-4" style="width: {(votes.length / (players.length - 1) * 100) || 0}%"></div>
              </div>
            </div>
            
            <div class="mb-6">
              <h3 class="text-lg font-bold mb-3 text-blue-800">All Answers:</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each [
                  ...answers.map(answer => ({
                    id: answer.id,
                    text: answer.text,
                    userId: answer.userId,
                    user: answer.user,
                    votes: answer.votes,
                    isPlayerAnswer: true
                  })),
                  ...(currentQuestion?.alternatives || []).map((alt, i) => ({ 
                    text: alt, 
                    isAIAlternative: true, 
                    id: `ai-alt-${i}` 
                  })),
                  { 
                    id: 'correct', 
                    text: getCorrectAnswer(), 
                    isCorrect: true,
                    isRevealed: roomStatus === 'RESULTS' // Only reveal in results phase
                  }
                ] as answer, index}
                  <div class="bg-blue-100 p-4 rounded-lg text-center border-2 border-blue-300">
                    <div class="inline-block w-8 h-8 bg-blue-600 text-white rounded-full text-center font-bold leading-8 mb-2">
                      {String.fromCharCode(65 + index)}
                    </div>
                    <div class="font-bold text-lg text-blue-800">{answer.text}</div>
                    
                    <!-- Only show source information during RESULTS phase -->
                    {#if roomStatus === 'RESULTS'}
                      {#if answer.isCorrect}
                        <div class="text-green-600 font-bold mt-1">TRUTH!</div>
                      {:else if answer.isAIAlternative}
                        <div class="text-yellow-600 font-bold mt-1">AI ALTERNATIVE</div>
                      {:else if answer.isPlayerAnswer && answer.user}
                        <div class="text-purple-600 mt-1">{answer.user.name}'s answer</div>
                      {/if}
                      
                      <!-- Only show votes in results phase -->
                      {#if answer.isPlayerAnswer}
                        <div class="text-blue-600 font-bold mt-1">{answer.votes || 0} {answer.votes === 1 ? 'vote' : 'votes'}</div>
                      {/if}
                    {:else}
                      <!-- In voting phase, just show TOTAL number of votes, not per answer -->
                      {#if index === 0}
                        <div class="mt-4 text-center text-blue-600 font-bold">
                          Total votes: {votes.length} / {players.length - 1} players
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
            
            <div class="flex justify-center">
              {#if hasEveryoneVoted()}
                <button 
                  on:click={showResults}
                  class="mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-xl transition-colors"
                >
                  SHOW RESULTS
                </button>
              {:else}
                <div class="animate-pulse text-blue-800 font-bold">
                  Waiting for players to vote...
                </div>
              {/if}
            </div>
          {:else}
            <div class="text-center p-8">
              <p class="text-red-600 font-bold">Loading question...</p>
            </div>
          {/if}
        </div>
      </div>
    {:else if roomStatus === 'RESULTS' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          ROUND RESULTS
        </div>
        <div class="p-8">
          {#if currentQuestion}
            <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-4">
              <p class="text-center text-xl font-bold text-blue-900">{getQuestionText()}</p>
            </div>
            
            <div class="bg-green-100 border-2 border-green-500 p-4 rounded-lg mb-6 text-center">
              <p class="text-green-800 font-bold mb-1 text-sm">CORRECT ANSWER</p>
              <p class="text-2xl font-bold text-blue-800">{getCorrectAnswer()}</p>
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
            
            <div class="flex justify-center space-x-4 mt-8">
              <button 
                on:click={startNextRound}
                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors relative"
                disabled={isLoading}
              >
                {#if isLoading}
                  <span class="absolute inset-0 flex items-center justify-center">
                    <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  <span class="opacity-0">NEXT ROUND</span>
                {:else}
                  NEXT ROUND
                {/if}
              </button>
              
              <button 
                on:click={endGame}
                class="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                END GAME
              </button>
            </div>
          {:else}
            <div class="text-center p-8">
              <p class="text-red-600 font-bold">Loading question data...</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div> 