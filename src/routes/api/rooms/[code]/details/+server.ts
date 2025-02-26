import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    // Find room by code with all related data
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true,
        host: true,
        questions: {
          where: {
            roundNumber: {
              equals: 1 // initially get first round question
            }
          },
          include: {
            answers: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    console.log(`Fetched room ${code} with ${room.players.length} players`);
    
    return json(room);
  } catch (error) {
    console.error('Error fetching room details:', error);
    return json({ error: 'Failed to fetch room details' }, { status: 500 });
  }
} 