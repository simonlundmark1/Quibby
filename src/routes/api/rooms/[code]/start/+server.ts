import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { generateQuestion } from '$lib/openai';

// Store alternatives in memory for the session
// This is a temporary solution until database is updated
if (!global.questionAlternatives) {
  global.questionAlternatives = {};
}

export async function POST({ params }) {
  const { code } = params;
  
  try {
    console.log(`Starting new round for room: ${code}`);
    
    // Get current room data
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Increment the round number
    const newRound = room.currentRound + 1;
    
    // Generate a new question
    const category = room.categories ? room.categories[Math.floor(Math.random() * room.categories.length)] : 'general';
    const { question, answer, alternatives } = await generateQuestion(category);
    
    console.log(`Question generated: "${question}" (Answer: "${answer}")`);
    console.log(`Alternatives:`, alternatives);
    
    // Save the question
    const savedQuestion = await prisma.question.create({
      data: {
        text: question,
        correctAnswer: answer,
        alternatives: alternatives || [],
        roomId: room.id,
        roundNumber: newRound
      }
    });
    
    console.log(`Question saved with ID: ${savedQuestion.id}`);
    
    // Save question ID and its alternatives for later use
    global.questionAlternatives[savedQuestion.id] = alternatives;
    
    // Update room status to ANSWERING with new round number
    await prisma.room.update({
      where: { code },
      data: {
        status: 'ANSWERING',
        currentRound: newRound
      }
    });
    
    console.log(`Room ${code} status updated to ANSWERING, round: ${newRound}`);
    
    return json({ 
      success: true,
      newRound,
      questionId: savedQuestion.id 
    });
  } catch (error) {
    console.error('Error starting new round:', error);
    return json({ error: 'Failed to start new round' }, { status: 500 });
  }
} 