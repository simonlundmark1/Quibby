import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

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
    
    // Get all answers for the question
    const answers = await prisma.answer.findMany({
      where: {
        questionId: currentQuestion.id
      }
    });
    
    // Get all votes for the question
    const votes = await prisma.$queryRaw`
      SELECT v.id, v."userId", v."answerId"
      FROM "Vote" v
      JOIN "Answer" a ON v."answerId" = a.id
      WHERE a."questionId" = ${currentQuestion.id}
    `;
    
    console.log(`Found ${answers.length} answers and ${votes.length} votes`);
    
    // Define scoring constants
    const CORRECT_GUESS_POINTS = 100;  // Points for guessing the correct answer
    const FOOLING_POINTS = 200;        // Points for each player fooled by your bluff
    
    // Keep track of score updates
    const scoreUpdates = {};
    const playerScores = {};
    const gameScoreRecords = []; // Track detailed score records
    
    // Initialize all players with 0 points for this round
    for (const player of room.players) {
      playerScores[player.id] = {
        id: player.id,
        name: player.name,
        score: 0,
        previousScore: 0,
        details: []
      };
    }
    
    // Track who submitted what answer
    const playerAnswers = {};
    for (const answer of answers) {
      if (answer.userId) {
        playerAnswers[answer.userId] = answer.id;
      }
    }
    
    // Process votes
    for (const vote of votes) {
      const votedAnswer = answers.find(a => a.id === vote.answerId);
      
      if (!votedAnswer) continue;
      
      // If player voted for an answer that was a bluff (another player's answer)
      if (votedAnswer.userId && votedAnswer.userId !== vote.userId) {
        // Give points to the player who created the bluff
        if (playerScores[votedAnswer.userId]) {
          playerScores[votedAnswer.userId].score += FOOLING_POINTS;
          playerScores[votedAnswer.userId].details.push({
            type: 'fooled',
            points: FOOLING_POINTS,
            fooledPlayer: vote.userId
          });
          
          // Add to GameScore records
          gameScoreRecords.push({
            userId: votedAnswer.userId,
            roomId: room.id,
            roundNumber: room.currentRound,
            scoreValue: FOOLING_POINTS,
            scoreType: 'fooled_player'
          });
        }
      }
      
      // If player voted for the correct answer
      if (votedAnswer.text.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()) {
        // Give points to the player who guessed correctly
        if (playerScores[vote.userId]) {
          playerScores[vote.userId].score += CORRECT_GUESS_POINTS;
          playerScores[vote.userId].details.push({
            type: 'correct_guess',
            points: CORRECT_GUESS_POINTS
          });
          
          // Add to GameScore records
          gameScoreRecords.push({
            userId: vote.userId,
            roomId: room.id,
            roundNumber: room.currentRound,
            scoreValue: CORRECT_GUESS_POINTS,
            scoreType: 'correct_guess'
          });
        }
      }
    }
    
    // Create all GameScore records in a transaction
    if (gameScoreRecords.length > 0) {
      await prisma.$transaction(
        gameScoreRecords.map(record => 
          prisma.gameScore.create({
            data: record
          })
        )
      );
      
      console.log(`Created ${gameScoreRecords.length} GameScore records`);
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
    return json({ error: 'Failed to calculate scores', details: error.message }, { status: 500 });
  }
} 