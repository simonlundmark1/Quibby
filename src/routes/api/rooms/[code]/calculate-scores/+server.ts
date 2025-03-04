import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { getVotesForQuestion } from '$lib/voteTracker.js';

export async function POST({ params }) {
  const { code } = params;
  
  try {
    console.log(`Calculating scores for room: ${code}`);
    
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code },
      include: { 
        players: true
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Find the current question
    const currentQuestion = await prisma.question.findFirst({
      where: {
        roomId: room.id,
        roundNumber: room.currentRound
      }
    });
    
    if (!currentQuestion) {
      return json({ error: 'No current question found' }, { status: 404 });
    }
    
    console.log(`Calculating scores for question: ${currentQuestion.id}, correct answer: ${currentQuestion.correctAnswer}`);
    
    // Get all answers for the question
    const answers = await prisma.answer.findMany({
      where: {
        questionId: currentQuestion.id
      },
      include: {
        user: true
      }
    });
    
    console.log(`Found ${answers.length} player answers`);
    
    // Let's get the votes from both voteTracker and the database
    let votes = [];
    
    // First try the in-memory tracker
    const trackerVotes = getVotesForQuestion(currentQuestion.id);
    
    if (trackerVotes && trackerVotes.size > 0) {
      console.log(`Found ${trackerVotes.size} votes in tracker`);
      
      // Convert the Map entries to vote objects
      for (const [userId, answerId] of trackerVotes.entries()) {
        votes.push({
          userId,
          answerId
        });
      }
    } else {
      // Fallback to database
      console.log('No votes in tracker, checking database');
      
      // Get votes from the vote counts on answers
      for (const answer of answers) {
        if (answer.votes > 0) {
          const votedUsers = await prisma.user.findMany({
            take: answer.votes,
            where: {
              id: {
                not: answer.userId // Don't count self-votes
              }
            }
          });
          
          // Create placeholder votes
          for (const user of votedUsers) {
            votes.push({
              userId: user.id,
              answerId: answer.id
            });
          }
        }
      }
    }
    
    console.log(`Total votes to process: ${votes.length}`);
    
    // Define scoring constants based on the pseudocode
    const CORRECT_GUESS_POINTS = 1000;  // Points for guessing the correct answer
    const FOOLING_POINTS = 500;         // Points for each player fooled by your bluff
    const MOST_FOOLED_BONUS = 500;      // Bonus for most fooled answer
    const LIKE_POINTS = 100;            // Points per like (if implemented)
    
    // Initialize scores for all players
    const playerScores: Record<string, {
      id: string;
      name: string;
      score: number;
      details: Array<{
        type: string;
        points: number;
        description: string;
      }>;
    }> = {};
    
    const gameScoreRecords = []; // Track detailed score records
    
    // Initialize all players with 0 points for this round
    for (const player of room.players) {
      playerScores[player.id] = {
        id: player.id,
        name: player.name,
        score: 0,
        details: []
      };
    }
    
    // Track who submitted what answer (player -> answer mapping)
    const playerAnswers: Record<string, string> = {};
    // And also the reverse (answer -> player mapping)
    const answerOwners: Record<string, string> = {};
    
    for (const answer of answers) {
      if (answer.userId) {
        playerAnswers[answer.userId] = answer.id;
        answerOwners[answer.id] = answer.userId;
      }
    }
    
    // Track how many players were fooled by each answer
    const fooledCounts: Record<string, number> = {};
    
    // 1. Award points for choosing the correct answer
    for (const vote of votes) {
      console.log(`Processing vote: userId=${vote.userId}, answerId=${vote.answerId}`);
      
      // Check if this is a vote for the special correct answer IDs
      if (vote.answerId === 'correct' || vote.answerId === 'ai-correct') {
        if (playerScores[vote.userId]) {
          playerScores[vote.userId].score += CORRECT_GUESS_POINTS;
          playerScores[vote.userId].details.push({
            type: 'correct_guess',
            points: CORRECT_GUESS_POINTS,
            description: 'Chose the correct answer'
          });
          
          // Add to GameScore records
          gameScoreRecords.push({
            userId: vote.userId,
            roomId: room.id,
            roundNumber: room.currentRound,
            scoreValue: CORRECT_GUESS_POINTS,
            scoreType: 'CORRECT_GUESS'
          });
          
          console.log(`Player ${vote.userId} gets ${CORRECT_GUESS_POINTS} points for correct guess (special ID)`);
          continue; // Skip to next vote
        }
      }
      
      // For regular player answers, check if they match the correct answer text
      const votedAnswer = answers.find((a: any) => a.id === vote.answerId);
      
      if (!votedAnswer) continue;
      
      // If player voted for the correct answer
      if (votedAnswer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()) {
        if (playerScores[vote.userId]) {
          playerScores[vote.userId].score += CORRECT_GUESS_POINTS;
          playerScores[vote.userId].details.push({
            type: 'correct_guess',
            points: CORRECT_GUESS_POINTS,
            description: 'Chose the correct answer'
          });
          
          // Add to GameScore records
          gameScoreRecords.push({
            userId: vote.userId,
            roomId: room.id,
            roundNumber: room.currentRound,
            scoreValue: CORRECT_GUESS_POINTS,
            scoreType: 'CORRECT_GUESS'
          });
          
          console.log(`Player ${vote.userId} gets ${CORRECT_GUESS_POINTS} points for correct guess (player answer)`);
        }
      }
      // If player voted for another player's lie
      else if (answerOwners[vote.answerId] && answerOwners[vote.answerId] !== vote.userId) {
        const ownerId = answerOwners[vote.answerId];
        
        // Track this for the most fooled bonus
        if (!fooledCounts[vote.answerId]) {
          fooledCounts[vote.answerId] = 0;
        }
        fooledCounts[vote.answerId]++;
        
        // Give points to the player who created the bluff
        if (playerScores[ownerId]) {
          playerScores[ownerId].score += FOOLING_POINTS;
          playerScores[ownerId].details.push({
            type: 'fooled_player',
            points: FOOLING_POINTS,
            description: `Fooled player ${vote.userId}`
          });
          
          // Add to GameScore records
          gameScoreRecords.push({
            userId: ownerId,
            roomId: room.id,
            roundNumber: room.currentRound,
            scoreValue: FOOLING_POINTS,
            scoreType: 'FOOLED_PLAYER'
          });
          
          console.log(`Player ${ownerId} gets ${FOOLING_POINTS} points for fooling player ${vote.userId}`);
        }
      }
    }
    
    // 2. Find the most fooled answer and award bonus
    let mostFooledCount = 0;
    let mostFooledAnswerId: string | null = null;
    
    for (const [answerId, count] of Object.entries(fooledCounts)) {
      if (count > mostFooledCount) {
        mostFooledCount = count;
        mostFooledAnswerId = answerId;
      }
    }
    
    // Only award bonus if at least 2 players were fooled
    if (mostFooledCount >= 2 && mostFooledAnswerId && answerOwners[mostFooledAnswerId]) {
      const ownerId = answerOwners[mostFooledAnswerId];
      
      if (playerScores[ownerId]) {
        playerScores[ownerId].score += MOST_FOOLED_BONUS;
        playerScores[ownerId].details.push({
          type: 'most_fooled_bonus',
          points: MOST_FOOLED_BONUS,
          description: `Bonus for fooling the most players (${mostFooledCount})`
        });
        
        // Add to GameScore records
        gameScoreRecords.push({
          userId: ownerId,
          roomId: room.id,
          roundNumber: room.currentRound,
          scoreValue: MOST_FOOLED_BONUS,
          scoreType: 'MOST_FOOLED_BONUS'
        });
        
        console.log(`Player ${ownerId} gets ${MOST_FOOLED_BONUS} bonus points for fooling the most players (${mostFooledCount})`);
      }
    }
    
    // 3. "Likes" functionality could be added here if implemented
    // This would be similar to the code above, just with a different point value
    
    // Create all GameScore records in a transaction
    if (gameScoreRecords.length > 0) {
      try {
        await prisma.$transaction(
          gameScoreRecords.map(record => 
            prisma.gameScore.create({
              data: record
            })
          )
        );
        
        console.log(`Created ${gameScoreRecords.length} GameScore records`);
      } catch (txError) {
        console.error('Error creating game score records:', txError);
        // Continue execution, we can still return the calculated scores
      }
    }
    
    // Convert to array and sort by score
    const leaderboard = Object.values(playerScores)
      .sort((a, b) => b.score - a.score);
    
    console.log('Calculated leaderboard:', leaderboard);
    
    return json({ 
      success: true,
      leaderboard,
      question: currentQuestion
    });
    
  } catch (error) {
    console.error('Error calculating scores:', error);
    return json({ 
      error: 'Failed to calculate scores', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
} 