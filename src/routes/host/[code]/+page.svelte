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
  
  // Add these audio variables with your other variables
  let waitingAudio: HTMLAudioElement;
  let questionAudio: HTMLAudioElement;
  
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
  
  // Add a vote subscription
  let voteSubscription: any;
  
  // Add this variable to your existing variables
  let showingLeaderboard = false;
  
  // Add this to your variables
  let totalLeaderboard = [];
  
  // Add these functions after your variable declarations but before onMount
  function playWaitingMusic() {
    if (waitingAudio) {
      stopAllMusic();
      waitingAudio.play().catch(err => console.error('Error playing waiting music:', err));
    }
  }

  function playQuestionMusic() {
    if (questionAudio) {
      stopAllMusic();
      questionAudio.play().catch(err => console.error('Error playing question music:', err));
    }
  }

  function stopAllMusic() {
    if (waitingAudio) {
      waitingAudio.pause();
      waitingAudio.currentTime = 0;
    }
    if (questionAudio) {
      questionAudio.pause();
      questionAudio.currentTime = 0;
    }
  }
  
  onMount(async () => {
    // Initialize audio elements
    waitingAudio = new Audio('/audio/waiting.mp3');
    questionAudio = new Audio('/audio/question.mp3');
    
    // Set audio to loop
    waitingAudio.loop = true;
    questionAudio.loop = true;
    
    // Start playing waiting music if in LOBBY state
    if (roomStatus === 'LOBBY') {
      playWaitingMusic();
    }
    
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
    
    if (voteSubscription) voteSubscription.unsubscribe();
  });
  
  async function fetchRoomData() {
    console.log('Fetching room data for room:', roomCode);
    
    try {
      const response = await fetch(`/api/rooms/${roomCode}/host-data`);
      if (!response.ok) {
        console.error('Error fetching host data:', response.status);
        return;
      }
      
      const data = await response.json();
      console.log('Host data API response:', data);
      
      if (data.error) {
        console.error('API returned error:', data.error);
        return;
      }
      
      room = data.room;
      players = data.players || [];
      roomStatus = data.room.status;
      currentRound = data.room.currentRound;
      
      console.log(`Room status: ${roomStatus}, Current round: ${currentRound}`);
      console.log(`Players (${players.length}):`, players.map(p => p.name));
      
      // Update votes directly from the response
      if (data.votes) {
        votes = data.votes;
        console.log(`Got ${votes.length} votes:`, votes);
      }
      
      // If we have the current question data from the API
      if (data.currentQuestion) {
        currentQuestion = data.currentQuestion;
        
        // Create a complete array of all possible answers
        let allAnswers = [];
        
        // 1. Process player-submitted answers
        if (data.answers && data.answers.length > 0) {
          const playerAnswers = data.answers.map(answer => {
            // Count votes for this answer from the votes array
            const voteCount = votes.filter(v => v.answerId === answer.id).length;
            console.log(`Answer ${answer.id} by ${answer.user?.name || 'unknown'} has ${voteCount} votes`);
            
            return {
              ...answer,
              votes: voteCount,
              source: 'player'
            };
          });
          
          allAnswers = [...playerAnswers];
        }
        
        // 2. Add AI answers if we're in voting or results phase
        if (currentQuestion && (roomStatus === 'VOTING' || roomStatus === 'RESULTS')) {
          // Add AI-generated incorrect alternatives
          if (currentQuestion.alternatives && Array.isArray(currentQuestion.alternatives)) {
            const aiDistractors = currentQuestion.alternatives.map((altText, index) => {
              const answerId = `ai-distractor-${index}`;
              const voteCount = votes.filter(v => v.answerId === answerId).length;
              
              return {
                id: answerId,
                text: altText,
                votes: voteCount,
                source: 'ai'
              };
            });
            
            allAnswers = [...allAnswers, ...aiDistractors];
          }
          
          // Add the correct answer if it's not already included
          const correctAnswerExists = allAnswers.some(
            a => a.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()
          );
          
          if (!correctAnswerExists) {
            const correctAnswerId = 'ai-correct';
            const voteCount = votes.filter(v => v.answerId === correctAnswerId).length;
            
            allAnswers.push({
              id: correctAnswerId,
              text: currentQuestion.correctAnswer,
              votes: voteCount,
              source: 'ai'
            });
          }
        }
        
        // 3. Shuffle answers if we're in voting phase
        if (roomStatus === 'VOTING') {
          allAnswers = shuffleArray([...allAnswers]);
        }
        
        // Set the answers array with our complete set
        answers = allAnswers;
        console.log('All answers for display:', answers);
      }
      
      // Log the vote status
      const nonHostPlayers = players.filter(p => p.id !== room.hostId);
      console.log(`Need ${nonHostPlayers.length} players to vote, have ${votes.length} votes`);
      console.log(`Has everyone voted: ${hasEveryoneVoted()}`);
      
      lastUpdate = Date.now();
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
    
    // Make sure to create a dedicated vote subscription
    voteSubscription = supabase
      .channel('public:Vote')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Vote'
        },
        (payload) => {
          console.log('Vote change detected:', payload);
          fetchRoomData(); // Refresh all data when a vote changes
        }
      )
      .subscribe((status) => {
        console.log('Vote subscription status:', status);
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
  
  // Update the hasEveryoneVoted function to better count votes
  function hasEveryoneVoted() {
    if (!votes || !players || players.length <= 1) return false;
    
    // Get all unique players who have voted
    const votedPlayerIds = new Set(votes.map(vote => vote.userId));
    console.log('Players who have voted:', [...votedPlayerIds]);
    console.log('Total players:', players.length);
    
    // Find the host (usually the room creator)
    const hostPlayer = players.find(p => p.isHost || p.role === 'HOST');
    
    // Set the host ID if we found the host
    if (hostPlayer) {
      hostId = hostPlayer.id;
      console.log('Host ID:', hostId);
    }
    
    // Count players excluding host who haven't voted
    const nonVotingPlayers = players.filter(p => 
      !votedPlayerIds.has(p.id) && 
      p.id !== hostId // Exclude host
    );
    
    console.log('Players who haven\'t voted:', nonVotingPlayers.map(p => p.name));
    
    // Everyone has voted if all non-host players have voted
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
    if (isLoading) return;
    isLoading = true;
    
    try {
      // First change the room status to RESULTS
      const response = await fetch(`/api/rooms/${roomCode}/show-results`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to show results');
      }
      
      // Then calculate scores
      await calculateAndShowScores();
      
    } catch (error) {
      console.error('Error showing results:', error);
      alert('Error showing results');
    } finally {
      isLoading = false;
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
  
  // Add or update the host's fetchGameState function to better track votes
  async function fetchGameState() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}/host-data`);
      const data = await response.json();
      
      if (data.error) {
        console.error('Error fetching host data:', data.error);
        return;
      }
      
      // Update game state
      room = data.room;
      roomStatus = room.status;
      players = data.players;
      
      if (data.currentQuestion) {
        currentQuestion = data.currentQuestion;
        
        // Get all answers including vote counts
        if (data.answers) {
          // Get votes for the current question
          const votesForQuestion = data.votes.filter(v => 
            data.answers.some(a => a.id === v.answerId)
          );
          
          console.log(`Found ${votesForQuestion.length} votes for current question`);
          votes = votesForQuestion;
          
          // Update answers with vote counts
          answers = data.answers.map(answer => {
            // Count votes for this answer
            const voteCount = votes.filter(v => v.answerId === answer.id).length;
            
            return {
              ...answer,
              votes: Math.max(answer.votes || 0, voteCount) // Use the higher count
            };
          });
          
          console.log('Answers with vote counts:', answers);
        }
      }
      
      lastUpdate = Date.now();
    } catch (error) {
      console.error('Error fetching host data:', error);
    }
  }
  
  // Add this function to your existing script
  async function calculateAndShowScores() {
    isLoading = true;
    
    try {
      console.log('Calculating scores for round');
      const response = await fetch(`/api/rooms/${roomCode}/calculate-scores`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to calculate scores: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Score calculation result:', data);
      
      // Update local leaderboard
      leaderboard = data.leaderboard;
      
      // Show scores in the UI
      showingLeaderboard = true;
      
      // Persist the scores to the database
      if (leaderboard.length > 0) {
        console.log('Persisting scores to database');
        const updateResponse = await fetch(`/api/rooms/${roomCode}/update-scores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ leaderboard })
        });
        
        if (updateResponse.ok) {
          const updateData = await updateResponse.json();
          console.log('Scores updated successfully:', updateData);
          
          // You could update the leaderboard with total scores if needed
          if (updateData.totalLeaderboard) {
            // This will show cumulative scores
            totalLeaderboard = updateData.totalLeaderboard;
          }
        } else {
          console.error('Failed to update scores in database');
        }
      }
      
    } catch (error) {
      console.error('Error calculating scores:', error);
      alert('Failed to calculate scores');
    } finally {
      isLoading = false;
    }
  }
  
  // Add this shuffle function if it doesn't exist
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
</script>

