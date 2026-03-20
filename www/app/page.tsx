'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import ProblemColumn from '@/components/ProblemColumn';
import { ProblemService } from './services/problemService';
import { MODELS, Model } from './types/models';
import { ProblemSummary } from './types/problems';

export default function Home() {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [problemRequests, setProblemRequests] = useState<Record<string, { llm: number; compute: number }>>({});
  const [selectedModel, setSelectedModel] = useState<Model>('gpt-4o-mini');
  const [isUploading, setIsUploading] = useState(false);
  const [autoStartProblem, setAutoStartProblem] = useState<string | null>(null);
  const [lastIngestedProblem, setLastIngestedProblem] = useState<ProblemSummary | null>(null);
  const [textContent, setTextContent] = useState('');
  const [isSubmittingText, setIsSubmittingText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProblems = async () => {
    const response = await fetch('/api/problems');
    const data = await response.json();
    setProblems(data.problems);
  };

  useEffect(() => {
    fetchProblems();

    // Set up request counter listener
    const handleRequestCount = (problem: string, llm_count: number, compute_count: number) => {
      setProblemRequests(prev => ({
        ...prev,
        [problem]: { llm: llm_count, compute: compute_count }
      }));
    };
    ProblemService.addListener(handleRequestCount);

    return () => {
      ProblemService.removeListener(handleRequestCount);
    };
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('model', selectedModel);

      const response = await fetch('/api/upload_problem', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload problem');
      }
      await fetchProblems();
      setLastIngestedProblem(data.summary);
      setAutoStartProblem(data.problem);
    } catch (error) {
      console.error('Problem upload failed:', error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleTextSubmit = async () => {
    setIsSubmittingText(true);
    try {
      const response = await fetch('/api/create_problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          content: textContent,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create problem');
      }
      await fetchProblems();
      setLastIngestedProblem(data.summary);
      setAutoStartProblem(data.problem);
      setTextContent('');
    } catch (error) {
      console.error('Problem text submission failed:', error);
    } finally {
      setIsSubmittingText(false);
    }
  };

  // Calculate totals
  const totalLLM = Object.values(problemRequests).reduce((sum, curr) => sum + curr.llm, 0);
  const totalCompute = Object.values(problemRequests).reduce((sum, curr) => sum + curr.compute, 0);

  return (
    <main className="h-screen flex flex-col">
      <div className="flex flex-col items-start gap-4 p-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col ml-[20px]">
            <span className="text-3xl font-bold bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] bg-clip-text text-transparent">
              🐟 STACKFISH
            </span>
          </div>
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <span>Model</span>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as Model)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
              >
                {MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="py-2 px-3 rounded text-sm border border-gray-700 hover:border-gray-500 disabled:opacity-50"
            >
              {isUploading ? 'Parsing image...' : 'Upload question image'}
            </button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${totalLLM > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs font-medium">
                {totalLLM} Concurrent LLM requests
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${totalCompute > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs font-medium">
                {totalCompute} Concurrent compute requests
              </span>
            </div>
          </div>
        </div>
        <div className="w-full grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <div className="border border-gray-800 rounded-xl p-4 bg-black/20">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Add Problem</h2>
              <span className="text-xs text-gray-400">Auto-starts after intake</span>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="w-full py-2 px-3 rounded text-sm border border-gray-700 hover:border-gray-500 disabled:opacity-50"
              >
                {isUploading ? 'Parsing image...' : 'Upload question image'}
              </button>
              <div className="space-y-2">
                <textarea
                  value={textContent}
                  onChange={(event) => setTextContent(event.target.value)}
                  placeholder="Paste the complete problem text here, including sample input and sample output"
                  className="w-full h-56 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={isSubmittingText || !textContent.trim()}
                  className="w-full py-2 px-3 rounded text-sm bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmittingText ? 'Parsing pasted text...' : 'Create from pasted text'}
                </button>
              </div>
            </div>
          </div>
          <div className="border border-gray-800 rounded-xl p-4 bg-black/20 min-h-[180px]">
            <h2 className="text-sm font-semibold mb-3">Latest Intake</h2>
            {lastIngestedProblem ? (
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
                <div className="space-y-2">
                  {lastIngestedProblem.image_url ? (
                    <img
                      src={lastIngestedProblem.image_url}
                      alt={lastIngestedProblem.title}
                      className="w-full rounded-lg border border-gray-800 object-cover"
                    />
                  ) : (
                    <div className="h-[140px] rounded-lg border border-dashed border-gray-700 flex items-center justify-center text-xs text-gray-500">
                      Text-only intake
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    <div>Source: {lastIngestedProblem.source}</div>
                    {lastIngestedProblem.confidence !== undefined && (
                      <div>Confidence: {Math.round(lastIngestedProblem.confidence * 100)}%</div>
                    )}
                    {lastIngestedProblem.parser_model && <div>Parser: {lastIngestedProblem.parser_model}</div>}
                  </div>
                </div>
                <div className="space-y-2 min-w-0">
                  <div className="text-sm font-semibold">{lastIngestedProblem.title}</div>
                  <pre className="text-xs whitespace-pre-wrap text-gray-300 max-h-32 overflow-y-auto">{lastIngestedProblem.statement_preview}</pre>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Sample input</div>
                      <pre className="text-xs whitespace-pre-wrap text-gray-300 bg-gray-950 rounded p-2 max-h-24 overflow-y-auto">{lastIngestedProblem.sample_input_preview}</pre>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Sample output</div>
                      <pre className="text-xs whitespace-pre-wrap text-gray-300 bg-gray-950 rounded p-2 max-h-24 overflow-y-auto">{lastIngestedProblem.sample_output_preview}</pre>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                Upload an image or paste text to preview the parsed problem here.
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-6 overflow-x-auto p-8 pt-0 flex-1">
        {problems.map((problem) => (
          <ProblemColumn
            key={problem.name}
            problem={problem}
            model={selectedModel}
            autoStart={problem.name === autoStartProblem}
            onAutoStartHandled={() => {
              if (problem.name === autoStartProblem) {
                setAutoStartProblem(null);
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}
