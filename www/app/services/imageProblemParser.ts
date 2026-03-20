import { randomUUID } from 'crypto';
import { parseJson } from './parse_utils';
import { Model } from '../types/models';

type ParsedProblem = {
  title: string;
  statement: string;
  sample_input: string;
  sample_output: string;
  confidence: number;
};

const IMAGE_PARSE_INSTRUCTIONS = `Extract a competitive programming problem from this image.
Return strict JSON with these keys only:
{
  "title": "short problem title",
  "statement": "full statement text",
  "sample_input": "sample input exactly as shown",
  "sample_output": "sample output exactly as shown",
  "confidence": 0.0
}

Rules:
- Preserve line breaks in statement, sample_input, and sample_output.
- If the title is missing, infer a short one.
- If some text is unclear, make the best effort and lower confidence.
- Do not wrap the JSON in markdown fences.`;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeParsedProblem(data: Record<string, unknown>): ParsedProblem {
  return {
    title: String(data.title || 'Uploaded Problem').trim(),
    statement: String(data.statement || '').trim(),
    sample_input: String(data.sample_input || '').trim(),
    sample_output: String(data.sample_output || '').trim(),
    confidence: Math.max(0, Math.min(1, Number(data.confidence || 0))),
  };
}

function sanitizeProblemSlug(value: string): string {
  const fallback = `uploaded-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug ? `uploaded-${slug}-${randomUUID().slice(0, 6)}` : fallback;
}

function resolveVisionModel(model: Model): Model {
  if (model === 'claude' || model === 'gemini3' || model === 'gpt-4o' || model === 'gpt-4o-mini') {
    return model;
  }
  return 'gpt-4o-mini';
}

async function parseWithOpenAI(model: 'gpt-4o' | 'gpt-4o-mini', mimeType: string, base64Image: string): Promise<ParsedProblem> {
  const apiKey = getRequiredEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: IMAGE_PARSE_INSTRUCTIONS },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image parse failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return normalizeParsedProblem(parseJson(content));
}

async function parseWithAnthropic(mimeType: string, base64Image: string): Promise<ParsedProblem> {
  const apiKey = getRequiredEnv('ANTHROPIC_API_KEY');
  const model = getRequiredEnv('CLAUDE_MODEL_ID');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: IMAGE_PARSE_INSTRUCTIONS },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic image parse failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.content?.find((item: { type: string }) => item.type === 'text')?.text || '{}';
  return normalizeParsedProblem(parseJson(content));
}

async function parseWithGemini(mimeType: string, base64Image: string): Promise<ParsedProblem> {
  const apiKey = getRequiredEnv('GOOGLE_GENERATIVE_AI_API_KEY');
  const model = getRequiredEnv('GEMINI_MODEL_ID');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: IMAGE_PARSE_INSTRUCTIONS },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini image parse failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '{}';
  return normalizeParsedProblem(parseJson(content));
}

export async function parseProblemFromImage(file: File, model: Model): Promise<ParsedProblem & { problemSlug: string; parserModel: Model }> {
  const mimeType = file.type || 'image/png';
  const arrayBuffer = await file.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString('base64');
  const parserModel = resolveVisionModel(model);

  const parsed = parserModel === 'claude'
    ? await parseWithAnthropic(mimeType, base64Image)
    : parserModel === 'gemini3'
      ? await parseWithGemini(mimeType, base64Image)
      : await parseWithOpenAI(parserModel, mimeType, base64Image);

  if (!parsed.statement || !parsed.sample_input || !parsed.sample_output) {
    throw new Error('Parsed problem is missing required fields');
  }

  return {
    ...parsed,
    problemSlug: sanitizeProblemSlug(parsed.title),
    parserModel,
  };
}
