import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { getVotesForQuestion } from '$lib/voteTracker.js';

export async function GET({ params, url }) {
  const { code } = params;
  const questionId = url.searchParams.get('questionId');
  
  try {
    // Check if the room exists
    const room = await prisma.room.findUnique({
      where: { code },
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // If questionId is not provided, use the current question from the room
    let currentQuestionId = questionId;
    if (!currentQuestionId) {
      // Find the current question for this room
      const currentQuestion = await prisma.question.findFirst({
        where: {
          roomId: room.id,
          roundNumber: room.currentRound,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      if (!currentQuestion) {
        return json({ error: 'No active question found for this room' }, { status: 404 });
      }
      
      currentQuestionId = currentQuestion.id;
    }
    
    // Prepare the array to hold votes
    let votes = [];
    
    // Get all votes from the in-memory tracker
    try {
      // Get votes from the in-memory tracker
      const questionVotes = getVotesForQuestion(currentQuestionId);
      
      if (questionVotes && questionVotes.size > 0) {
        console.log(`Found ${questionVotes.size} votes in memory tracker for question ${currentQuestionId}`);
        
        // Get all users involved in the votes to include their names
        const userIds = Array.from(questionVotes.keys());
        const users = await prisma.user.findMany({
          where: {
            id: { in: userIds },
          },
        });
        
        // Create a map for quick lookup of user names
        const userMap = new Map();
        users.forEach(user => {
          userMap.set(user.id, user);
        });
        
        // Get all answers involved in the votes
        const answerIds = Array.from(new Set(questionVotes.values()));
        const answers = await prisma.answer.findMany({
          where: {
            id: { in: answerIds },
          },
          include: {
            user: true,
          },
        });
        
        // Create a map for quick lookup of answers and their associated users
        const answerMap = new Map();
        answers.forEach(answer => {
          answerMap.set(answer.id, answer);
        });
        
        // Convert the Map entries to vote objects
        for (const [userId, answerId] of questionVotes.entries()) {
          const user = userMap.get(userId);
          const answer = answerMap.get(answerId);
          
          if (user && answer) {
            votes.push({
              id: `${answerId}-${userId}`,
              answerId,
              userId,
              questionId: currentQuestionId,
              user: {
                id: user.id,
                name: user.name,
              },
              answer: {
                id: answer.id,
                text: answer.text,
                user: {
                  id: answer.user.id,
                  name: answer.user.name,
                },
              },
            });
          }
        }
        console.log(`Converted ${votes.length} votes from memory tracker`);
      } else {
        // Fallback to checking the votes stored in the Answer model
        console.log(`No votes found in tracker, using answer.votes counts`);
        
        // Get answers with votes
        const votedAnswers = await prisma.answer.findMany({
          where: {
            questionId: currentQuestionId,
            votes: { gt: 0 },
          },
          include: {
            user: true,
          },
        });
        
        // Create placeholder votes from the vote counts
        for (const answer of votedAnswers) {
          for (let i = 0; i < answer.votes; i++) {
            votes.push({
              id: `${answer.id}-vote-${i}`,
              answerId: answer.id,
              userId: null, // We don't know which user voted
              questionId: currentQuestionId,
              answer: {
                id: answer.id,
                text: answer.text,
                user: {
                  id: answer.user.id,
                  name: answer.user.name,
                },
              },
            });
          }
        }
        console.log(`Created ${votes.length} votes from answer.votes counts`);
      }
    } catch (error) {
      console.error('Error fetching votes:', error);
      votes = []; // Default to empty array if query fails
    }
    
    // Special votes for other people's answers
    const specialVotes = [];
    // ... implement special votes if needed
    
    // Combine regular and special votes
    const allVotes = [...votes, ...specialVotes];
    
    return json({
      success: true,
      data: {
        votes: allVotes,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching votes:', error);
    return json({ 
      error: 'Failed to fetch votes',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 