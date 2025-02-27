import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    console.log(`Fetching details for room: ${code}`);
    
    // First fetch the room to get the current round
    const roomData = await prisma.room.findUnique({
      where: { code },
      select: { id: true, currentRound: true }
    });
    
    if (!roomData) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Now fetch the full room data with the correct question for the current round
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true,
        questions: {
          where: {
            roundNumber: {
              equals: roomData.currentRound
            }
          },
          include: {
            answers: {
              include: {
                user: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!room) {
      console.error(`Room not found: ${code}`);
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    console.log(`Room found: ${room.id}, status: ${room.status}, players: ${room.players.length}`);
    console.log(`Room players:`, room.players.map(p => ({ id: p.id, name: p.name })));
    
    // Get current question (most recent for current round)
    const currentQuestion = room.questions[0] || null;
    
    // Get answers for current question
    const answers = currentQuestion ? currentQuestion.answers : [];
    
    // Check for alternatives in the global store as a fallback
    if (currentQuestion && !currentQuestion.alternatives && 
        global.questionAlternatives && 
        global.questionAlternatives[currentQuestion.id]) {
      // Instead of reassigning to currentQuestion, create an updated copy
      let updatedQuestion = {
        ...currentQuestion,
        alternatives: global.questionAlternatives[currentQuestion.id]
      };
      
      // Use the updated question in the response
      return json({
        room: {
          id: room.id,
          code: room.code,
          status: room.status,
          currentRound: room.currentRound,
          categories: room.categories,
          createdAt: room.createdAt
        }, 
        players: room.players.map(player => ({
          id: player.id,
          name: player.name
        })),
        playerCount: room.players.length,
        currentQuestion: updatedQuestion ? {
          id: updatedQuestion.id,
          text: updatedQuestion.text,
          correctAnswer: updatedQuestion.correctAnswer,
          alternatives: updatedQuestion.alternatives || [],
          roomId: updatedQuestion.roomId,
          roundNumber: updatedQuestion.roundNumber
        } : null,
        answers: answers.map(answer => ({
          id: answer.id,
          text: answer.text,
          userId: answer.userId,
          questionId: answer.questionId,
          votes: answer.votes || 0,
          user: answer.user
        }))
      });
    }
    
    // Always return a response - format data properly for host compatibility
    return json({
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        currentRound: room.currentRound,
        categories: room.categories,
        createdAt: room.createdAt
      }, 
      players: room.players.map(player => ({
        id: player.id,
        name: player.name
      })),
      playerCount: room.players.length,
      currentQuestion: currentQuestion ? {
        id: currentQuestion.id,
        text: currentQuestion.text,
        correctAnswer: currentQuestion.correctAnswer,
        alternatives: currentQuestion.alternatives || [],
        roomId: currentQuestion.roomId,
        roundNumber: currentQuestion.roundNumber
      } : null,
      answers: answers.map(answer => ({
        id: answer.id,
        text: answer.text,
        userId: answer.userId,
        questionId: answer.questionId,
        votes: answer.votes || 0,
        user: answer.user
      }))
    });
    
  } catch (error) {
    console.error('Error fetching room details:', error);
    return json({ error: 'Failed to fetch room details' }, { status: 500 });
  }
} 