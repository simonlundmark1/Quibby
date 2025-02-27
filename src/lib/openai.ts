import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';

// Initialize OpenAI client with the API key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function generateQuestionFromOpenAI(category = 'general') {
  try {
    console.log(`Generating question from OpenAI for category: ${category}`);
    
    const prompt = `Generate a fun and interesting trivia question about ${category} with exactly one correct answer. Include three plausible but incorrect alternatives. The question should have a playful or misleading tone, similar to a bluff in a quiz game, but do not use the word "fibbage" or "correct" anywhere in the text. The question should be in the style of the game fibbage.
    
Format your response as valid JSON with these fields:
- question: a single trivia question
- answer: the single correct answer
- alternatives: an array of three distinct incorrect answers

Make the answer alternatives as short as possible, and similar to how a human would write it under the pressure of time and on a phone.

Do not wrap your response in code fences or backticks. Output valid JSON only.

Do not repeat the same question, or variations of the same question. Try to make the question unique.

Make sure the correct answer does not appear among the incorrect alternatives. Make the question entertaining but avoid explicit, offensive, or overly specialized content.`;

    // Use GPT-4 to generate a question
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use GPT-4 for better questions
      messages: [
        {
          role: "system",
          content: "You are a trivia question generator that creates challenging but fair questions with a clear single correct answer. The question should be in the style of the game fibbage."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 350,
    });
    
    console.log('OpenAI response:', response.choices[0]?.message?.content);
    
    // Parse the response as JSON
    const content = response.choices[0]?.message?.content || '';
    const parsedResponse = JSON.parse(content);
    
    return {
      question: parsedResponse.question,
      answer: parsedResponse.answer,
      alternatives: parsedResponse.alternatives
    };
  } catch (error) {
    console.error('Error generating question with OpenAI:', error);
    
    // Return a fallback question if OpenAI fails
    return generateFallbackQuestion();
  }
}

export async function generateQuestion(category = 'general') {
  return generateQuestionFromOpenAI(category);
}

// Fallback questions in case OpenAI fails
function generateFallbackQuestion() {
  const fallbackQuestions = [
    { 
      question: "What is the capital of France?", 
      answer: "Paris",
      alternatives: ["Lyon", "Marseille", "Nice"] 
    },
    { 
      question: "Which planet is known as the Red Planet?", 
      answer: "Mars",
      alternatives: ["Venus", "Jupiter", "Mercury"] 
    },
    { 
      question: "Who painted the Mona Lisa?", 
      answer: "Leonardo da Vinci",
      alternatives: ["Michelangelo", "Raphael", "Donatello"] 
    },
    { 
      question: "What is the chemical symbol for gold?", 
      answer: "Au",
      alternatives: ["Ag", "Fe", "Cu"] 
    },
    { 
      question: "Which animal is known as the 'King of the Jungle'?", 
      answer: "Lion",
      alternatives: ["Tiger", "Elephant", "Gorilla"] 
    }
  ];
  
  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
} 