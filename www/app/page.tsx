'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import ProblemColumn from '@/components/ProblemColumn';
import { ProblemService } from './services/problemService';
import { MODELS, Model } from './types/models';

export default function Home() {
  const [problems, setProblems] = useState<string[]>([]);
  const [problemRequests, setProblemRequests] = useState<Record<string, { llm: number; compute: number }>>({});
  const [selectedModel, setSelectedModel] = useState<Model>('gpt-4o-mini');
  const [isUploading, setIsUploading] = useState(false);
  const [autoStartProblem, setAutoStartProblem] = useState<string | null>(null);
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
      setAutoStartProblem(data.problem);
    } catch (error) {
      console.error('Problem upload failed:', error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
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
      </div>
      <div className="flex gap-6 overflow-x-auto p-8 pt-0 flex-1">
        {problems.map((problem) => (
          <ProblemColumn
            key={problem}
            name={problem}
            model={selectedModel}
            autoStart={problem === autoStartProblem}
            onAutoStartHandled={() => {
              if (problem === autoStartProblem) {
                setAutoStartProblem(null);
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}
