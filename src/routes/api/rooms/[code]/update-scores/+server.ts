import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function POST({ request, params }) {
  const { code } = params;
  const { leaderboard } = await request.json();
  
  try {
    console.log(`Updating scores for room: ${code}`);
    
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Process each player's score and update the database
    const updates = [];
    
    // Build transaction operations
    for (const player of leaderboard) {
      console.log(`Updating player ${player.name} with +${player.score} points`);
      
      // Add update operation to our list
      updates.push(
        prisma.user.update({
          where: { id: player.id },
          data: { 
            score: { 
              increment: player.score 
            } 
          }
        })
      );
    }
    
    // Execute all updates in a transaction
    if (updates.length > 0) {
      const results = await prisma.$transaction(updates);
      console.log(`Updated scores for ${results.length} players`);
    }
    
    // After updating, get the latest total scores for all players
    const updatedPlayers = await prisma.user.findMany({
      where: {
        id: {
          in: leaderboard.map(p => p.id)
        }
      },
      select: {
        id: true,
        name: true,
        score: true,
        gameScores: {
          where: {
            roomId: room.id
          },
          select: {
            scoreType: true,
            scoreValue: true,
            roundNumber: true
          }
        }
      }
    });
    
    // Sort by total score
    const totalLeaderboard = updatedPlayers
      .sort((a, b) => b.score - a.score)
      .map(player => ({
        id: player.id,
        name: player.name,
        totalScore: player.score,
        scoreBreakdown: summarizeScores(player.gameScores)
      }));
    
    return json({ 
      success: true,
      totalLeaderboard
    });
    
  } catch (error) {
    console.error('Error updating scores:', error);
    return json({ error: 'Failed to update scores', details: error.message }, { status: 500 });
  }
}

// Helper function to summarize scores by type
function summarizeScores(gameScores) {
  const summary = {
    correctGuesses: 0,
    playersDeceived: 0,
    roundBreakdown: {}
  };
  
  for (const score of gameScores) {
    // Add to type totals
    if (score.scoreType === 'correct_guess') {
      summary.correctGuesses += score.scoreValue;
    } else if (score.scoreType === 'fooled_player') {
      summary.playersDeceived += score.scoreValue;
    }
    
    // Add to round breakdown
    if (!summary.roundBreakdown[score.roundNumber]) {
      summary.roundBreakdown[score.roundNumber] = 0;
    }
    summary.roundBreakdown[score.roundNumber] += score.scoreValue;
  }
  
  return summary;
} 