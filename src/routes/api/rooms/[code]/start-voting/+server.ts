import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ params }) {
  const { code } = params;
  
  try {
    console.log(`Starting voting for room: ${code}`);
    
    // Update room status to VOTING
    await prisma.room.update({
      where: { code },
      data: { status: 'VOTING' }
    });
    
    return json({ success: true });
  } catch (error) {
    console.error('Error starting voting:', error);
    return json({ error: 'Failed to start voting' }, { status: 500 });
  }
} 