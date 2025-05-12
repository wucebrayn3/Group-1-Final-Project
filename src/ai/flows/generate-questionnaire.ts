'use server';
/**
 * @fileOverview Generates a questionnaire from a PDF file.
 *
 * - generateQuestionnaire - A function that handles the questionnaire generation process.
 * - GenerateQuestionnaireInput - The input type for the generateQuestionnaire function.
 * - GenerateQuestionnaireOutput - The return type for the generateQuestionnaire function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateQuestionnaireInputSchema = z.object({
  pdfContent: z.string().describe('The text content of the PDF file.'),
  questionCount: z.number().describe('The number of questions to generate.'),
});
export type GenerateQuestionnaireInput = z.infer<typeof GenerateQuestionnaireInputSchema>;

const GenerateQuestionnaireOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe('The question generated from the PDF content.'),
      answer: z.string().describe('The correct answer to the question.'),
      options: z.array(z.string()).describe('Multiple choice options.'),
    })
  ).describe('An array of questions generated from the PDF content.'),
});
export type GenerateQuestionnaireOutput = z.infer<typeof GenerateQuestionnaireOutputSchema>;

export async function generateQuestionnaire(input: GenerateQuestionnaireInput): Promise<GenerateQuestionnaireOutput> {
  try {
    return await generateQuestionnaireFlow(input);
  } catch (error) {
    console.error('Error in generateQuestionnaire:', error);
    throw new Error('Failed to generate questionnaire.');
  }
}

const prompt = ai.definePrompt({
  name: 'generateQuestionnairePrompt',
  input: {
    schema: z.object({
      pdfContent: z.string().describe('The text content of the PDF file.'),
      questionCount: z.number().describe('The number of questions to generate.'),
    }),
  },
  output: {
    schema: z.object({
      questions: z.array(
        z.object({
          question: z.string().describe('The question generated from the PDF content.'),
          answer: z.string().describe('The correct answer to the question.'),
          options: z.array(z.string()).describe('Multiple choice options. Always provide 4 options.'),
        })
      ).describe('An array of questions generated from the PDF content.'),
    }),
  },
  prompt: `You are an expert in creating questionnaires from PDF documents. Your task is to generate a set of multiple-choice questions based on the content of the PDF provided.

PDF Content: {{{pdfContent}}}

Generate {{{questionCount}}} multiple-choice questions. For each question, provide four options, with only one being the correct answer. Ensure that the incorrect options are plausible but clearly wrong. Structure your output in JSON format.
`,
});

const generateQuestionnaireFlow = ai.defineFlow<
  typeof GenerateQuestionnaireInputSchema,
  typeof GenerateQuestionnaireOutputSchema
>(
  {
    name: 'generateQuestionnaireFlow',
    inputSchema: GenerateQuestionnaireInputSchema,
    outputSchema: GenerateQuestionnaireOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
