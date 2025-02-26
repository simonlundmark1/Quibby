import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    return json({ 
      players: room.players.map(player => ({
        id: player.id,
        name: player.name
      }))
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    return json({ error: 'Failed to fetch players' }, { status: 500 });
  }
} 