import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params, url }) {
  const { code } = params;
  const questionId = url.searchParams.get('questionId');
  
  try {
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Get current question if not provided
    let currentQuestionId = questionId;
    if (!currentQuestionId) {
      const currentQuestion = await prisma.question.findFirst({
        where: {
          roomId: room.id,
          roundNumber: room.currentRound
        }
      });
      
      if (currentQuestion) {
        currentQuestionId = currentQuestion.id;
      }
    }
    
    if (!currentQuestionId) {
      return json({ votes: [] }); // No question, no votes yet
    }
    
    // Get all votes for this question from the Vote table
    let votes = [];
    try {
      votes = await prisma.vote.findMany({
        where: {
          answer: {
            questionId: currentQuestionId
          }
        },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          },
          answer: {
            select: {
              id: true,
              text: true
            }
          }
        }
      });
    } catch (error) {
      console.error('Error fetching regular votes:', error);
      // Continue with empty votes array
    }
    
    // Get special votes (for AI alternatives and correct answer)
    let specialVotes = [];
    try {
      specialVotes = await prisma.specialVote.findMany({
        where: {
          questionId: currentQuestionId
        },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    } catch (error) {
      console.error('Error fetching special votes:', error);
      // Continue with empty specialVotes array
    }
    
    // Combine regular and special votes
    const allVotes = [
      ...votes,
      ...specialVotes.map(sv => ({
        id: sv.id,
        userId: sv.userId,
        answerId: sv.targetId, // 'correct' or 'ai-alt-X'
        user: sv.user,
        isSpecial: true
      }))
    ];
    
    return json({ votes: allVotes });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return json({ error: 'Failed to fetch votes', details: error.message }, { status: 500 });
  }
} 