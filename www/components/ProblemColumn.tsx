'use client';

import { useState, useEffect, useRef } from 'react';
import { ProblemService, type Log } from '@/app/services/problemService';
import { Model } from '@/app/types/models';
import { ProblemSummary } from '@/app/types/problems';

// New component to handle recursive log rendering
function LogItem({ log }: { log: Log }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1 text-xs">
        <pre className="font-mono whitespace-pre-wrap">{log.message}</pre>
        {log.status === 'loading' && <span className="animate-spin">⚡</span>}
        {log.status === 'success' && <span className="text-green-500">✅</span>}
        {log.status === 'done' && <span className="text-green-500">✔️</span>}
        {log.status === 'error' && <span className="text-red-500">❌</span>}
      </div>
      {log.sub_tasks && log.sub_tasks.length > 0 && (
        <div className="ml-2 border-l border-gray-700 pl-2 space-y-1">
          {log.sub_tasks!.map((subLog, index) => (
            <div key={subLog.id} className="pb-1">
              <LogItem log={subLog} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestStats({ llmCount, computeCount }: { llmCount: number; computeCount: number }) {
  return (
    <div className="flex gap-2">
      <div className="flex items-center gap-1 text-xs bg-gray-800 rounded">
        <div className={`w-1.5 h-1.5 rounded-full ${llmCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span>{llmCount} LLM</span>
      </div>
      <div className="flex items-center gap-1 text-xs bg-gray-800 rounded">
        <div className={`w-1.5 h-1.5 rounded-full ${computeCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span>{computeCount} Computing</span>
      </div>
    </div>
  );
}

export default function ProblemColumn({
  problem,
  model,
  autoStart = false,
  onAutoStartHandled,
}: {
  problem: ProblemSummary;
  model: Model;
  autoStart?: boolean;
  onAutoStartHandled?: () => void;
}) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeLLMRequests, setActiveLLMRequests] = useState(0);
  const [activeComputeRequests, setActiveComputeRequests] = useState(0);
  const autoStartTriggeredRef = useRef(false);
  const intakeLogInjectedRef = useRef(false);
  const name = problem.name;

  useEffect(() => {
    const handleRequestCount = (problem: string, llm_count: number, compute_count: number) => {
      if (problem === name) {
        setActiveLLMRequests(llm_count);
        setActiveComputeRequests(compute_count);
      }
    };
    ProblemService.addListener(handleRequestCount);
    return () => {
      ProblemService.removeListener(handleRequestCount);
    };
  }, [name]);

  useEffect(() => {
    if (intakeLogInjectedRef.current || (problem.source !== 'image' && problem.source !== 'text')) {
      return;
    }

    intakeLogInjectedRef.current = true;
    const parseLog: Log = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      depth: 0,
      message: problem.source === 'image' ? '📸 Question image parsed and saved' : '📝 Text question saved and ready',
      status: 'done',
      sub_tasks: [
        {
          id: Date.now() + Math.floor(Math.random() * 1000) + 1,
          depth: 1,
          message: `Title: ${problem.title}`,
          status: 'done',
        },
        {
          id: Date.now() + Math.floor(Math.random() * 1000) + 2,
          depth: 1,
          message: `Source: ${problem.source}${problem.parser_model ? ` via ${problem.parser_model}` : ''}`,
          status: 'done',
        },
        ...(problem.confidence !== undefined
          ? [{
              id: Date.now() + Math.floor(Math.random() * 1000) + 3,
              depth: 1,
              message: `Parse confidence: ${Math.round(problem.confidence * 100)}%`,
              status: 'done' as const,
            }]
          : []),
      ],
    };
    setLogs((prev) => [parseLog, ...prev]);
  }, [problem]);

  const handleStart = async () => {
    try {
      await ProblemService.startProcess(name, model, (log) => {
        setLogs((prev) => {
          // Helper function to update nested logs
          const updateLogRecursively = (logs: Log[], newLog: Log): Log[] => {
            return logs.map((l) => {
              if (l.id === newLog.id) {
                return newLog;
              }
              if (l.sub_tasks?.length) {
                return {
                  ...l,
                  sub_tasks: updateLogRecursively(l.sub_tasks, newLog)
                };
              }
              return l;
            });
          };

          // Check if the log exists at any level
          const logExists = (logs: Log[], logId: number): boolean => {
            return logs.some((l) => 
              l.id === logId || 
              (l.sub_tasks?.length && logExists(l.sub_tasks, logId))
            );
          };

          if (logExists(prev, log.id)) {
            return updateLogRecursively(prev, log);
          }
          return [...prev, log];
        });
      });
    } catch (error) {
      console.error('Process failed:', error);
    }
  };

  useEffect(() => {
    if (!autoStart || autoStartTriggeredRef.current) {
      return;
    }
    autoStartTriggeredRef.current = true;
    handleStart();
    onAutoStartHandled?.();
  }, [autoStart, onAutoStartHandled]);

  return (
    <div className="flex-shrink-0 w-[400px] border border-gray-700 rounded-lg p-2 flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">{problem.title}</h2>
          <span className="text-xs text-gray-500 mt-0.5">{name}</span>
          <span className="text-xs text-gray-400 mt-0.5">Using {model}</span>
          <div className="mt-1">
            <RequestStats llmCount={activeLLMRequests} computeCount={activeComputeRequests} />
          </div>
        </div>
        <button
          onClick={() => handleStart()}
          className="py-1 px-3 rounded text-sm bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] hover:opacity-90 whitespace-nowrap"
        >
          Let's go!
        </button>
      </div>
      {(problem.image_url || problem.source !== 'disk') && (
        <div className="mb-4 rounded-lg border border-gray-800 p-2 space-y-2">
          {problem.image_url && (
            <img
              src={problem.image_url}
              alt={problem.title}
              className="w-full max-h-44 object-cover rounded border border-gray-800"
            />
          )}
          <div className="text-xs text-gray-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-wide text-gray-500">Intake</span>
              <span className="text-gray-400">{problem.source}</span>
            </div>
            <pre className="whitespace-pre-wrap max-h-24 overflow-y-auto">{problem.statement_preview}</pre>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Press "Let's go!" to get started
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={log.id} className={index < logs.length - 1 ? 'border-b border-gray-800 pb-1' : ''}>
                  <LogItem log={log} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
