import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { getVotesForQuestion } from '$lib/voteTracker.js';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true // This includes the players directly
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // We already have players from the include above, no need for a separate query
    const players = room.players;
    
    // Find the current question
    const currentQuestion = await prisma.question.findFirst({
      where: {
        roomId: room.id,
        roundNumber: room.currentRound
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    let answers = [];
    let votes = [];
    
    if (currentQuestion) {
      // Get all answers for the current question
      answers = await prisma.answer.findMany({
        where: {
          questionId: currentQuestion.id
        },
        include: {
          user: {
            select: {
              name: true
            }
          }
        }
      });
      
      // Get all votes from the centralized tracker
      try {
        // Get votes from the in-memory tracker
        const questionVotes = getVotesForQuestion(currentQuestion.id);
        
        if (questionVotes && questionVotes.size > 0) {
          console.log(`Found ${questionVotes.size} votes in memory tracker for question ${currentQuestion.id}`);
          
          // Convert the Map entries to vote objects
          for (const [userId, answerId] of questionVotes.entries()) {
            if (userId) {  // Make sure userId exists
              votes.push({
                id: `${answerId}-${userId}`,
                answerId,
                userId,
                questionId: currentQuestion.id
              });
              console.log(`Added vote from user ${userId} for answer ${answerId}`);
            }
          }
          console.log(`Converted ${votes.length} votes from memory tracker`);
        } else {
          // Fallback to checking the votes stored in the Answer model
          console.log(`No votes found in tracker, using answer.votes counts`);
          
          // Get answers with votes
          const votedAnswers = await prisma.answer.findMany({
            where: {
              questionId: currentQuestion.id,
              votes: { gt: 0 }
            },
            include: {
              user: true
            }
          });
          
          // Create placeholder votes from the vote counts
          for (const answer of votedAnswers) {
            for (let i = 0; i < answer.votes; i++) {
              votes.push({
                id: `${answer.id}-vote-${i}`,
                answerId: answer.id,
                userId: null, // We don't know which user voted
                questionId: currentQuestion.id
              });
            }
          }
          console.log(`Created ${votes.length} votes from answer.votes counts`);
        }
      } catch (error) {
        console.error('Error fetching votes:', error);
        votes = []; // Default to empty array if query fails
      }
    }
    
    return json({
      room,
      players, 
      currentQuestion,
      answers,
      votes
    });
    
  } catch (error) {
    console.error('Error getting host data:', error);
    return json({ 
      error: 'Failed to get host data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 