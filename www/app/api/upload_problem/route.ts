import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PROBLEMS_PATH } from '../../config/config';
import { MODELS, Model } from '../../types/models';
import { parseProblemFromImage } from '../../services/imageProblemParser';
import { getProblemSummary } from '../../services/problemData';

type UploadMetadata = {
  source: 'image' | 'text';
  originalFilename: string;
  parserModel: Model;
  selectedModel: Model;
  confidence: number;
  createdAt: string;
  title: string;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get('image');
    const model = formData.get('model');

    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    }
    if (!MODELS.includes(model as Model)) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    const parsed = await parseProblemFromImage(image, model as Model);
    const problemDir = path.join(PROBLEMS_PATH, parsed.problemSlug);
    const stateDir = path.join(problemDir, '_state');

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(problemDir, 'statement.txt'), `${parsed.title}\n\n${parsed.statement}`.trim());
    fs.writeFileSync(path.join(problemDir, 'sample_in.txt'), parsed.sample_input);
    fs.writeFileSync(path.join(problemDir, 'sample_out.txt'), parsed.sample_output);
    const extension = image.name.includes('.') ? (image.name.split('.').pop() || 'png') : 'png';
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    fs.writeFileSync(path.join(problemDir, `source_image.${extension}`), imageBuffer);

    const metadata: UploadMetadata = {
      source: 'image',
      originalFilename: image.name || 'upload',
      parserModel: parsed.parserModel,
      selectedModel: model as Model,
      confidence: parsed.confidence,
      createdAt: new Date().toISOString(),
      title: parsed.title,
    };
    fs.writeFileSync(path.join(problemDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    return NextResponse.json({
      created: true,
      problem: parsed.problemSlug,
      summary: getProblemSummary(parsed.problemSlug),
    });
  } catch (error) {
    console.error('Error uploading problem:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload problem' },
      { status: 500 },
    );
  }
}
