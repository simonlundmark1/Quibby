import { generateQuestionFromOpenAI } from './openai';

/**
 * Generates a question with answer and alternatives
 */
export async function generateQuestion(category: string) {
  try {
    console.log(`Generating question in category: ${category}`);
    
    // If you have the OpenAI implementation, use it
    // return await generateQuestionFromOpenAI(category);
    
    // Otherwise, use this fallback with some hardcoded questions
    const questions = {
      'general': [
        {
          question: 'What is the capital of France?',
          answer: 'Paris',
          alternatives: ['Lyon', 'Marseille', 'Nice']
        },
        {
          question: 'Who painted the Mona Lisa?',
          answer: 'Leonardo da Vinci',
          alternatives: ['Michelangelo', 'Raphael', 'Donatello']
        }
      ],
      'science': [
        {
          question: 'What is the chemical symbol for water?',
          answer: 'H2O',
          alternatives: ['CO2', 'NaCl', 'O2']
        },
        {
          question: 'What planet is known as the Red Planet?',
          answer: 'Mars',
          alternatives: ['Venus', 'Jupiter', 'Mercury']
        }
      ],
      'history': [
        {
          question: 'In which year did World War II end?',
          answer: '1945',
          alternatives: ['1939', '1941', '1950']
        },
        {
          question: 'Who was the first President of the United States?',
          answer: 'George Washington',
          alternatives: ['Thomas Jefferson', 'Abraham Lincoln', 'John Adams']
        }
      ]
    };
    
    // Get questions for the category or fallback to general
    const categoryQuestions = questions[category] || questions['general'];
    
    // Randomly select one
    const randomIndex = Math.floor(Math.random() * categoryQuestions.length);
    const selected = categoryQuestions[randomIndex];
    
    return {
      question: selected.question,
      answer: selected.answer,
      alternatives: selected.alternatives
    };
  } catch (error) {
    console.error('Error generating question:', error);
    // Return a fallback question if there's an error
    return {
      question: 'What color is the sky on a clear day?',
      answer: 'Blue',
      alternatives: ['Green', 'Red', 'Yellow']
    };
  }
} 