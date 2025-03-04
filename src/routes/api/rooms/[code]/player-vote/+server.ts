import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { hasVoted, getVotedAnswerId } from '$lib/voteTracker.js';

export async function GET({ params, url }) {
  const { code } = params;
  const userId = url.searchParams.get('userId');
  
  if (!userId) {
    return json({ error: 'UserId is required' }, { status: 400 });
  }
  
  try {
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Find the current question
    const currentQuestion = await prisma.question.findFirst({
      where: {
        roomId: room.id,
        roundNumber: room.currentRound
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (!currentQuestion) {
      return json({ error: 'No active question found' }, { status: 404 });
    }
    
    // Check if the user has voted using the vote tracker
    const voted = hasVoted(currentQuestion.id, userId);
    const answerId = voted ? getVotedAnswerId(currentQuestion.id, userId) : null;
    
    return json({
      hasVoted: voted,
      answerId
    });
  } catch (error: unknown) {
    console.error('Error checking player vote:', error);
    return json({ 
      error: 'Failed to check player vote',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 