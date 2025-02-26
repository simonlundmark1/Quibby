import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_KEY
});

export async function generateQuestion(categories = []) {
  try {
    const categoryText = categories.length > 0 
      ? `about ${categories.join(', ')}` 
      : 'about any general knowledge topic';
    
    const prompt = `
Generate a trivia question ${categoryText}. The question should be challenging but have a definite correct answer.
The answer should be concise (preferably one word or a short phrase).

Also generate 3 plausible but incorrect alternative answers that players might believe.

Provide the output in this format:
Question: [your question here]
CorrectAnswer: [the correct answer here]
Alternative1: [plausible wrong answer 1]
Alternative2: [plausible wrong answer 2]
Alternative3: [plausible wrong answer 3]

Make sure the correct answer is specific and definitive - never say "No answer" or similar.
Each alternative should be plausible enough that someone might think it's correct.
`;

    const response = await openai.completions.create({
      model: "gpt-3.5-turbo-instruct",
      prompt,
      max_tokens: 250,
      temperature: 0.7,
    });

    const text = response.choices[0].text.trim();
    
    // Parse the response
    const questionMatch = text.match(/Question: (.*)/);
    const correctAnswerMatch = text.match(/CorrectAnswer: (.*)/);
    const alt1Match = text.match(/Alternative1: (.*)/);
    const alt2Match = text.match(/Alternative2: (.*)/);
    const alt3Match = text.match(/Alternative3: (.*)/);
    
    if (!questionMatch || !correctAnswerMatch) {
      console.error('Failed to parse question or answer from response:', text);
      return generateFallbackQuestion();
    }
    
    const question = questionMatch[1].trim();
    const correctAnswer = correctAnswerMatch[1].trim();
    
    // Get alternatives or provide empty array if parsing fails
    const alternatives = [
      alt1Match ? alt1Match[1].trim() : null,
      alt2Match ? alt2Match[1].trim() : null,
      alt3Match ? alt3Match[1].trim() : null
    ].filter(Boolean);
    
    // Verify we got a real answer, not "No answer" or similar
    if (correctAnswer.toLowerCase().includes('no answer') || correctAnswer.length < 2) {
      console.log('Got invalid answer, regenerating:', correctAnswer);
      return generateFallbackQuestion();
    }
    
    return {
      question,
      answer: correctAnswer,
      alternatives: alternatives
    };
  } catch (error) {
    console.error('Error generating question:', error);
    return generateFallbackQuestion();
  }
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