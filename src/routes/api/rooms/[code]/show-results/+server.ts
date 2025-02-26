import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ params }) {
  const { code } = params;
  
  try {
    console.log(`Showing results for room: ${code}`);
    
    // Update room status to RESULTS
    await prisma.room.update({
      where: { code },
      data: {
        status: 'RESULTS'
      }
    });
    
    console.log(`Room ${code} status updated to RESULTS`);
    
    return json({ success: true });
  } catch (error) {
    console.error('Error showing results:', error);
    return json({ error: 'Failed to show results' }, { status: 500 });
  }
} 