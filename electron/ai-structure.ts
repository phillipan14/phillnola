/**
 * AI Note Structuring Module — Electron Main Process
 *
 * Takes a raw transcript + user notes and produces structured
 * meeting notes using either OpenAI GPT-4o or Anthropic Claude.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/* ── Types ────────────────────────────────────────────────────────────── */

export interface StructureNotesParams {
  transcript: string;
  userNotes: string;
  recipe: {
    system_prompt: string;
  };
  provider: "openai" | "anthropic";
  openaiKey?: string;
  anthropicKey?: string;
}

/* ── System Prompt Builder ───────────────────────────────────────────── */

function buildPrompt(
  recipeSystemPrompt: string,
  transcript: string,
  userNotes: string,
): string {
  return `You are a meeting note assistant. Given a transcript and the user's rough notes,
produce structured meeting notes in the following format:

${recipeSystemPrompt}

TRANSCRIPT:
${transcript}

USER'S NOTES:
${userNotes}

Produce the structured notes now. Use Markdown formatting.
Preserve any specific details, names, numbers, and quotes from the transcript.
Incorporate the user's notes — they highlight what the user found important.`;
}

/* ── OpenAI Provider ─────────────────────────────────────────────────── */

async function structureWithOpenAI(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  return response.choices[0]?.message?.content || "";
}

/* ── Anthropic Provider ──────────────────────────────────────────────── */

async function structureWithAnthropic(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // Extract text from content blocks
  const textBlocks = response.content.filter(
    (block) => block.type === "text",
  );
  return textBlocks.map((block) => {
    if (block.type === "text") return block.text;
    return "";
  }).join("\n");
}

/* ── Main Export ──────────────────────────────────────────────────────── */

/**
 * Structure meeting notes using AI.
 *
 * @param params - Transcript, user notes, recipe, and provider config
 * @returns Structured Markdown output
 */
export async function structureNotes(
  params: StructureNotesParams,
): Promise<string> {
  const { transcript, userNotes, recipe, provider, openaiKey, anthropicKey } =
    params;

  const prompt = buildPrompt(recipe.system_prompt, transcript, userNotes);

  if (provider === "openai") {
    if (!openaiKey) {
      throw new Error("OpenAI API key is required for GPT-4o structuring");
    }
    return structureWithOpenAI(prompt, openaiKey);
  } else if (provider === "anthropic") {
    if (!anthropicKey) {
      throw new Error("Anthropic API key is required for Claude structuring");
    }
    return structureWithAnthropic(prompt, anthropicKey);
  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}
