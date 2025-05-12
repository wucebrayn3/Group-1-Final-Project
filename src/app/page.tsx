'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { generateQuestionnaire, type GenerateQuestionnaireOutput } from '@/ai/flows/generate-questionnaire';
import { evaluateAnswer, type EvaluateAnswerOutput } from '@/ai/flows/evaluate-answer';

// Define Question type using indexed access
type Question = GenerateQuestionnaireOutput['questions'][number];
interface EvaluationResult extends EvaluateAnswerOutput {}

export default function Home() {
  const [pdfContent, setPdfContent] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [isPdfUploaded, setIsPdfUploaded] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState<(EvaluationResult | null)[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(5); // Default question count
  const [score, setScore] = useState<number>(0); // Add score state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setPdfContent(null); // Reset previous content
    setQuestions(null);
    setUserAnswers([]);
    setEvaluationResults([]);
    setScore(0); // Reset score on new upload
    setIsPdfUploaded(false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Basic check for PDF signature
        const arr = new Uint8Array(e.target?.result as ArrayBuffer).subarray(0, 4);
        let header = "";
        for(let i = 0; i < arr.length; i++) {
           header += arr[i].toString(16);
        }
        if (header !== "25504446") { // %PDF signature
           alert("This does not appear to be a valid PDF file.");
           handleClear(); // Clear state if not a valid PDF
           return;
        }

        // Read as text for simplicity, accepting limitations.
         const textReader = new FileReader();
         textReader.onload = (ev) => {
            const content = ev.target?.result as string;
            // Perform a basic check if content seems reasonable (not empty, maybe check length)
             if (!content || content.trim().length < 10) {
                 console.warn("Extracted text content seems very short or empty.");
                 // We might still allow generation, but warn the user or handle it.
             }
            setPdfContent(content);
            setIsPdfUploaded(true);
            setIsLoading(false);
         }
         textReader.onerror = () => {
             alert('Error reading PDF file as text.');
             handleClear();
         }
         textReader.readAsText(file);


      } catch (error) {
        console.error("Error processing PDF:", error);
        alert('Error processing PDF file.');
        handleClear();
      }
    };
     reader.onerror = () => {
         alert('Error reading PDF file.');
         handleClear();
     };
    // Read as ArrayBuffer first for validation
    reader.readAsArrayBuffer(file);
  };

  const handleGenerateQuestions = async () => {
    if (!pdfContent) return;
    setIsLoading(true);
    setQuestions(null); // Clear previous questions
    setUserAnswers([]);
    setEvaluationResults([]);
    setScore(0); // Reset score when generating new questions

    try {
      console.log(`Generating ${questionCount} multiple-choice questions.`);
      const questionnaire = await generateQuestionnaire({ pdfContent, questionCount: Number(questionCount) });
      console.log("Received questionnaire:", questionnaire);

      if (!questionnaire || !questionnaire.questions || questionnaire.questions.length === 0) {
          throw new Error("No questions were generated. The PDF might be empty, contain only images, or the content might not be suitable for question generation.");
      }

      setQuestions(questionnaire.questions);
      setUserAnswers(Array(questionnaire.questions.length).fill(''));
      setEvaluationResults(Array(questionnaire.questions.length).fill(null));
      setIsEvaluating(Array(questionnaire.questions.length).fill(false));
      setScore(0); // Ensure score is reset
    } catch (error) {
      console.error('Error generating questions:', error);
       // Check for rate limit error specifically
       const errorMessage = error instanceof Error ? error.message : String(error);
       if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests") || errorMessage.includes("QuotaFailure")) {
           alert("API rate limit exceeded while generating questions. Please wait a moment and try again, or reduce the number of questions. Check your Google AI plan for details.");
       } else {
           alert(`Failed to generate questions: ${errorMessage}. Please try again.`);
       }
      setQuestions(null); // Ensure questions are cleared on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerChange = (index: number, answer: string) => {
    const newUserAnswers = [...userAnswers];
    newUserAnswers[index] = answer;
    setUserAnswers(newUserAnswers);
  };

  const handleSubmitAnswer = async (index: number) => {
    if (!pdfContent || !questions?.[index] || !userAnswers[index]) {
      console.error("handleSubmitAnswer: Preconditions not met", { pdfContent: !!pdfContent, question: !!questions?.[index], userAnswer: userAnswers[index] });
      return;
    }

    const newIsEvaluating = [...isEvaluating];
    newIsEvaluating[index] = true;
    setIsEvaluating(newIsEvaluating);

    const evaluationInput = {
      question: questions[index].question,
      userAnswer: userAnswers[index],
      correctAnswer: questions[index].answer,
      pdfContent: pdfContent // Pass PDF content for context
    };

    console.log(`Evaluating answer for question ${index + 1}. Input:`, evaluationInput);

    try {
      const evaluation: EvaluateAnswerOutput = await evaluateAnswer(evaluationInput);
      console.log(`Evaluation result for question ${index + 1}:`, evaluation);

      if (typeof evaluation?.score !== 'number') {
        throw new Error(`Invalid evaluation response received: ${JSON.stringify(evaluation)}`);
      }

      const newEvaluationResults = [...evaluationResults];
      newEvaluationResults[index] = evaluation;
      setEvaluationResults(newEvaluationResults);
      console.log("Updated evaluationResults:", newEvaluationResults);

      // Update score if the answer is correct
      if (evaluation.score === 1) {
        setScore((prevScore) => {
          const newScore = prevScore + 1;
          console.log(`Score updated: ${prevScore} -> ${newScore}`);
          return newScore;
        });
      } else {
         console.log(`Answer for question ${index + 1} is incorrect (score: ${evaluation.score}). Score remains ${score}.`);
      }

    } catch (error) {
       console.error(`Error evaluating answer for question ${index + 1}:`, error);
       const errorMessage = error instanceof Error ? error.message : String(error);
       // Check for rate limit error specifically
       if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests") || errorMessage.includes("QuotaFailure")) {
           alert("API rate limit exceeded while evaluating answer. Please wait a moment and try again. Check your Google AI plan for details.");
       } else {
           alert(`Failed to evaluate answer: ${errorMessage}. Please check the console for details.`);
       }
       // Optionally reset the specific evaluation result on error, but keep the UI state consistent
       // const newEvaluationResults = [...evaluationResults];
       // newEvaluationResults[index] = { score: NaN }; // Indicate error, perhaps?
       // setEvaluationResults(newEvaluationResults);
    } finally {
        const finalIsEvaluating = [...isEvaluating]; // Re-fetch state in case it changed
        finalIsEvaluating[index] = false;
        setIsEvaluating(finalIsEvaluating);
        console.log(`Finished evaluation attempt for question ${index + 1}`);
    }
  };

  // Function to check if all answers have been submitted and evaluated
  const allAnswersEvaluated = () => {
    if (!questions || questions.length === 0) return false;
    // Check if every slot in evaluationResults is not null
    return evaluationResults.every(result => result !== null);
  };

  const handleClear = () => {
    console.log("Clearing all state...");
    setPdfContent(null);
    setQuestions(null);
    setUserAnswers([]);
    setIsPdfUploaded(false);
    setEvaluationResults([]);
    setScore(0); // Reset score on clear
    setIsLoading(false);
    setIsEvaluating([]);
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
     console.log("State cleared.");
  };


  return (
    <div className="container mx-auto p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>PDF Quiz Generator</CardTitle>
          <CardDescription>Upload a text-based PDF file to generate a multiple-choice quiz.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
             <Input
               ref={fileInputRef}
               type="file"
               accept=".pdf"
               onChange={handleFileUpload}
               disabled={isLoading}
               className="mb-2"
             />
            <div className="flex items-center space-x-2">
              <Label htmlFor="questionCount" className="whitespace-nowrap">
                Number of Questions:
              </Label>
              <Input
                type='number'
                id="questionCount"
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} // Ensure value is between 1 and 20
                min="1"
                max="20" // Limit max questions
                className="w-20" // Adjust width as needed
                disabled={isLoading || questions !== null} // Disable if loading or questions generated
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleGenerateQuestions} disabled={!isPdfUploaded || isLoading}>
                {isLoading && !questions ? 'Reading PDF...' : isLoading ? 'Generating...' : 'Generate Questions'}
              </Button>
               {(isPdfUploaded || questions) && (
                  <Button onClick={handleClear} variant="outline" disabled={isLoading}>
                    Clear
                  </Button>
               )}
            </div>
            {isLoading && <p>Processing...</p>}
          </div>
        </CardContent>
      </Card>

      {questions && questions.length > 0 && questions.map((question, index) => (
        <Card key={index} className="mb-4">
          <CardHeader>
            <CardTitle>{`Question ${index + 1}`}</CardTitle>
            <CardDescription>{question.question}</CardDescription>
          </CardHeader>
          <CardContent>
             {/* Ensure options is always an array before mapping */}
             {!question.options || !Array.isArray(question.options) || question.options.length !== 4 ? (
                 <p className="text-destructive">Error: Invalid question options received. Expected 4 choices.</p>
             ) : (
                 <RadioGroup
                    value={userAnswers[index]}
                    onValueChange={(value) => handleAnswerChange(index, value)}
                    // Disable if already evaluated OR currently evaluating
                    disabled={evaluationResults[index] !== null || isEvaluating[index]}
                    className="space-y-2"
                  >
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center space-x-2">
                        <RadioGroupItem value={option} id={`q${index}-opt${optionIndex}`} />
                        <Label htmlFor={`q${index}-opt${optionIndex}`}>{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
             )}

              <Button
                 onClick={() => handleSubmitAnswer(index)}
                 // Disable if no answer selected OR already evaluated OR currently evaluating OR options invalid
                 disabled={!userAnswers[index] || evaluationResults[index] !== null || isEvaluating[index] || !question.options || !Array.isArray(question.options) || question.options.length !== 4}
                 className="mt-4"
               >
                 {isEvaluating[index] ? 'Evaluating...' : 'Submit Answer'}
               </Button>


            {evaluationResults[index] && typeof evaluationResults[index]?.score === 'number' && (
              <div className="mt-4 p-4 border rounded bg-muted">
                 <p className="font-semibold">Result:</p>
                 {/* Ensure userAnswers[index] exists before displaying */}
                 {userAnswers[index] ? (
                    <p>Your Answer: <span className={evaluationResults[index]?.score === 1 ? 'text-green-600' : 'text-red-600'}>{userAnswers[index]}</span></p>
                 ) : (
                    <p>Your Answer: <span className='text-muted-foreground'>(Not answered)</span></p>
                 )}
                 {/* Show correct answer only if the user was wrong */}
                 {evaluationResults[index]?.score !== 1 && <p>Correct Answer: <span className="text-green-600">{question.answer}</span></p>}
                 {/* Use score to determine correctness */}
                 <p>Score: {evaluationResults[index]?.score === 1 ? 'Correct ✅' : 'Incorrect ❌'} </p>
              </div>
            )}
            {/* Handle case where evaluation result exists but score is missing (error) */}
             {evaluationResults[index] && typeof evaluationResults[index]?.score !== 'number' && Number.isNaN(evaluationResults[index]?.score) && (
                 <div className="mt-4 p-4 border border-destructive rounded bg-destructive/10">
                    <p className="font-semibold text-destructive">Evaluation Error</p>
                    <p className="text-destructive">Could not determine the result for this question. An API error might have occurred.</p>
                 </div>
            )}
             {/* Handle case where evaluation failed but score is not NaN (e.g., API returned unexpected format) */}
             {evaluationResults[index] && typeof evaluationResults[index]?.score !== 'number' && !Number.isNaN(evaluationResults[index]?.score) && (
                  <div className="mt-4 p-4 border border-destructive rounded bg-destructive/10">
                     <p className="font-semibold text-destructive">Evaluation Error</p>
                     <p className="text-destructive">An unexpected error occurred during evaluation.</p>
                  </div>
             )}
          </CardContent>
        </Card>
      ))}

     {/* Show final score only when all questions are generated and evaluated */}
     {questions && questions.length > 0 && allAnswersEvaluated() && (
       <Card className="mt-6">
         <CardHeader>
           <CardTitle>Quiz Completed!</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="text-lg">
                 <p>
                   You got <span className="font-bold">{score}</span> correct answers out of <span className="font-bold">{questions.length}</span> questions.
                 </p>
                 <p>Overall Score: <span className="font-bold">{questions.length > 0 ? ((score / questions.length) * 100).toFixed(0) : 0}%</span></p>
             </div>
             <Button onClick={handleClear} variant="outline" className="mt-4">
               Start New Quiz
             </Button>
         </CardContent>
       </Card>
     )}
    </div>
  );
}
