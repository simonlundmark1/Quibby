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
            roundNumber: roomData.currentRound
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
    
    // Prepare the current question
    let currentQuestion = room.questions[0] || null;
    
    // Check for alternatives in the global store as a fallback
    if (currentQuestion && !currentQuestion.alternatives && 
        global.questionAlternatives && 
        global.questionAlternatives[currentQuestion.id]) {
      currentQuestion = {
        ...currentQuestion,
        alternatives: global.questionAlternatives[currentQuestion.id]
      };
    }
    
    // Always return a response
    return json({ 
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        currentRound: room.currentRound,
        categories: room.categories
      }, 
      players: room.players.map(player => ({
        id: player.id,
        name: player.name
      })),
      playerCount: room.players.length,
      currentQuestion: currentQuestion,
      answers: (room.questions[0]?.answers || [])
    });
    
  } catch (error) {
    console.error('Error fetching room details:', error);
    return json({ error: 'Failed to fetch room details' }, { status: 500 });
  }
} 