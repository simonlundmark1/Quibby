import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { generateRoomCode } from '$lib/utils';

export async function POST({ request }) {
  try {
    const { hostId, hostName, categories = [] } = await request.json();
    console.log('Creating room with categories:', categories);
    
    // Create or find user
    let user = await prisma.user.findUnique({
      where: { id: hostId }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: hostId,
          name: hostName,
        }
      });
    }
    
    // Create room with unique code
    const roomCode = generateRoomCode();
    
    // Create room with categories using Prisma
    const room = await prisma.room.create({
      data: {
        code: roomCode,
        hostId: user.id,
        categories: categories
      }
    });
    
    console.log(`Created room with code: ${roomCode} and categories:`, categories);
    
    return json({ roomCode: room.code });
  } catch (error) {
    console.error('Error creating room:', error);
    return json({ error: 'Failed to create room' }, { status: 500 });
  }
} 