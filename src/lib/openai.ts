import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';

// Initialize OpenAI client with the API key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function generateQuestionFromOpenAI(category = 'general') {
  try {
    console.log(`Generating question from OpenAI for category: ${category}`);
    
`You are a comedic fill-in-the-blank trivia generator. Generate a fun and surprising trivia question about ${category}
with exactly one correct answer. The question should include a blank space marked as <BLANK> where the answer should go. ¨
Include three plausible but incorrect alternatives that players might guess. The question should be playful and potentially misleading,
similar to the game Fibbage, but do not use the word "fibbage" or "correct" anywhere in the text.
    
Format your response as valid JSON with these fields:
- question: a fill-in-the-blank trivia question (use <BLANK> as placeholder)
- answer: the single correct answer
- alternateSpellings: an array of acceptable variations of the answer
- alternatives: an array of three distinct incorrect but plausible/funny answers

Make the answer alternatives as short as possible, and similar to how a human would write it under time pressure.

Do not wrap your response in code fences or backticks. Output valid JSON only.

Do not repeat the same question, or variations of the same question. Try to make the question unique, weird, amusing, or surprising.

The correct answer should preferably be unusual, but verifiable and true.

Example output format:

{
  "normal": [
    {
      "category": "ExampleCategory1",
      "question": "In 2010, a man from Toronto claimed his pet <BLANK> could predict the weather.",
      "answer": "pineapple",
      "alternateSpellings": ["pine-apple","pinnapple"],
      "suggestions": ["iguana","silver spoon","left sock","pigeon","cheese wheel"]
    },
    {
      "category": "ExampleCategory2",
      "question": "A fashion designer in Milan became famous for making hats out of <BLANK>.",
      "answer": "casseroles",
      "alternateSpellings": ["casserole","caseroles"],
      "suggestions": ["suitcases","clouds","dictionary pages","pigeons","old receipts"]
    },
    {
      "category": "ExampleCategory3",
      "question": "In 1997, an award-winning ham from Nebraska was stolen by a person who insisted they were <BLANK>.",
      "answer": "an alien on a mission",
      "alternateSpellings": ["an alien mission","alien on a mission"],
      "suggestions": ["the tooth fairy","a raccoon whisperer","the mayor","a secret agent","an invisible clown"]
    }
  ]
}`;
    
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
