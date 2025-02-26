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
    console.log(`Starting game for room: ${code}`);
    
    // Find room
    const room = await prisma.room.findUnique({
      where: { code },
      include: { players: true }
    });
    
    if (!room) {
      console.error(`Room not found: ${code}`);
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Ensure there are enough players
    if (room.players.length < 2) {
      console.error(`Not enough players to start game: ${room.players.length}`);
      return json({ error: 'Need at least 2 players to start' }, { status: 400 });
    }
    
    console.log(`Generating question for room: ${code} with categories:`, room.categories);
    
    // Generate question with categories and alternatives
    const { question, answer, alternatives } = await generateQuestion(room.categories);
    
    console.log(`Question generated: "${question}" (Answer: "${answer}")`);
    console.log(`Alternatives:`, alternatives);
    
    // Save question to database with alternatives (now that the database is updated)
    const newQuestion = await prisma.question.create({
      data: {
        text: question,
        correctAnswer: answer,
        alternatives: alternatives,
        roomId: room.id,
        roundNumber: room.currentRound + 1
      }
    });
    
    console.log(`Question saved with ID: ${newQuestion.id}`);
    
    // Save question ID and its alternatives for later use
    global.questionAlternatives[newQuestion.id] = alternatives;
    
    // Update room status
    await prisma.room.update({
      where: { code },
      data: {
        status: 'ANSWERING',
        currentRound: { increment: 1 }
      }
    });
    
    console.log(`Room ${code} status updated to ANSWERING, round: ${room.currentRound + 1}`);
    
    return json({ success: true });
  } catch (error) {
    console.error('Error starting game:', error);
    return json({ error: 'Failed to start game' }, { status: 500 });
  }
} 