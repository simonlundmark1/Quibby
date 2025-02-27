import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  let requestData;
  
  try {
    requestData = await request.json();
    const { userId, answer, questionId } = requestData;
    
    console.log(`Processing answer for room ${code}: User ${userId} answering "${answer}" for question ${questionId}`);
    
    if (!userId || !answer || !questionId) {
      console.error('Missing required fields:', { userId, answer, questionId });
      return json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Validate the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.error(`User not found: ${userId}`);
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    // Validate the question exists
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    });
    
    if (!question) {
      console.error(`Question not found: ${questionId}`);
      return json({ error: 'Question not found' }, { status: 404 });
    }
    
    // Check if room is in the correct state for answering
    const room = await prisma.room.findUnique({
      where: { code }
    });
    
    if (!room) {
      console.error(`Room not found: ${code}`);
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    if (room.status !== 'ANSWERING' && room.status !== 'QUESTION') {
      console.error(`Room not in answering phase: ${room.status}`);
      return json({ error: 'Room is not in answering phase' }, { status: 400 });
    }
    
    // Check if user has already answered this question
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        userId,
        questionId
      }
    });
    
    if (existingAnswer) {
      // Update existing answer
      console.log(`User ${userId} updating existing answer ${existingAnswer.id}`);
      const updatedAnswer = await prisma.answer.update({
        where: { id: existingAnswer.id },
        data: { text: answer }
      });
      
      return json({ success: true, answer: updatedAnswer });
    }
    
    // Create a new answer
    console.log(`User ${userId} creating new answer for question ${questionId}`);
    const newAnswer = await prisma.answer.create({
      data: {
        text: answer,
        userId,
        questionId
      }
    });
    
    console.log(`Answer created successfully: ${newAnswer.id}`);
    return json({ success: true, answer: newAnswer });
  } catch (error) {
    console.error('Error processing answer submission:', error);
    console.error('Request data:', requestData);
    return json({ 
      error: 'Failed to process answer',
      details: error.message
    }, { status: 500 });
  }
} 