<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { browser } from '$app/environment';
  
  let roomCode = $page.params.code;
  let playerName = '';
  let playerId = '';
  let joinStatus = 'joining'; // 'joining', 'joined', 'error'
  let errorMessage = '';
  
  // Game state
  let roomStatus = 'LOBBY';
  let question = null;
  let userAnswer = '';
  let submittingAnswer = false;
  let answerSubmitted = false;
  let availableAnswers = [];
  let votingAnswer = null;
  let votingComplete = false;
  let correctAnswer = '';
  let results = [];
  
  // Score tracking
  let playerScore = 0;
  let roundResults = [];
  let animateNewPoints = false;
  
  // Set up polling
  let pollingInterval;
  let lastUpdate = Date.now();
  const REFRESH_INTERVAL = 3000; // 3 seconds
  
  // Store the shuffled answers to maintain consistent order
  let shuffledAnswerIds = [];
  
  // For real-time subscriptions
  let roomSubscription;
  let questionSubscription;
  let answerSubscription;
  
  // Add these variables to your existing state
  let hasVotedForCurrentQuestion = false;
  let votedAnswerId = '';
  
  // Add this variable to your existing state
  let playerAnswerId = null;
  
  // Add a variable to track the current round
  let currentRound = 0;
  
  onMount(async () => {
    // Get player info from localStorage
    playerName = localStorage.getItem('quibbyUserName') || '';
    playerId = localStorage.getItem('quibbyUserId') || '';
    
    if (!playerName || !playerId) {
      // Redirect to join page if missing details
      window.location.href = '/join';
      return;
    }
    
    // Call API to join the room
    try {
      console.log(`Attempting to join room ${roomCode} as ${playerName} (${playerId})`);
      
      const response = await fetch(`/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: playerId,
          userName: playerName
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join room');
      }
      
      joinStatus = 'joined';
      console.log(`Successfully joined room ${roomCode}`);
      
      // Set up both realtime and polling
      setupRealtimeSubscriptions();
      
      // Fallback polling
      pollingInterval = setInterval(() => {
        if (Date.now() - lastUpdate > REFRESH_INTERVAL) {
          fetchGameState();
        }
      }, REFRESH_INTERVAL);
    } catch (error) {
      console.error('Error joining room:', error);
      joinStatus = 'error';
      errorMessage = error.message || 'Unable to join room';
    }
    
    // Call this when loading the question
    checkLocalVoteStatus();
  });
  
  onDestroy(() => {
    // Clean up all subscriptions
    if (roomSubscription) roomSubscription.unsubscribe();
    if (questionSubscription) questionSubscription.unsubscribe();
    if (answerSubscription) answerSubscription.unsubscribe();
    
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });
  
  function resetGameState() {
    question = null;
    userAnswer = '';
    submittingAnswer = false;
    answerSubmitted = false;
    availableAnswers = [];
    shuffledAnswerIds = [];
    votingAnswer = null;
    votingComplete = false;
    correctAnswer = '';
    results = [];
  }
  
  function setupRealtimeSubscriptions() {
    roomSubscription = supabase
      .channel('room-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'Room',
          filter: `code=eq.${roomCode}`
        },
        (payload) => {
          console.log('Room updated:', payload);
          
          if (payload.new.status === 'ANSWERING' && roomStatus !== 'ANSWERING') {
            console.log('New round detected, resetting game state');
            resetGameState();
          }
          
          roomStatus = payload.new.status;
          
          fetchGameState();
        }
      )
      .subscribe();
    
    questionSubscription = supabase
      .channel('question-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Question',
          filter: `roomId=in.(select id from Room where code='${roomCode}')`
        },
        (payload) => {
          console.log('Question updated:', payload);
          fetchGameState();
        }
      )
      .subscribe();
    
    answerSubscription = supabase
      .channel('answer-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Answer'
        },
        (payload) => {
          console.log('Answer updated:', payload);
          if (question && payload.new.questionId === question.id) {
            fetchGameState();
          }
        }
      )
      .subscribe();
    
    fetchGameState();
  }
  
  async function fetchGameState() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('Error fetching game state:', data.error);
        return;
      }
      
      // Check if round has changed, if so reset state
      if (data.room.currentRound !== currentRound && currentRound !== 0) {
        console.log(`Round changed from ${currentRound} to ${data.room.currentRound}, resetting state`);
        resetRoundState();
      }
      
      // Update current round
      currentRound = data.room.currentRound;
      roomStatus = data.room.status;
      
      console.log(`Game state updated: room status = ${roomStatus}, round = ${currentRound}`);
      
      // Process game data based on room status
      if (roomStatus === 'ANSWERING' || roomStatus === 'QUESTION') {
        // Handle answering phase...
        if (data.currentQuestion) {
          question = data.currentQuestion;
          
          const playerAnswer = data.answers.find(a => a.userId === playerId);
          if (playerAnswer) {
            userAnswer = playerAnswer.text;
            answerSubmitted = true;
          }
          
          // Always check local storage
          checkLocalAnswerStatus();
        }
      } else if (roomStatus === 'VOTING') {
        // Handle voting phase 
        if (data.currentQuestion) {
          question = data.currentQuestion;
          
          console.log('Current question:', question);
          console.log('Available answers from API:', data.answers);
          
          // Set up the player's own answer ID
          const myAnswer = data.answers.find(a => a.userId === playerId);
          if (myAnswer) {
            console.log('Found my answer:', myAnswer);
            playerAnswerId = myAnswer.id;
          }
          
          // Check if we need to refresh available answers
          const needToRefreshAnswers = 
            availableAnswers.length === 0 || 
            shuffledAnswerIds.length === 0;
            
          if (needToRefreshAnswers) {
            console.log('Refreshing available answers');
            
            // Combine player answers with correct answer and AI alternatives
            const allAnswers = [];
            
            // Add all player answers (excluding the current player's)
            if (data.answers && Array.isArray(data.answers)) {
              console.log(`Got ${data.answers.length} player answers from API`);
              console.log('Player answers:', data.answers);
              console.log('Current player ID:', playerId);
              
              const otherPlayerAnswers = data.answers.filter(a => a.userId !== playerId);
              console.log(`Found ${otherPlayerAnswers.length} answers from other players`);
              
              allAnswers.push(...otherPlayerAnswers.map(a => ({
                id: a.id,
                text: a.text,
                userId: a.userId,
                isPlayerAnswer: true
              })));
            }
            
            // Add correct answer and AI alternatives
            if (question.correctAnswer) {
              allAnswers.push({ 
                id: 'correct', 
                text: question.correctAnswer,
                isCorrectAnswer: true
              });
            }
            
            if (question.alternatives && Array.isArray(question.alternatives)) {
              question.alternatives.forEach((alt, i) => {
                allAnswers.push({
                  id: `ai-alt-${i}`,
                  text: alt,
                  isAiAnswer: true
                });
              });
            }
            
            console.log('All answers before shuffle:', allAnswers);
            
            // Shuffle answers
            const shuffled = shuffleAnswers(allAnswers);
            shuffledAnswerIds = shuffled.map(a => a.id);
            availableAnswers = shuffled;
            
            console.log('Shuffled answers for voting:', availableAnswers);
          }
          
          // Check if player has already voted
          checkLocalVoteStatus();
        }
      } else if (roomStatus === 'RESULTS') {
        // Handle results phase
        if (data.currentQuestion) {
          question = data.currentQuestion;
          correctAnswer = question.correctAnswer;
          
          // Process results data
          if (data.answers) {
            results = data.answers.map(answer => ({
              id: answer.id,
              text: answer.text,
              votes: answer.votes || 0,
              userId: answer.userId,
              user: answer.user,
              isCorrect: answer.text.toLowerCase() === correctAnswer.toLowerCase(),
              isPlayerAnswer: answer.userId === playerId
            }));
          }
        }
      }
      
      // Update last refresh timestamp
      lastUpdate = Date.now();
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  }
  
  // Add local storage for answers, similar to votes
  function checkLocalAnswerStatus() {
    if (!browser || !question?.id || !playerId) return false;
    
    const answerKey = `answer_${roomCode}_${question.id}_${playerId}`;
    const savedAnswer = localStorage.getItem(answerKey);
    
    if (savedAnswer) {
      userAnswer = savedAnswer;
      answerSubmitted = true;
      return true;
    }
    
    return false;
  }
  
  function saveAnswerLocally(answer) {
    if (!browser || !question?.id || !playerId) return;
    
    const answerKey = `answer_${roomCode}_${question.id}_${playerId}`;
    localStorage.setItem(answerKey, answer);
  }
  
  // Update the submitAnswer function
  async function submitAnswer() {
    if (!userAnswer.trim() || submittingAnswer || answerSubmitted) return;
    
    try {
      submittingAnswer = true;
      
      if (!question || !question.id) {
        throw new Error('No active question to answer');
      }
      
      console.log(`Submitting answer "${userAnswer}" for question ${question.id}`);
      
      const response = await fetch(`/api/rooms/${roomCode}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: playerId,
          answer: userAnswer,
          questionId: question.id
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Server returned error:', error);
        throw new Error(error.error || 'Failed to submit answer');
      }
      
      const result = await response.json();
      console.log('Answer submitted successfully:', result);
      
      answerSubmitted = true;
      saveAnswerLocally(userAnswer);
      
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Failed to submit your answer. Please try again.');
    } finally {
      submittingAnswer = false;
    }
  }
  
  // Function to check if user has already voted for this question
  function checkLocalVoteStatus() {
    if (!browser || !question?.id || !playerId) return false;
    
    // Include round number in the key to make it round-specific
    const voteKey = `vote_${roomCode}_${question.id}_${playerId}_round${question.roundNumber}`;
    const savedVote = localStorage.getItem(voteKey);
    
    if (savedVote) {
      hasVotedForCurrentQuestion = true;
      votedAnswerId = savedVote;
      return true;
    }
    
    hasVotedForCurrentQuestion = false;
    votedAnswerId = '';
    return false;
  }
  
  // Update saveVoteLocally function
  function saveVoteLocally(answerId) {
    if (!browser || !question?.id || !playerId) return;
    
    // Include round number in the key to make it round-specific
    const voteKey = `vote_${roomCode}_${question.id}_${playerId}_round${question.roundNumber}`;
    localStorage.setItem(voteKey, answerId);
  }
  
  // Modify your existing submitVote function
  async function submitVote(answerId) {
    // Check if already voted for this question
    if (hasVotedForCurrentQuestion) {
      console.log('Already voted for this question');
      return;
    }
    
    console.log(`Submitting vote for answer ${answerId}`);
    try {
      const response = await fetch(`/api/rooms/${roomCode}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: playerId,
          answerId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server returned error:', errorData);
        throw new Error(errorData.error || 'Failed to process vote');
      }
      
      // Update local state to prevent multiple votes
      votingComplete = true;
      votingAnswer = answerId;
      saveVoteLocally(answerId);
      
      console.log('Vote submitted successfully!');
    } catch (error) {
      console.error('Error submitting vote:', error);
    }
  }
  
  function shuffleAnswers(answers) {
    // Create a copy of the array to avoid modifying the original
    const shuffled = [...answers];
    
    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }
  
  // Update your onMount or fetchGameState to check for local answer
  $: if (question?.id && roomStatus === 'ANSWERING') {
    checkLocalAnswerStatus();
  }
  
  // Add this function to your script
  function isOwnAnswer(answerId) {
    // Debug logging
    console.log(`Checking if answer ${answerId} belongs to player ${playerId}`);
    console.log(`Player's own answer ID: ${playerAnswerId}`);
    
    // Check if this is the player's own answer
    if (!answerId) return false;
    
    // Use equality comparison
    const isOwn = answerId === playerAnswerId;
    console.log(`Answer ${answerId} belongs to current player: ${isOwn}`);
    
    return isOwn;
  }
  
  // Add a function to reset game state between rounds
  function resetRoundState() {
    // Reset voting state
    hasVotedForCurrentQuestion = false;
    votedAnswerId = '';
    votingComplete = false;
    
    // Reset answer state
    answerSubmitted = false;
    userAnswer = '';
    
    // Reset UI state
    availableAnswers = [];
    shuffledAnswerIds = [];
  }
</script>

<!-- Main Game UI -->
<div class="min-h-screen bg-gradient-to-b from-blue-800 to-purple-900 p-4">
  <div class="max-w-md mx-auto">
    <!-- Header with room code and player name -->
    <div class="flex justify-between items-center mb-6">
      <div class="bg-yellow-400 text-blue-900 font-bold rounded-lg px-4 py-2 text-xl">
        {roomCode}
      </div>
      <div class="bg-white rounded-full px-4 py-1 text-sm font-bold">
        {playerName}
      </div>
    </div>
    
    <!-- Different game states -->
    {#if joinStatus === 'joining'}
      <div class="bg-white rounded-xl shadow-lg p-6 text-center">
        <h1 class="text-2xl font-bold mb-4">Joining Room {roomCode}</h1>
        <div class="flex justify-center space-x-2 mb-2">
          <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    
    {:else if joinStatus === 'error'}
      <div class="bg-white rounded-xl shadow-lg p-6">
        <h1 class="text-2xl font-bold text-center mb-4 text-red-600">Error</h1>
        <p class="text-center mb-4">{errorMessage}</p>
        <button 
          on:click={() => window.location.href = '/join'}
          class="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-bold"
        >
          Back to Join
        </button>
      </div>
    
    <!-- LOBBY -->
    {:else if roomStatus === 'LOBBY'}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          WAITING FOR GAME
        </div>
        <div class="p-6 text-center">
          <p class="text-blue-800 font-bold text-xl mb-4">You've joined the game!</p>
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-4">
            <p class="font-medium">Room Code: <span class="font-bold">{roomCode}</span></p>
            <p class="font-medium">Your Name: <span class="font-bold">{playerName}</span></p>
          </div>
          <p class="text-gray-600 mb-6">Waiting for the host to start the game...</p>
          <div class="flex justify-center space-x-2 mb-2">
            <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
        </div>
      </div>
    
    <!-- ANSWERING -->
    {:else if (roomStatus === 'ANSWERING' || roomStatus === 'QUESTION') && question}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          YOUR ANSWER
        </div>
        <div class="p-6">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <p class="text-center text-blue-900 font-bold text-lg">{question.text}</p>
          </div>
          
          {#if !answerSubmitted}
            <form on:submit|preventDefault={submitAnswer} class="mb-4">
              <input 
                type="text" 
                bind:value={userAnswer}
                placeholder="Type your answer here..." 
                class="w-full p-3 border-2 border-blue-300 rounded-lg text-blue-800 mb-4"
                disabled={submittingAnswer}
              />
              <button 
                type="submit"
                class="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-bold"
                class:opacity-50={submittingAnswer || !userAnswer.trim()}
                disabled={submittingAnswer || !userAnswer.trim()}
              >
                {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
              </button>
            </form>
          {:else}
            <div class="bg-green-100 border-2 border-green-500 rounded-lg p-4 mb-6">
              <p class="text-green-800 text-center font-bold">Your answer has been submitted!</p>
              <p class="text-center text-blue-800 mt-2 font-medium">You answered: <span class="font-bold">{userAnswer}</span></p>
            </div>
            <p class="text-center text-gray-600">
              Waiting for other players to answer...
            </p>
            <div class="flex justify-center space-x-2 mt-4">
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
          {/if}
        </div>
      </div>
    
    <!-- VOTING -->
    {:else if roomStatus === 'VOTING' && question}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          {votingComplete ? 'VOTE SUBMITTED' : 'TIME TO VOTE'}
        </div>
        <div class="p-6">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <p class="text-center text-blue-900 font-bold text-lg">{question.text}</p>
          </div>
          
          {#if !votingComplete}
            <div class="space-y-4">
              {#if availableAnswers.length === 0}
                <p class="text-center text-gray-500">Loading answers...</p>
              {:else}
                {#each availableAnswers as answer, i}
                  <button 
                    on:click={() => submitVote(answer.id)}
                    class="w-full p-4 bg-blue-100 rounded-lg text-left border-2"
                    class:border-blue-300={!hasVotedForCurrentQuestion}
                    class:border-green-500={hasVotedForCurrentQuestion && votedAnswerId === answer.id}
                    class:border-gray-300={hasVotedForCurrentQuestion && votedAnswerId !== answer.id}
                    class:opacity-50={hasVotedForCurrentQuestion || isOwnAnswer(answer.id)}
                    disabled={hasVotedForCurrentQuestion || isOwnAnswer(answer.id)}
                    data-answer-id={answer.id}
                    data-answer-type={answer.isPlayerAnswer ? 'player' : (answer.isCorrectAnswer ? 'correct' : 'ai')}
                  >
                    <div class="flex items-center">
                      <div class="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <span class="font-medium text-blue-800">{answer.text}</span>
                      {#if isOwnAnswer(answer.id)}
                        <span class="ml-2 text-purple-600 text-sm">(Your answer)</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              {/if}
            </div>
          {:else}
            <div class="bg-green-100 border-2 border-green-400 rounded-lg p-4 mb-6 text-center">
              <p class="text-green-700 font-bold">Your vote has been submitted!</p>
            </div>
            
            <p class="text-center text-gray-600">Waiting for other players to vote...</p>
            <div class="flex justify-center space-x-2 mt-4">
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
          {/if}
        </div>
      </div>
    
    <!-- RESULTS -->
    {:else if roomStatus === 'RESULTS' && question}
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="bg-blue-600 text-white p-4 text-center text-xl font-bold">
          ROUND RESULTS
        </div>
        <div class="p-6">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-2">
            <p class="text-blue-900 font-bold text-lg text-center">{question.text}</p>
          </div>
          
          <div class="bg-green-100 border-2 border-green-500 p-4 rounded-lg mb-6">
            <p class="text-center font-bold text-sm text-green-800 mb-1">CORRECT ANSWER</p>
            <p class="text-center font-bold text-xl text-blue-800">{correctAnswer}</p>
          </div>
          
          <div class="space-y-3 mb-4">
            {#each results.sort((a, b) => b.votes - a.votes) as result}
              <div class="rounded-lg overflow-hidden border-2" 
                class:border-green-500={result.text.toLowerCase() === correctAnswer.toLowerCase()}
                class:border-blue-300={result.text.toLowerCase() !== correctAnswer.toLowerCase()}
                class:bg-green-50={result.text.toLowerCase() === correctAnswer.toLowerCase()}
                class:bg-blue-50={result.text.toLowerCase() !== correctAnswer.toLowerCase() && result.userId === playerId}
                class:bg-gray-50={result.text.toLowerCase() !== correctAnswer.toLowerCase() && result.userId !== playerId}
              >
                <div class="p-3">
                  <div class="flex justify-between items-center">
                    <div>
                      <span class="font-bold text-blue-800">{result.text}</span>
                      <span class="text-gray-500 text-sm"> - {result.user?.name}</span>
                      
                      {#if result.text.toLowerCase() === correctAnswer.toLowerCase()}
                        <span class="ml-2 text-green-600 font-bold">✓ TRUTH!</span>
                      {:else if result.userId === playerId}
                        <span class="ml-2 text-blue-600 font-bold">YOUR FIB</span>
                      {/if}
                    </div>
                    <div class="text-purple-700 font-bold text-lg">{result.votes} 
                      {#if result.votes === 1}
                        vote
                      {:else}
                        votes
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
          
          <div class="text-center mt-6 text-blue-800 font-bold animate-pulse">
            Get ready for the next question...
          </div>
        </div>
      </div>
    {/if}
  </div>
</div> 