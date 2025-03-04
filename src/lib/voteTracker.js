/**
 * In-memory vote tracker for storing votes before saving to the database.
 * This provides a fast way to check if a user has voted and retrieve votes
 * without hitting the database for every request.
 */

// Map of questionId -> Map of userId -> answerId
const voteTracker = new Map();

/**
 * Record a vote for a specific user on a specific question
 */
export function recordVote(questionId, userId, answerId) {
  try {
    if (!questionId || !userId || !answerId) {
      console.error('Missing required fields for recordVote');
      return;
    }

    // Initialize the question map if it doesn't exist
    if (!voteTracker.has(questionId)) {
      voteTracker.set(questionId, new Map());
    }

    // Record the vote
    const questionVotes = voteTracker.get(questionId);
    if (questionVotes) {
      questionVotes.set(userId, answerId);
      console.log(`Recorded vote: user ${userId} voted for answer ${answerId} on question ${questionId}`);
    }
  } catch (error) {
    console.error('Error recording vote in tracker:', error);
  }
}

/**
 * Check if a user has voted on a specific question
 */
export function hasVoted(questionId, userId) {
  try {
    if (!questionId || !userId) {
      console.error('Missing required fields for hasVoted');
      return false;
    }

    const questionVotes = voteTracker.get(questionId);
    if (!questionVotes) {
      return false;
    }

    return questionVotes.has(userId);
  } catch (error) {
    console.error('Error checking if user has voted:', error);
    return false;
  }
}

/**
 * Get the answerId a user voted for on a specific question
 */
export function getVotedAnswerId(questionId, userId) {
  try {
    if (!questionId || !userId) {
      console.error('Missing required fields for getVotedAnswerId');
      return null;
    }

    const questionVotes = voteTracker.get(questionId);
    if (!questionVotes) {
      return null;
    }

    return questionVotes.get(userId) || null;
  } catch (error) {
    console.error('Error getting voted answer ID:', error);
    return null;
  }
}

/**
 * Get all votes for a specific question
 */
export function getVotesForQuestion(questionId) {
  try {
    if (!questionId) {
      console.error('Missing required questionId for getVotesForQuestion');
      return null;
    }

    return voteTracker.get(questionId) || null;
  } catch (error) {
    console.error('Error getting votes for question:', error);
    return null;
  }
}

// Export the voteTracker for direct access if needed
export default voteTracker; 