import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  const { userId, userName } = await request.json();
  
  console.log(`POST /api/rooms/${code}/join - User ${userName} (${userId}) is trying to join`);
  
  try {
    // First check if user exists
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    // Create user if not exists
    if (!user) {
      console.log(`Creating new user: ${userName} (${userId})`);
      user = await prisma.user.create({
        data: {
          id: userId,
          name: userName
        }
      });
    } else {
      console.log(`User exists: ${user.name} (${user.id})`);
    }
    
    // Get room
    const room = await prisma.room.findUnique({
      where: { code },
      include: { players: true }
    });
    
    if (!room) {
      console.error(`Room not found: ${code}`);
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    console.log(`Found room: ${room.id} with ${room.players.length} players`);
    
    // Check if player is already in the room
    const isPlayerInRoom = room.players.some(player => player.id === userId);
    
    if (!isPlayerInRoom) {
      console.log(`Adding player ${userName} (${userId}) to room ${code}`);
      // Add player to room
      await prisma.room.update({
        where: { code },
        data: {
          players: {
            connect: { id: userId }
          }
        }
      });
      console.log(`Player ${userName} successfully added to room ${code}`);
    } else {
      console.log(`Player ${userName} is already in room ${code}`);
    }
    
    return json({ success: true });
  } catch (error) {
    console.error('Error joining room:', error);
    return json({ error: 'Failed to join room' }, { status: 500 });
  }
} 