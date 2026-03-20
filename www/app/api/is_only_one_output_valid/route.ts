import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as prompts from '../../services/prompts';
import llm from '../../services/llm';
import { IS_ONLY_ONE_OUTPUT_VALID_MODEL } from '../../config/config';
import * as promptLogger from '../../services/promptLogger';
import { ensureProblemStateDir, readProblemAssets } from '../../services/problemData';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const problem = searchParams.get('problem');

  if (!problem) {
    return NextResponse.json({ error: 'Problem name is required' }, { status: 400 });
  }

  const stateDir = ensureProblemStateDir(problem);
  const cacheFilePath = path.join(stateDir, 'is_only_one_output_valid.json');
  
  try {
    // Read the cache file
    let is_only_one_output_valid;
    try {
      const cacheData = fs.readFileSync(cacheFilePath, 'utf8');
      is_only_one_output_valid = JSON.parse(cacheData).is_only_one_output_valid;
    } catch {
      const { statement: problemStatement, sampleInput, sampleOutput } = readProblemAssets(problem);
      const prompt = prompts.is_only_one_output_valid_prompt(problemStatement, sampleInput, sampleOutput);
      promptLogger.log(problem, 'Is Only One Output Valid Prompt', prompt);
      const result = await llm(prompt, IS_ONLY_ONE_OUTPUT_VALID_MODEL);
      console.log('RESULT:', result);
      // If file doesn't exist or is invalid, calculate new value
      is_only_one_output_valid = result !== 'MULTIPLE';
      
      // Save to cache
      fs.writeFileSync(cacheFilePath, JSON.stringify({ is_only_one_output_valid }, null, 2));
    }
    
    return NextResponse.json({ is_only_one_output_valid });
  } catch (error) {
    console.error('Cache operation failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
