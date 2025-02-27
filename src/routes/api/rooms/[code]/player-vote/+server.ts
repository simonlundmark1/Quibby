import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params, url }) {
  const { code } = params;
  const userId = url.searchParams.get('userId');
  
  if (!userId) {
    return json({ error: 'Missing userId parameter' }, { status: 400 });
  }
  
  try {
    // Get current question
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        questions: {
          where: {
            roundNumber: prisma.room.findUnique({
              where: { code },
              select: { currentRound: true }
            }).currentRound
          },
          include: {
            answers: true
          }
        }
      }
    });
    
    if (!room || !room.questions[0]) {
      return json({ hasVoted: false });
    }
    
    // Look for answers that this player voted for
    // Since we don't have a Vote table, we'll track this in a different way
    // For now, just check if the player's client thinks they've voted (handled on client-side)
    
    // We can't properly check if the player has voted without a Vote table
    // So we'll return a simpler response that just says "not voted yet"
    return json({
      hasVoted: false,  // Default to false since we can't track this properly
      answerId: null
    });
  } catch (error) {
    console.error('Error checking player vote:', error);
    return json({ error: 'Failed to check vote' }, { status: 500 });
  }
} 