import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  const { userId, answer } = await request.json();
  
  try {
    console.log(`Submitting answer for room ${code} by user ${userId}: "${answer}"`);
    
    // Get current room and question
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
    
    if (!room || !room.questions[0]) {
      return json({ error: 'Room or question not found' }, { status: 404 });
    }
    
    const questionId = room.questions[0].id;
    
    // Check if user already submitted an answer
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        questionId,
        userId
      }
    });
    
    if (existingAnswer) {
      // Update existing answer
      const updatedAnswer = await prisma.answer.update({
        where: { id: existingAnswer.id },
        data: { text: answer }
      });
      
      return json({ success: true, answerId: updatedAnswer.id });
    } else {
      // Create new answer
      const newAnswer = await prisma.answer.create({
        data: {
          text: answer,
          userId,
          questionId
        }
      });
      
      return json({ success: true, answerId: newAnswer.id });
    }
  } catch (error) {
    console.error('Error submitting answer:', error);
    return json({ error: 'Failed to submit answer' }, { status: 500 });
  }
} 