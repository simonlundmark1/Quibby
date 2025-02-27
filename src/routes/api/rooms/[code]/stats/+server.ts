import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export async function GET({ params }) {
  const { code } = params;
  
  try {
    // Find the room
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        players: true
      }
    });
    
    if (!room) {
      return json({ error: 'Room not found' }, { status: 404 });
    }
    
    // Get all game scores for this room
    const gameScores = await prisma.gameScore.findMany({
      where: {
        roomId: room.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            score: true
          }
        }
      }
    });
    
    // Calculate game stats
    const totalPlayers = room.players.length;
    const totalRounds = room.currentRound;
    const totalPoints = gameScores.reduce((sum, score) => sum + score.scoreValue, 0);
    const avgPointsPerRound = totalRounds > 0 ? totalPoints / totalRounds : 0;
    
    // Group scores by player
    const playerScores = {};
    
    for (const score of gameScores) {
      if (!playerScores[score.userId]) {
        playerScores[score.userId] = {
          id: score.userId,
          name: score.user.name,
          totalScore: score.user.score,
          scoreBreakdown: {
            correctGuesses: 0,
            playersDeceived: 0,
            roundBreakdown: {}
          },
          rounds: {}
        };
      }
      
      // Add to type totals
      if (score.scoreType === 'correct_guess') {
        playerScores[score.userId].scoreBreakdown.correctGuesses += score.scoreValue;
      } else if (score.scoreType === 'fooled_player') {
        playerScores[score.userId].scoreBreakdown.playersDeceived += score.scoreValue;
      }
      
      // Add to round breakdown
      if (!playerScores[score.userId].scoreBreakdown.roundBreakdown[score.roundNumber]) {
        playerScores[score.userId].scoreBreakdown.roundBreakdown[score.roundNumber] = 0;
      }
      playerScores[score.userId].scoreBreakdown.roundBreakdown[score.roundNumber] += score.scoreValue;
      
      // Track scores by round
      if (!playerScores[score.userId].rounds[score.roundNumber]) {
        playerScores[score.userId].rounds[score.roundNumber] = 0;
      }
      playerScores[score.userId].rounds[score.roundNumber] += score.scoreValue;
    }
    
    // Calculate best round for each player
    const playerStats = Object.values(playerScores).map(player => {
      let bestRound = null;
      let bestScore = 0;
      
      for (const [round, score] of Object.entries(player.rounds)) {
        if (score > bestScore) {
          bestScore = score;
          bestRound = {
            round: parseInt(round),
            score: bestScore
          };
        }
      }
      
      return {
        ...player,
        bestRound
      };
    });
    
    // Sort by total score
    playerStats.sort((a, b) => b.totalScore - a.totalScore);
    
    return json({
      stats: {
        totalPlayers,
        totalRounds,
        totalPoints,
        avgPointsPerRound
      },
      playerStats
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    return json({ error: 'Failed to fetch stats', details: error.message }, { status: 500 });
  }
} 