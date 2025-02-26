import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  const { userId, answerId } = await request.json();
  
  try {
    console.log(`User ${userId} voting for answer ${answerId} in room ${code}`);
    
    // Get the answer
    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        question: true
      }
    });
    
    if (!answer) {
      return json({ error: 'Answer not found' }, { status: 404 });
    }
    
    // Make sure user isn't voting for their own answer
    if (answer.userId === userId) {
      return json({ error: 'Cannot vote for your own answer' }, { status: 400 });
    }
    
    // Record the vote
    await prisma.answer.update({
      where: { id: answerId },
      data: { votes: { increment: 1 } }
    });
    
    // Check if all players have voted
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
            answers: true
          }
        }
      }
    });
    
    // If this was the last vote, move to results
    const playerCount = room.players.length;
    const totalVotes = room.questions[0].answers.reduce(
      (sum, answer) => sum + answer.votes, 0
    );
    
    // If all players have voted, move to results state
    if (totalVotes >= playerCount - 1) { // Subtract 1 because each player can't vote for their own answer
      await prisma.room.update({
        where: { code },
        data: { status: 'RESULTS' }
      });
    }
    
    return json({ success: true });
  } catch (error) {
    console.error('Error recording vote:', error);
    return json({ error: 'Failed to record vote' }, { status: 500 });
  }
} 