import fs from 'fs';
import path from 'path';
import { ensureProblemStateDir, readProblemAssets } from '../problemData';

describe('problemData', () => {
  const problemName = 'uploaded-test-problem-data';
  const problemDir = path.join(process.cwd(), '..', 'PROBLEMS', problemName);

  afterEach(() => {
    fs.rmSync(problemDir, { recursive: true, force: true });
  });

  it('reads required problem assets and reports missing full input', () => {
    fs.mkdirSync(problemDir, { recursive: true });
    fs.writeFileSync(path.join(problemDir, 'statement.txt'), 'Statement');
    fs.writeFileSync(path.join(problemDir, 'sample_in.txt'), '1');
    fs.writeFileSync(path.join(problemDir, 'sample_out.txt'), '2');

    const assets = readProblemAssets(problemName);

    expect(assets.statement).toBe('Statement');
    expect(assets.sampleInput).toBe('1');
    expect(assets.sampleOutput).toBe('2');
    expect(assets.hasFullInput).toBe(false);
    expect(assets.fullInputPath).toBeNull();
  });

  it('creates the _state directory when requested', () => {
    fs.mkdirSync(problemDir, { recursive: true });

    const stateDir = ensureProblemStateDir(problemName);

    expect(fs.existsSync(stateDir)).toBe(true);
    expect(path.basename(stateDir)).toBe('_state');
  });
});
