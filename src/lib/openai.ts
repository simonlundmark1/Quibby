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

Provide the output in this format:
Question: [your question here]
Answer: [the correct answer here]

Make sure the Answer is specific and definitive - never say "No answer" or similar.
`;

    const response = await openai.completions.create({
      model: "gpt-3.5-turbo-instruct",
      prompt,
      max_tokens: 150,
      temperature: 0.7,
    });

    const text = response.choices[0].text.trim();
    
    // Parse the response
    const questionMatch = text.match(/Question: (.*)/);
    const answerMatch = text.match(/Answer: (.*)/);
    
    if (!questionMatch || !answerMatch) {
      console.error('Failed to parse question or answer from response:', text);
      return generateFallbackQuestion();
    }
    
    const question = questionMatch[1].trim();
    const answer = answerMatch[1].trim();
    
    // Verify we got a real answer, not "No answer" or similar
    if (answer.toLowerCase().includes('no answer') || answer.length < 2) {
      console.log('Got invalid answer, regenerating:', answer);
      return generateFallbackQuestion();
    }
    
    return {
      question,
      answer
    };
  } catch (error) {
    console.error('Error generating question:', error);
    return generateFallbackQuestion();
  }
}

// Fallback questions in case OpenAI fails
function generateFallbackQuestion() {
  const fallbackQuestions = [
    { question: "What is the capital of France?", answer: "Paris" },
    { question: "Which planet is known as the Red Planet?", answer: "Mars" },
    { question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci" },
    { question: "What is the chemical symbol for gold?", answer: "Au" },
    { question: "Which animal is known as the 'King of the Jungle'?", answer: "Lion" }
  ];
  
  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
} 