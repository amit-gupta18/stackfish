import fs from 'fs';
import path from 'path';
import { PROBLEMS_PATH } from '../config/config';
import { ProblemSummary, ProblemSource } from '../types/problems';

export type ProblemAssets = {
  problem: string;
  problemDir: string;
  statement: string;
  sampleInput: string;
  sampleOutput: string;
  fullInputPath: string | null;
  hasFullInput: boolean;
};

export function getProblemDir(problem: string): string {
  return path.join(PROBLEMS_PATH, problem);
}

export function ensureProblemStateDir(problem: string): string {
  const stateDir = path.join(getProblemDir(problem), '_state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

export function readProblemAssets(problem: string): ProblemAssets {
  const problemDir = getProblemDir(problem);
  const fullInputPath = path.join(problemDir, 'full_in.txt');

  return {
    problem,
    problemDir,
    statement: fs.readFileSync(path.join(problemDir, 'statement.txt'), 'utf8').trim(),
    sampleInput: fs.readFileSync(path.join(problemDir, 'sample_in.txt'), 'utf8').trim(),
    sampleOutput: fs.readFileSync(path.join(problemDir, 'sample_out.txt'), 'utf8').trim(),
    fullInputPath: fs.existsSync(fullInputPath) ? fullInputPath : null,
    hasFullInput: fs.existsSync(fullInputPath),
  };
}

type ProblemMetadata = {
  source?: ProblemSource;
  confidence?: number;
  parserModel?: string;
  originalFilename?: string;
  title?: string;
};

function truncatePreview(content: string, maxLength: number = 220): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength).trimEnd()}...`;
}

function readProblemMetadata(problemDir: string): ProblemMetadata | null {
  const metadataPath = path.join(problemDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as ProblemMetadata;
  } catch {
    return null;
  }
}

export function getProblemImageFilename(problem: string): string | null {
  const problemDir = getProblemDir(problem);
  const files = fs.readdirSync(problemDir);
  const imageFile = files.find((file) => file.startsWith('source_image.'));
  return imageFile || null;
}

export function getProblemSummary(problem: string): ProblemSummary {
  const assets = readProblemAssets(problem);
  const metadata = readProblemMetadata(assets.problemDir);
  const firstLine = assets.statement.split('\n').find((line) => line.trim().length > 0)?.trim() || problem;
  const title = metadata?.title || firstLine;
  const imageFilename = getProblemImageFilename(problem);

  return {
    name: problem,
    title,
    source: metadata?.source || 'disk',
    confidence: metadata?.confidence,
    parser_model: metadata?.parserModel,
    original_filename: metadata?.originalFilename,
    image_url: imageFilename ? `/api/problem_asset?problem=${encodeURIComponent(problem)}&file=${encodeURIComponent(imageFilename)}` : null,
    statement_preview: truncatePreview(assets.statement),
    sample_input_preview: truncatePreview(assets.sampleInput, 120),
    sample_output_preview: truncatePreview(assets.sampleOutput, 120),
  };
}
