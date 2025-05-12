'use server';
/**
 * @fileOverview A flow to evaluate the accuracy and completeness of a user's answer to a question, providing a self-assessment score.
 *
 * - evaluateAnswer - A function that evaluates the user's answer.
 * - EvaluateAnswerInput - The input type for the evaluateAnswer function.
 * - EvaluateAnswerOutput - The return type for the evaluateAnswer function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EvaluateAnswerInputSchema = z.object({
  question: z.string().describe('The question that was asked.'),
  userAnswer: z.string().describe("The user's answer to the question."),
  correctAnswer: z.string().describe('The correct answer to the question.'),
  pdfContent: z.string().describe('The content of the PDF file.'),
});
export type EvaluateAnswerInput = z.infer<typeof EvaluateAnswerInputSchema>;

// Remove feedback from the output schema
const EvaluateAnswerOutputSchema = z.object({
  score: z.number().describe('A score between 0 and 1 indicating the accuracy and completeness of the user\u0027s answer.'),
});
export type EvaluateAnswerOutput = z.infer<typeof EvaluateAnswerOutputSchema>;

export async function evaluateAnswer(input: EvaluateAnswerInput): Promise<EvaluateAnswerOutput> {
  return evaluateAnswerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'evaluateAnswerPrompt',
  input: {
    schema: z.object({
      question: z.string().describe('The question that was asked.'),
      userAnswer: z.string().describe("The user's answer to the question."),
      correctAnswer: z.string().describe('The correct answer to the question.'),
      pdfContent: z.string().describe('The content of the PDF file.'),
    }),
  },
  output: {
    // Update output schema definition here as well
    schema: z.object({
      score: z.number().describe('A score between 0 and 1 indicating the accuracy and completeness of the user\u0027s answer.'),
    }),
  },
  // Remove the request for feedback from the prompt
  prompt: `You are an AI expert in evaluating answers to multiple-choice questions based on a given PDF content.\n\nYou will receive the question, the user's answer, the correct answer, and the content of the PDF file. Your task is to evaluate the user's answer based on its accuracy compared to the correct answer and the PDF content.\n\nProvide ONLY a score between 0 and 1, where 0 indicates an incorrect answer, and 1 indicates a correct answer. The PDF content is the source of truth so it should be considered the final source of truth. If the PDF content is not related to the question, the score should be 0.\n\nQuestion: {{{question}}}\nUser's Answer: {{{userAnswer}}}\nCorrect Answer: {{{correctAnswer}}}\nPDF Content: {{{pdfContent}}}\n\nScore:`,
});

const evaluateAnswerFlow = ai.defineFlow<
  typeof EvaluateAnswerInputSchema,
  typeof EvaluateAnswerOutputSchema // Use the updated output schema
>(
  {
    name: 'evaluateAnswerFlow',
    inputSchema: EvaluateAnswerInputSchema,
    outputSchema: EvaluateAnswerOutputSchema, // Use the updated output schema
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure output conforms to the new schema (no feedback)
    return output!;
  }
);
