import fs from 'fs';
import path from 'path';
import { PROBLEMS_PATH } from '../config/config';

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
