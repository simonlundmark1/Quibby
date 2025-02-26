<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  
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
      
      if (data.error) return;
      
      roomStatus = data.room.status;
      
      if (roomStatus === 'ANSWERING' || roomStatus === 'QUESTION') {
        if (data.currentQuestion) {
          question = data.currentQuestion;
          
          const playerAnswer = data.answers.find(a => a.userId === playerId);
          if (playerAnswer) {
            userAnswer = playerAnswer.text;
            answerSubmitted = true;
          } else {
            answerSubmitted = false;
          }
        }
      } 
      else if (roomStatus === 'VOTING') {
        if (data.currentQuestion) {
          question = data.currentQuestion;
          correctAnswer = data.currentQuestion.correctAnswer;
          
          const otherAnswers = data.answers.filter(a => a.userId !== playerId);
          
          const aiAlternatives = data.currentQuestion?.alternatives || [];
          
          const alternativesAsAnswers = aiAlternatives.map((alt, index) => ({
            id: `ai-alt-${index}`,
            text: alt,
            isAIAlternative: true
          }));
          
          const allOptions = [
            ...otherAnswers,
            ...alternativesAsAnswers,
            { 
              id: 'correct', 
              text: data.currentQuestion.correctAnswer,
              isCorrect: true
            }
          ];
          
          if (shuffledAnswerIds.length === 0) {
            const shuffled = shuffleArray([...allOptions]);
            shuffledAnswerIds = shuffled.map(a => a.id);
            
            if (!shuffled.some(a => a.isCorrect)) {
              const correctOption = { 
                id: 'correct', 
                text: data.currentQuestion.correctAnswer,
                isCorrect: true
              };
              
              const randomIndex = Math.floor(Math.random() * shuffled.length);
              shuffled[randomIndex] = correctOption;
              shuffledAnswerIds[randomIndex] = 'correct';
            }
            
            availableAnswers = shuffled;
          } else {
            availableAnswers = shuffledAnswerIds.map(id => {
              if (id === 'correct') {
                return { 
                  id: 'correct', 
                  text: data.currentQuestion.correctAnswer,
                  isCorrect: true
                };
              } else if (id.startsWith('ai-alt-')) {
                const index = parseInt(id.split('-')[2]);
                return {
                  id: `ai-alt-${index}`,
                  text: aiAlternatives[index],
                  isAIAlternative: true
                };
              } else {
                return otherAnswers.find(a => a.id === id) || {
                  id,
                  text: "Answer unavailable",
                  userId: "unknown"
                };
              }
            });
          }
        }
      }
      else if (roomStatus === 'RESULTS') {
        if (data.currentQuestion) {
          question = data.currentQuestion;
          correctAnswer = data.currentQuestion.correctAnswer;
          results = data.answers;
          
          if (!roundResults.includes(data.currentQuestion.id)) {
            roundResults.push(data.currentQuestion.id);
          }
        }
      }
      
      lastUpdate = Date.now();
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  }
  
  async function submitAnswer() {
    if (!userAnswer.trim() || submittingAnswer) return;
    
    submittingAnswer = true;
    
    try {
      const response = await fetch(`/api/rooms/${roomCode}/submit-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: playerId,
          answer: userAnswer
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit answer');
      }
      
      answerSubmitted = true;
    } catch (error) {
      console.error('Error submitting answer:', error);
    } finally {
      submittingAnswer = false;
    }
  }
  
  async function submitVote(answerId) {
    if (votingComplete) return;
    
    votingAnswer = answerId;
    
    try {
      if (answerId === 'correct' || answerId.startsWith('ai-alt-')) {
        votingComplete = true;
        return;
      }
      
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit vote');
      }
      
      votingComplete = true;
    } catch (error) {
      console.error('Error submitting vote:', error);
      votingAnswer = null;
    }
  }
  
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
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
          {answerSubmitted ? 'WAITING FOR OTHERS' : 'YOUR TURN TO ANSWER'}
        </div>
        <div class="p-6">
          <div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-6">
            <p class="text-center text-blue-900 font-bold text-lg">{question.text}</p>
          </div>
          
          {#if !answerSubmitted}
            <p class="text-sm text-gray-600 mb-2">Enter your most convincing bluff answer:</p>
            <div class="mb-4">
              <input
                type="text"
                bind:value={userAnswer}
                class="w-full border-2 border-blue-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your convincing answer..."
              />
            </div>
            
            <button 
              on:click={submitAnswer}
              disabled={!userAnswer.trim() || submittingAnswer}
              class="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-bold transition-colors"
              class:bg-blue-400={!userAnswer.trim() || submittingAnswer}
              class:opacity-70={!userAnswer.trim() || submittingAnswer}
            >
              {submittingAnswer ? 'SUBMITTING...' : 'SUBMIT ANSWER'}
            </button>
          {:else}
            <div class="bg-green-100 border-2 border-green-400 rounded-lg p-4 mb-4 text-center">
              <p class="text-green-700 font-bold">Your answer submitted:</p>
              <p class="text-lg font-bold text-blue-800">{userAnswer}</p>
            </div>
            
            <p class="text-center text-gray-600">Waiting for other players to answer...</p>
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
            <p class="text-sm text-gray-600 mb-3">Select which answer you think is correct:</p>
            <div class="space-y-3">
              {#each availableAnswers as answer, index}
                <button 
                  on:click={() => submitVote(answer.id)}
                  class="w-full flex items-center bg-indigo-100 py-3 px-4 rounded-lg hover:bg-indigo-200 transition-colors"
                  class:bg-indigo-200={votingAnswer === answer.id}
                >
                  <span class="flex-shrink-0 inline-block w-8 h-8 bg-blue-600 text-white rounded-full text-center font-bold leading-8 mr-3">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span class="text-blue-900 font-medium text-lg">{answer.text}</span>
                </button>
              {/each}
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