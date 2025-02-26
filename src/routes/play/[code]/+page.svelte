<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  
  let roomCode = $page.params.code;
  let userId = '';
  let userName = '';
  let roomStatus = 'LOBBY';
  let currentQuestion = null;
  let answers = [];
  let myAnswer = '';
  let myVote = null;
  let hasSubmittedAnswer = false;
  
  // Set up real-time subscription
  let subscription;
  
  onMount(async () => {
    userId = localStorage.getItem('quibbyUserId');
    userName = localStorage.getItem('quibbyUserName');
    
    if (!userId || !userName) {
      window.location.href = '/join';
      return;
    }
    
    // Load room data
    await fetchRoomData();
    
    // Subscribe to room changes
    setupRealtimeSubscription();
  });
  
  onDestroy(() => {
    if (subscription) {
      supabase.removeSubscription(subscription);
    }
  });
  
  async function fetchRoomData() {
    // Fetch room, current question, and answers
    const { data: room } = await supabase
      .from('Room')
      .select('*')
      .eq('code', roomCode)
      .single();
      
    if (room) {
      roomStatus = room.status;
      
      if (roomStatus !== 'LOBBY') {
        await fetchCurrentQuestion(room.currentRound);
      }
    }
  }
  
  async function fetchCurrentQuestion(roundNumber) {
    const { data: question } = await supabase
      .from('Question')
      .select('*')
      .eq('roomId', roomCode)
      .eq('roundNumber', roundNumber)
      .single();
      
    if (question) {
      currentQuestion = question;
      
      // Check if user already submitted an answer
      const { data: existingAnswer } = await supabase
        .from('Answer')
        .select('*')
        .eq('questionId', question.id)
        .eq('userId', userId)
        .single();
        
      hasSubmittedAnswer = !!existingAnswer;
      
      if (roomStatus === 'VOTING' || roomStatus === 'RESULTS') {
        await fetchAnswers();
      }
    }
  }
  
  async function fetchAnswers() {
    if (!currentQuestion) return;
    
    const { data } = await supabase
      .from('Answer')
      .select('*')
      .eq('questionId', currentQuestion.id);
      
    if (data) {
      answers = data;
      
      // Check if player has already voted
      const { data: vote } = await supabase
        .from('Vote')
        .select('answerId')
        .eq('questionId', currentQuestion.id)
        .eq('userId', userId)
        .single();
        
      if (vote) {
        myVote = vote.answerId;
      }
    }
  }
  
  function setupRealtimeSubscription() {
    subscription = supabase
      .channel('player-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'Room',
        filter: `code=eq.${roomCode}`
      }, fetchRoomData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Question'
      }, (payload) => {
        if (payload.new && payload.new.roomId === roomCode) {
          fetchCurrentQuestion(payload.new.roundNumber);
        }
      })
      .subscribe();
  }
  
  async function submitAnswer() {
    if (!myAnswer.trim() || !currentQuestion) return;
    
    await supabase
      .from('Answer')
      .insert({
        text: myAnswer,
        userId,
        questionId: currentQuestion.id
      });
      
    hasSubmittedAnswer = true;
    myAnswer = '';
  }
  
  async function submitVote(answerId) {
    if (myVote || !currentQuestion) return;
    
    await supabase
      .from('Vote')
      .insert({
        answerId,
        userId,
        questionId: currentQuestion.id
      });
      
    // Increment vote count
    await supabase
      .from('Answer')
      .update({ votes: answers.find(a => a.id === answerId).votes + 1 })
      .eq('id', answerId);
      
    myVote = answerId;
  }
</script>

<div class="min-h-screen bg-gradient-to-b from-purple-700 to-indigo-900 p-4">
  <div class="max-w-md mx-auto">
    <h1 class="text-3xl font-bold text-white text-center mb-6">Quibby</h1>
    
    {#if roomStatus === 'LOBBY'}
      <div class="bg-white rounded-xl shadow-lg p-8">
        <h2 class="text-2xl font-bold text-center mb-4">Waiting for game to start</h2>
        <p class="text-center mb-6">Room code: <span class="font-bold text-indigo-600">{roomCode}</span></p>
        <p class="text-center text-gray-600">The host will start the game soon...</p>
      </div>
    {:else if roomStatus === 'QUESTION' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg p-8">
        <h2 class="text-2xl font-bold text-center mb-4">Your Turn!</h2>
        <p class="text-center mb-6">{currentQuestion.text}</p>
        
        {#if !hasSubmittedAnswer}
          <div class="mb-4">
            <input
              type="text"
              bind:value={myAnswer}
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your lie..."
            />
          </div>
          
          <button 
            on:click={submitAnswer}
            class="w-full bg-indigo-600 text-white py-2 px-6 rounded-md font-medium hover:bg-indigo-700 transition-colors"
            disabled={!myAnswer.trim()}
          >
            Submit Answer
          </button>
        {:else}
          <div class="text-center text-green-600 font-medium">
            Your answer has been submitted!
          </div>
          <p class="text-center text-gray-600 mt-4">Waiting for other players...</p>
        {/if}
      </div>
    {:else if roomStatus === 'VOTING' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg p-8">
        <h2 class="text-2xl font-bold text-center mb-4">Vote Time!</h2>
        <p class="text-center mb-6">{currentQuestion.text}</p>
        
        {#if !myVote}
          <div class="space-y-3">
            {#each answers as answer}
              <button 
                on:click={() => submitVote(answer.id)}
                class="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-800 py-3 px-4 rounded-md font-medium transition-colors text-left"
              >
                {answer.text}
              </button>
            {/each}
          </div>
        {:else}
          <div class="text-center text-green-600 font-medium">
            Your vote has been recorded!
          </div>
          <p class="text-center text-gray-600 mt-4">Waiting for results...</p>
        {/if}
      </div>
    {:else if roomStatus === 'RESULTS' && currentQuestion}
      <div class="bg-white rounded-xl shadow-lg p-8">
        <h2 class="text-2xl font-bold text-center mb-4">Results</h2>
        <p class="text-center mb-2">{currentQuestion.text}</p>
        <p class="text-center text-xl font-bold text-green-600 mb-6">Correct answer: {currentQuestion.correctAnswer}</p>
        
        <div class="space-y-3">
          {#each answers.sort((a, b) => b.votes - a.votes) as answer}
            <div class="p-3 rounded-md" class:bg-green-100={answer.text === currentQuestion.correctAnswer} class:bg-indigo-100={answer.text !== currentQuestion.correctAnswer}>
              <div class="flex justify-between items-center">
                <span>{answer.text}</span>
                <span class="font-bold">{answer.votes} votes</span>
              </div>
            </div>
          {/each}
        </div>
        
        <p class="text-center text-gray-600 mt-6">Waiting for next round...</p>
      </div>
    {/if}
  </div>
</div> 