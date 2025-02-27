import { json } from '@sveltejs/kit';
import { PrismaClient } from '@prisma/client';

// Create a fresh Prisma instance just for this endpoint
const voteClient = new PrismaClient();

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
    
    // For special answers (AI alternatives or correct answer)
    if (answerId === 'correct' || answerId.startsWith('ai-alt-')) {
      console.log(`Processing special vote: ${answerId}`);
      return json({ 
        success: true, 
        message: 'Special vote recorded (client-side only)'
      });
    }
    
    // For normal player answers
    console.log(`Processing player vote for answer ID: ${answerId}`);
    
    // Manual SQL query approach instead of Prisma ORM
    // First check if the answer exists and doesn't belong to the user
    const answerCheck = await voteClient.$queryRaw`
      SELECT a.id, a."userId", a."questionId" 
      FROM "Answer" a 
      WHERE a.id = ${answerId}
    `;
    
    if (!answerCheck || answerCheck.length === 0) {
      return json({ error: 'Answer not found' }, { status: 404 });
    }
    
    const answer = answerCheck[0];
    
    if (answer.userId === userId) {
      return json({ error: 'Cannot vote for your own answer' }, { status: 400 });
    }
    
    console.log(`Vote passed validation, recording vote for answer: ${answerId}`);
    
    // Add a check to prevent duplicate votes
    const existingVote = await voteClient.$queryRaw`
      SELECT v.id 
      FROM "Vote" v
      JOIN "Answer" a ON v."answerId" = a.id
      WHERE v."userId" = ${userId}
      AND a."questionId" = (
        SELECT a2."questionId" 
        FROM "Answer" a2 
        WHERE a2.id = ${answerId}
      )
    `;

    if (existingVote && existingVote.length > 0) {
      console.log(`User ${userId} already voted for question with answer ${answerId}`);
      return json({ 
        success: true, 
        message: 'Vote already recorded',
        voteId: existingVote[0].id
      });
    }
    
    // Generate a unique ID for the vote
    const voteId = crypto.randomUUID();
    
    // Create the vote using raw SQL
    await voteClient.$executeRaw`
      INSERT INTO "Vote" (id, "userId", "answerId", "createdAt")
      VALUES (${voteId}, ${userId}, ${answerId}, now())
    `;
    
    console.log(`Vote created with ID: ${voteId}`);
    
    // Update the answer's vote count
    await voteClient.$executeRaw`
      UPDATE "Answer" SET votes = votes + 1 WHERE id = ${answerId}
    `;
    
    return json({ success: true, voteId });
  } catch (error) {
    console.error('Error in vote API:', error);
    
    // Check for unique constraint violation
    if (error.message && error.message.includes('unique constraint')) {
      return json({ 
        error: 'You have already voted for this question',
        details: 'Duplicate vote'
      }, { status: 400 });
    }
    
    return json({ 
      error: 'Failed to record vote', 
      details: error.message
    }, { status: 500 });
  } finally {
    // Always disconnect the client to avoid memory leaks
    await voteClient.$disconnect();
  }
} 