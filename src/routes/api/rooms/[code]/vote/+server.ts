import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  let userId, answerId;
  
  try {
    // Safely parse the request body with error handling
    const body = await request.json();
    userId = body.userId;
    answerId = body.answerId;
    
    console.log(`Processing vote: User ${userId} voting for answer ${answerId} in room ${code}`);
    
    // Validate required fields
    if (!userId || !answerId) {
      return json({ error: 'Missing required fields: userId and answerId' }, { status: 400 });
    }
    
    // First validate that the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    // Find the room with the current question
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        questions: {
          where: {
            roundNumber: {
              equals: prisma.room.findUnique({
                where: { code },
                select: { currentRound: true }
              }).currentRound
            }
          }
        }
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    if (room.status !== 'VOTING') {
      return json({ error: 'Room is not in voting phase' }, { status: 400 });
    }
    
    // Get the current question
    const currentQuestion = room.questions[0];
    if (!currentQuestion) {
      return json({ error: 'No question found for current round' }, { status: 400 });
    }
    
    // Handle special cases - AI alternatives and correct answer
    const isSpecialAnswer = answerId === 'correct' || answerId.startsWith('ai-alt-');
    
    if (isSpecialAnswer) {
      // For AI alternatives and correct answer, store in the SpecialVote table
      try {
        // Check if user already has a special vote for this question
        const existingSpecialVote = await prisma.specialVote.findUnique({
          where: {
            questionId_userId: {
              questionId: currentQuestion.id,
              userId
            }
          },
          include: {
            question: {
              select: {
                roundNumber: true
              }
            }
          }
        });
        
        if (existingSpecialVote && existingSpecialVote.question.roundNumber === room.currentRound) {
          // Update existing special vote
          await prisma.specialVote.update({
            where: { id: existingSpecialVote.id },
            data: { targetId: answerId }
          });
        } else {
          // Create new special vote
          await prisma.specialVote.create({
            data: {
              questionId: currentQuestion.id,
              userId,
              targetId: answerId
            }
          });
        }
        
        return json({ success: true });
      } catch (error) {
        console.error('Error recording special vote:', error);
        return json({ error: 'Failed to record vote' }, { status: 500 });
      }
    } else {
      // For normal player answers, find the answer in the database
      const answer = await prisma.answer.findUnique({
        where: { id: answerId }
      });
      
      if (!answer) {
        return json({ error: 'Answer not found' }, { status: 404 });
      }
      
      console.log(`Found answer: ${answer.id}, userId: ${answer.userId}`);
      console.log(`Voter userId: ${userId}`);
      
      // Check if player is trying to vote for their own answer
      if (answer.userId === userId) {
        console.log(`User ${userId} attempted to vote for their own answer ${answerId}`);
        return json({ 
          error: 'Cannot vote for your own answer',
          message: 'You cannot vote for your own answer'
        }, { status: 400 });
      }
      
      // Make sure the answer belongs to the current question
      if (answer.questionId !== currentQuestion.id) {
        return json({ error: 'Answer not for current question' }, { status: 400 });
      }
      
      // Record the vote
      // First check if the player has already voted for this question
      const existingVote = await prisma.vote.findFirst({
        where: {
          userId,
          answer: {
            questionId: currentQuestion.id,
            question: {
              roundNumber: room.currentRound
            }
          }
        }
      });
      
      if (existingVote) {
        // Player has already voted, update their vote
        await prisma.vote.update({
          where: { id: existingVote.id },
          data: { answerId }
        });
      } else {
        // Create a new vote
        await prisma.vote.create({
          data: {
            userId,
            answerId
          }
        });
      }
      
      // Increment the votes count on the answer
      await prisma.answer.update({
        where: { id: answerId },
        data: {
          votes: {
            increment: 1
          }
        }
      });
      
      return json({ success: true });
    }
  } catch (error) {
    console.error('Error in vote endpoint:', error);
    return json({ 
      error: 'Failed to process vote',
      details: error.message
    }, { status: 500 });
  }
} 