import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

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
      
      // Get all votes (using raw query for reliability)
      try {
        const voteResults = await prisma.$queryRaw`
          SELECT v.id, v."userId", v."answerId", a."questionId"
          FROM "Vote" v
          JOIN "Answer" a ON v."answerId" = a.id
          WHERE a."questionId" = ${currentQuestion.id}
        `;
        
        votes = voteResults;
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
      details: error.message
    }, { status: 500 });
  }
} 