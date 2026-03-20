import OpenAI from "openai";
import dotenv from "dotenv";
import Together from 'together-ai';
import * as prompts from './prompts';
import { parseJson } from './parse_utils';
import { Model } from '../types/models';

dotenv.config({ path: "./config.env" });

type Message = Together.Chat.Completions.CompletionCreateParams.Message | OpenAI.Chat.ChatCompletionMessageParam;

type BasicMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function normalizeMessages(messages: string | Message[]): BasicMessage[] {
  const formattedMessages = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  return formattedMessages.map((message) => ({
    role: message.role as BasicMessage['role'],
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
  }));
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getGeminiApiKey(): string {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || getRequiredEnv('GOOGLE_GENERATIVE_AI_API_KEY');
}

function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL_ID || 'gemini-2.0-flash-lite';
}

async function callTogether(messages: BasicMessage[], model: Model, isJson: boolean): Promise<string> {
  const client = new Together({ apiKey: getRequiredEnv('TOGETHER_API_KEY') });

  if (model === 'qwq-32b-preview') {
    const response = await client.chat.completions.create({
      model: 'Qwen/QwQ-32B-Preview',
      messages: messages as Together.Chat.Completions.CompletionCreateParams.Message[],
      max_tokens: 8192,
    });
    const answer = response.choices[0].message?.content || '';
    return llm(
      [
        ...messages,
        { role: 'assistant', content: answer },
        { role: 'user', content: prompts.final_answer_prompt() },
      ],
      'llama-3.3-70b',
      isJson,
    );
  }

  const response = await client.chat.completions.create({
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    messages: messages as Together.Chat.Completions.CompletionCreateParams.Message[],
    response_format: isJson ? { type: "json_object" } : undefined,
    max_tokens: 8192,
  });
  const content = response.choices[0].message?.content || '';
  return isJson ? JSON.stringify(parseJson(content)) : content;
}

async function callOpenAI(messages: BasicMessage[], model: Model, isJson: boolean): Promise<string> {
  const client = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
  const response = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    response_format: isJson ? { type: 'json_object' } : undefined,
  });
  return response.choices[0].message.content || '';
}

async function callAnthropic(messages: BasicMessage[], isJson: boolean): Promise<string> {
  const apiKey = getRequiredEnv('ANTHROPIC_API_KEY');
  const model = getRequiredEnv('CLAUDE_MODEL_ID');
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const anthropicMessages = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text: message.content }],
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: system || undefined,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = Array.isArray(data.content)
    ? data.content
        .filter((item: { type: string }) => item.type === 'text')
        .map((item: { text: string }) => item.text)
        .join('\n')
    : '';

  return isJson ? JSON.stringify(parseJson(content)) : content;
}

async function callGemini(messages: BasicMessage[], isJson: boolean): Promise<string> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModelId();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: messages
            .filter((message) => message.role === 'system')
            .map((message) => ({ text: message.content })),
        },
        contents: messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
        generationConfig: {
          responseMimeType: isJson ? 'application/json' : 'text/plain',
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  return isJson ? JSON.stringify(parseJson(content)) : content;
}

async function llm(messages: string | Message[], model: Model, isJson: boolean = false): Promise<string> {
  const normalizedMessages = normalizeMessages(messages);

  try {
    if (model === 'qwq-32b-preview' || model === 'llama-3.3-70b') {
      return callTogether(normalizedMessages, model, isJson);
    }
    if (model === 'claude') {
      return callAnthropic(normalizedMessages, isJson);
    }
    if (model === 'gemini3') {
      return callGemini(normalizedMessages, isJson);
    }
    return callOpenAI(normalizedMessages, model, isJson);
  } catch (error) {
    console.error("Error in LLM call:", error);
    throw error;
  }
}

export default llm;
