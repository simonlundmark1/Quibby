import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    console.log(`Fetching details for room: ${code}`);
    
    // Find room with players
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true,
        questions: {
          where: {
            roundNumber: {
              equals: prisma.room.findUnique({
                where: { code },
                select: { currentRound: true }
              }).currentRound
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
    
    // Inside the GET function, add more logging
    console.log(`Room players:`, room.players.map(p => ({ id: p.id, name: p.name })));
    
    // Return room details and players
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
      currentQuestion: room.questions[0] || null,
      answers: room.questions[0]?.answers || []
    });
  } catch (error) {
    console.error('Error fetching room details:', error);
    return json({ error: 'Failed to fetch room details' }, { status: 500 });
  }
} 