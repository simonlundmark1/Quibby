import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { recordVote, hasVoted } from '$lib/voteTracker.js';

export async function POST({ request, params }) {
  const { code } = params;
  
  try {
    // Parse request
    const data = await request.json();
    const { userId, answerId } = data;
    
    console.log(`Vote request: User ${userId} voting for answer ${answerId} in room ${code}`);
    
    if (!userId || !answerId) {
      return json({ error: 'Missing userId or answerId' }, { status: 400 });
    }
    
    // Find the room first
    const room = await prisma.room.findUnique({
      where: { code }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // For special answers (AI alternatives or correct answer)
    if (answerId === 'correct' || answerId.startsWith('ai-alt-')) {
      console.log(`Processing special vote: ${answerId}`);
      
      // Find the current question
      const currentQuestion = await prisma.question.findFirst({
        where: {
          roomId: room.id,
          roundNumber: room.currentRound
        }
      });
      
      if (!currentQuestion) {
        return json({ error: 'Current question not found' }, { status: 404 });
      }
      
      // Store in the tracker
      recordVote(currentQuestion.id, userId, answerId);
      
      return json({ 
        success: true, 
        message: 'Special vote recorded'
      });
    }
    
    // For normal player answers
    console.log(`Processing player vote for answer ID: ${answerId}`);
    
    // Check if the answer exists and doesn't belong to the user
    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      include: { question: true }
    });
    
    if (!answer) {
      return json({ error: 'Answer not found' }, { status: 404 });
    }
    
    if (answer.userId === userId) {
      return json({ error: 'Cannot vote for your own answer' }, { status: 400 });
    }
    
    // Check if user has already voted for any answer in this question
    if (hasVoted(answer.questionId, userId)) {
      console.log(`User ${userId} already voted for question ${answer.questionId}`);
      return json({ 
        success: true, 
        message: 'Vote already recorded'
      });
    }
    
    try {
      // Update the answer's vote count
      const updatedAnswer = await prisma.answer.update({
        where: { id: answerId },
        data: {
          votes: {
            increment: 1
          }
        }
      });
      
      // Store the vote in our tracker
      recordVote(answer.questionId, userId, answerId);
      
      console.log(`Vote recorded successfully: User ${userId} voted for answer ${answerId}`);
      console.log(`Answer now has ${updatedAnswer.votes} votes`);
      
      return json({ 
        success: true, 
        votes: updatedAnswer.votes 
      });
    } catch (updateError) {
      console.error('Error updating answer vote count:', updateError);
      return json({ 
        error: 'Failed to update vote count', 
        details: updateError instanceof Error ? updateError.message : String(updateError)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in vote API:', error);
    return json({ 
      error: 'Failed to process vote', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 