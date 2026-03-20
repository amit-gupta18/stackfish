import { NextResponse } from 'next/server';

import * as prompts from '../../services/prompts';
import llm from '../../services/llm';
import { Model } from '../../types/models';
import * as algo_rag from '../../services/algo_rag';
import * as promptLogger from '../../services/promptLogger';
import {parseCode} from '../../services/parse_utils'
import { SyntheticTest } from '../../types/tests';
import { readProblemAssets } from '../../services/problemData';

async function comeUpWithSolution(problem: string, model: Model, attack_vector?: string, tags?: string[], tests?: SyntheticTest[]): Promise<string> {
    const { statement, sampleInput, sampleOutput } = readProblemAssets(problem);

    const techniques = algo_rag.get_techniques_from_tags(tags || []);

    const main_prompt = prompts.main_prompt(statement, sampleInput, sampleOutput, attack_vector, techniques, tests || []);
    promptLogger.log(problem, 'Main Solution Prompt', main_prompt);
    const cppCodeUnformated = await llm(main_prompt, model);
    return parseCode(cppCodeUnformated);
}


export async function POST(request: Request) {
    // Get the problem and model from URL params
    const { searchParams } = new URL(request.url);
    const problem = searchParams.get('problem');
    const model = searchParams.get('model') as Model;

    // Get attack_vector and tags from request body
    const body = await request.json();
    const { attack_vector, tags, tests } = body;

    if (!problem) {
        return NextResponse.json({ error: 'Problem parameter is required' }, { status: 400 });
    }

    if (!model) {
        return NextResponse.json({ error: 'Model parameter is required' }, { status: 400 });
    }

    const solution = await comeUpWithSolution(problem, model, attack_vector, tags, tests);
    console.log('SOLUTION: ', solution);
    // Return the response
    return NextResponse.json({ solution });
} 