<svelte:head>
  <script type="text/javascript" src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-[#0d1557] to-[#121a40] p-4 pt-8">
  <div class="grid grid-cols-12 gap-4 max-w-7xl mx-auto">
    
    <!-- Left sidebar leaderboard (millionaire money ladder style) -->
    <div class="col-span-3">
      <div class="bg-gradient-to-b from-[#020b43] to-[#081041] rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.5)] overflow-hidden sticky top-4 border border-[#214dff]/30">
        <div class="bg-gradient-to-r from-[#0d1763] to-[#1a237e] text-white p-4 text-center border-b border-[#4169e1]/30">
          <h2 class="font-bold text-xl tracking-wide font-['Roboto'] text-[#f4bb3a]">LEADERBOARD</h2>
        </div>
        <div class="p-3">
          {#if totalLeaderboard.length === 0}
            <p class="text-center text-gray-400">No scores recorded yet</p>
          {:else}
            <div class="space-y-1.5">
              {#each totalLeaderboard as player, index}
                <div class="flex items-center p-2.5 rounded-lg transition-colors {
                  index === 0 
                    ? 'bg-gradient-to-r from-[#926f34]/20 to-[#d4af37]/20 border border-[#d4af37]/30' 
                    : 'bg-[#1f2b77]/40'
                }">
                  
                  <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold mr-2.5 border {
                    index === 0 
                      ? 'text-[#d4af37] border-[#d4af37] bg-[#0e1344]' 
                      : 'text-white border-blue-400 bg-[#121a60]'
                  }">
                    {index + 1}
                  </div>
                  
                  <div class="flex-grow font-bold text-sm truncate pr-1 {
                    index === 0 ? 'text-[#d4af37]' : 'text-blue-100'
                  }">
                    {player.name}
                  </div>
                  
                  <div class="text-lg font-bold {
                    index === 0 ? 'text-[#f4bb3a]' : 'text-blue-200'
                  }">
                    {player.totalScore}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Main content area (centered, wider) -->
    <div class="col-span-8 col-start-4">
      <div class="bg-gradient-to-b from-[#141e66] to-[#0d1352] rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.6)] p-6 border border-[#214dff]/30">
        <h1 class="text-3xl font-bold text-center text-[#f4bb3a] mb-6 tracking-wide font-['Roboto']">
          Room Code: <span class="text-white">{roomCode}</span>
        </h1>
        
        <!-- Keep your existing content organization but style it -->
        {#if roomStatus === 'LOBBY'}
          <div class="bg-gradient-to-b from-[#1a237e]/80 to-[#0d1352]/90 rounded-xl p-6 border border-[#4169e1]/20 shadow-lg">
            <h2 class="text-2xl font-bold text-center mb-6 text-[#f4bb3a]">Waiting for Players</h2>
            
            <!-- Players joining display -->
            <div class="mb-8">
              <h3 class="text-xl font-semibold mb-4 text-blue-200">Players ({players.length})</h3>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                {#each players as player}
                  <div class="bg-[#1e3a8a]/40 border border-blue-400/30 p-3 rounded-lg text-center text-blue-100">
                    {player.name}
                  </div>
                {:else}
                  <div class="col-span-3 text-center text-blue-300">
                    Waiting for players to join...
                  </div>
                {/each}
              </div>
            </div>
            
            <!-- Start game button -->
            <button 
              on:click={startGame}
              class="w-full bg-gradient-to-b from-[#1938a2] to-[#0c1d78] hover:from-[#1e42c0] hover:to-[#0f2290] text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg border border-blue-500/30 disabled:opacity-50"
              disabled={players.length < 2}
            >
              START GAME
            </button>
          </div>
        
        {:else if roomStatus === 'QUESTION' || roomStatus === 'ANSWERING'}
          <!-- Question display with Millionaire styling -->
          <div class="bg-gradient-to-b from-[#1a237e]/80 to-[#0d1352]/90 rounded-xl p-6 border border-[#4169e1]/20 shadow-lg">
            <h2 class="text-2xl font-bold text-center mb-6 text-[#f4bb3a]">Question</h2>
            
            {#if currentQuestion}
              <p class="text-center text-2xl mb-6 text-white font-['Roboto'] leading-relaxed">
                {currentQuestion.text}
              </p>
              
              <div class="flex justify-center">
                <div class="pulse-animation w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-r from-[#1e40af] to-[#1e3a8a] border-4 border-blue-300/30">
                  <div class="text-blue-200 text-center">
                    <div class="text-xs uppercase tracking-wider">Players</div>
                    <div class="text-2xl font-bold">{answers.length}</div>
                    <div class="text-xs">of {players.length}</div>
                  </div>
                </div>
              </div>
              
              <!-- Add this button section when all players have answered -->
              {#if answers.length >= players.length - 1 || (answers.length > 0 && currentRound > 1)}
                <div class="flex justify-center mt-6">
                  <button 
                    on:click={startVoting}
                    class="bg-gradient-to-b from-[#1938a2] to-[#0c1d78] hover:from-[#1e42c0] hover:to-[#0f2290] text-white font-bold py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-500/30 animate-pulse"
                  >
                    START VOTING
                  </button>
                </div>
                <p class="text-center text-blue-300 text-sm mt-3">All players have submitted their answers!</p>
              {/if}
            {:else}
              <p class="text-center text-blue-300">Loading question...</p>
            {/if}
          </div>
          
        {:else if roomStatus === 'VOTING'}
          <!-- Voting display with Millionaire styling -->
          <div class="bg-gradient-to-b from-[#1a237e]/80 to-[#0d1352]/90 rounded-xl p-6 border border-[#4169e1]/20 shadow-lg">
            <h2 class="text-2xl font-bold text-center mb-6 text-[#f4bb3a]">Time to Vote!</h2>
            
            {#if currentQuestion}
              <p class="text-center text-2xl mb-8 text-white font-['Roboto'] leading-relaxed">
                {currentQuestion.text}
              </p>
              
              <div class="space-y-4 mb-6">
                <h3 class="text-center text-[#f4bb3a] font-bold mb-2">All Answers</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#each answers as answer}
                    <div class="bg-gradient-to-r from-[#1e3a8a]/40 to-[#1e40af]/40 p-4 rounded-lg border border-blue-400/30 relative overflow-hidden">
                      <div class="text-white text-center text-lg">{answer.text}</div>
                      
                      <!-- Remove source labels during voting - only show text -->
                    </div>
                  {/each}
                </div>
              </div>
              
              <!-- Add this voting status indicator -->
              <div class="flex justify-center mb-8">
                <div class="pulse-animation w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-r from-[#1e40af] to-[#1e3a8a] border-4 border-blue-300/30">
                  <div class="text-blue-200 text-center">
                    <div class="text-xs uppercase tracking-wider">Votes</div>
                    <div class="text-2xl font-bold">{votes.length}</div>
                    <div class="text-xs">of {players.length - 1}</div>
                  </div>
                </div>
              </div>
              
              <!-- Add the Show Results button when all players have voted -->
              {#if hasEveryoneVoted()}
                <div class="flex justify-center mt-6">
                  <button 
                    on:click={showResults}
                    class="bg-gradient-to-b from-[#1938a2] to-[#0c1d78] hover:from-[#1e42c0] hover:to-[#0f2290] text-white font-bold py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-500/30 animate-pulse"
                  >
                    SHOW RESULTS
                  </button>
                </div>
                <p class="text-center text-blue-300 text-sm mt-3">All players have cast their votes!</p>
              {/if}
            {:else}
              <p class="text-center text-blue-300">Loading question data...</p>
            {/if}
          </div>
          
        {:else if roomStatus === 'RESULTS'}
          <!-- Results display with Millionaire styling -->
          <div class="bg-gradient-to-b from-[#1a237e]/80 to-[#0d1352]/90 rounded-xl p-6 border border-[#4169e1]/20 shadow-lg">
            <h2 class="text-2xl font-bold text-center mb-6 text-[#f4bb3a]">Results</h2>
            
            {#if currentQuestion}
              <p class="text-center text-xl mb-4 text-white font-['Roboto'] leading-relaxed">
                {currentQuestion.text}
              </p>
              
              <p class="text-center text-2xl font-bold text-[#f4bb3a] mb-8 px-4 py-3 bg-[#0d1352] border border-[#f4bb3a]/30 rounded-lg inline-block mx-auto">
                Correct answer: {currentQuestion.correctAnswer}
              </p>
              
              <div class="space-y-4 mb-8">
                {#each answers.sort((a, b) => b.votes - a.votes) as answer}
                  <div class="flex justify-between items-center p-4 rounded-lg border {
                    answer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()
                      ? 'bg-gradient-to-r from-[#1e3a8a]/60 to-[#0ea5e9]/30 border-green-400/50'
                      : 'bg-[#1e3a8a]/40 border-blue-400/30'
                  }">
                    <div>
                      <span class="font-medium text-white">{answer.text}</span>
                      
                      <!-- Show the source ONLY in results -->
                      {#if answer.source === 'player'}
                        <span class="text-blue-300 text-sm ml-2">by {answer.user?.name || 'Player'}</span>
                      {:else if answer.source === 'ai' && answer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()}
                        <span class="text-green-300 text-sm ml-2">Correct Answer</span>
                      {:else if answer.source === 'ai'}
                        <span class="text-orange-300 text-sm ml-2">AI Distractor</span>
                      {/if}
                    </div>
                    
                    <div class="flex items-center">
                      <div class="w-8 h-8 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white font-bold mr-2 border border-blue-400/50">
                        {answer.votes}
                      </div>
                      <span class="text-blue-200">votes</span>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-center text-blue-300">Loading results...</p>
            {/if}
            
            <div class="flex justify-center space-x-4 mt-8">
              <button 
                on:click={startNextRound}
                class="bg-gradient-to-b from-[#1938a2] to-[#0c1d78] hover:from-[#1e42c0] hover:to-[#0f2290] text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg border border-blue-500/30"
              >
                NEXT ROUND
              </button>
              
              <a 
                href="/stats/{roomCode}"
                class="bg-gradient-to-b from-[#6b21a8] to-[#581c87] hover:from-[#7e27c8] hover:to-[#6922a3] text-white font-bold py-3 px-6 rounded-lg inline-flex items-center transition-colors shadow-lg border border-purple-500/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                  <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                </svg>
                STATS
              </a>
              
              <button 
                on:click={endGame}
                class="bg-gradient-to-b from-[#9f1239] to-[#7f1d1d] hover:from-[#be123c] hover:to-[#991b1b] text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg border border-red-500/30"
              >
                END GAME
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
  
  {#if showingLeaderboard}
    <!-- Modal with Millionaire styling -->
    <div class="fixed inset-0 bg-[#070b2e]/90 z-50 flex items-center justify-center">
      <div class="bg-gradient-to-b from-[#141e66] to-[#0d1352] rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.7)] p-8 max-w-2xl w-full mx-4 border border-[#214dff]/40">
        <h2 class="text-3xl font-bold text-center text-[#f4bb3a] mb-6 font-['Roboto']">Round Scores</h2>
        
        <div class="space-y-4 mb-8">
          {#each leaderboard as player, index}
            <div class="flex items-center p-4 rounded-lg border-2 {
              index === 0 
                ? 'border-[#d4af37] bg-[#d4af37]/10' 
                : 'border-[#1e3a8a]/40 bg-[#1e40af]/10'
            }">
              <div class="w-8 h-8 rounded-full bg-gradient-to-b from-[#1938a2] to-[#0c1d78] text-white flex items-center justify-center font-bold mr-4 border border-blue-400/50">
                {index + 1}
              </div>
              <div class="flex-grow">
                <div class="font-bold text-lg {index === 0 ? 'text-[#f4bb3a]' : 'text-blue-100'}">
                  {player.name}
                </div>
                {#if player.details && player.details.length > 0}
                  <div class="text-sm text-gray-400">
                    {#each player.details as detail}
                      {#if detail.type === 'fooled'}
                        <div>+{detail.points} for fooling a player</div>
                      {:else if detail.type === 'correct_guess'}
                        <div>+{detail.points} for guessing correctly</div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="text-2xl font-bold text-[#f4bb3a]">
                +{player.score}
              </div>
            </div>
          {/each}
        </div>
        
        <div class="flex justify-center">
          <button 
            on:click={() => showingLeaderboard = false}
            class="bg-gradient-to-b from-[#1938a2] to-[#0c1d78] hover:from-[#1e42c0] hover:to-[#0f2290] text-white font-bold py-3 px-6 rounded-lg shadow-lg border border-blue-500/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Add pulsing animation for the waiting indicator */
  .pulse-animation {
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
    }
    70% {
      box-shadow: 0 0 0 15px rgba(59, 130, 246, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }
</style> 