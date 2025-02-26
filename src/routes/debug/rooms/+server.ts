import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET() {
  try {
    // Check all rooms with their players
    const rooms = await prisma.room.findMany({
      include: {
        players: true
      }
    });
    
    return json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }
} 