import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PROBLEMS_PATH } from '../../config/config';
import { MODELS, Model } from '../../types/models';
import { getProblemSummary } from '../../services/problemData';
import { parseProblemFromText } from '../../services/imageProblemParser';

type CreateProblemBody = {
  model: Model;
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateProblemBody;
    const { model, content } = body;

    if (!model || !MODELS.includes(model)) {
      return NextResponse.json({ error: 'Valid model is required' }, { status: 400 });
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Problem text is required' }, { status: 400 });
    }

    const parsed = await parseProblemFromText(content, model);
    const problem = parsed.problemSlug;
    const problemDir = path.join(PROBLEMS_PATH, problem);
    const stateDir = path.join(problemDir, '_state');

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(problemDir, 'statement.txt'), `${parsed.title}\n\n${parsed.statement}`.trim());
    fs.writeFileSync(path.join(problemDir, 'sample_in.txt'), parsed.sample_input.trim());
    fs.writeFileSync(path.join(problemDir, 'sample_out.txt'), parsed.sample_output.trim());
    fs.writeFileSync(
      path.join(problemDir, 'metadata.json'),
      JSON.stringify(
        {
          source: 'text',
          selectedModel: model,
          confidence: parsed.confidence,
          createdAt: new Date().toISOString(),
          title: parsed.title,
          originalFilename: 'pasted-text',
          parserModel: parsed.parserModel,
        },
        null,
        2,
      ),
    );

    return NextResponse.json({
      created: true,
      problem,
      summary: getProblemSummary(problem),
    });
  } catch (error) {
    console.error('Error creating text problem:', error);
    return NextResponse.json({ error: 'Failed to create problem' }, { status: 500 });
  }
}
