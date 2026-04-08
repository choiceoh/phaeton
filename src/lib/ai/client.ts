export interface PromptConfig {
  name: string
  system: string
  temperature?: number
  maxTokens?: number
}

export interface RunPromptOptions {
  variables?: Record<string, string>
  userMessage: string
  history?: ChatMessage[]
  stream?: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  id: string
  choices: {
    message: { role: string, content: string }
    finish_reason: string
  }[]
  usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
}

const registry = new Map<string, PromptConfig>()

const VLLM_BASE_URL = process.env.VLLM_BASE_URL || 'http://localhost:8000'
const VLLM_MODEL = process.env.VLLM_MODEL || 'gemma4'

export function registerPrompt(config: PromptConfig): void {
  registry.set(config.name, config)
}

export function getPrompt(name: string): PromptConfig | undefined {
  return registry.get(name)
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
}

export async function runPrompt(
  promptName: string,
  options: RunPromptOptions,
): Promise<string> {
  const config = registry.get(promptName)
  if (!config) {
    throw new Error(`Prompt "${promptName}" is not registered`)
  }

  const systemContent = options.variables
    ? interpolate(config.system, options.variables)
    : config.system

  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...(options.history ?? []),
    { role: 'user', content: options.userMessage },
  ]

  const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1024,
      stream: false,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`vLLM error ${res.status}: ${body}`)
  }

  const data: ChatCompletionResponse = await res.json()
  return data.choices[0]?.message?.content ?? ''
}

export async function runPromptStream(
  promptName: string,
  options: RunPromptOptions,
): Promise<ReadableStream<Uint8Array>> {
  const config = registry.get(promptName)
  if (!config) {
    throw new Error(`Prompt "${promptName}" is not registered`)
  }

  const systemContent = options.variables
    ? interpolate(config.system, options.variables)
    : config.system

  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...(options.history ?? []),
    { role: 'user', content: options.userMessage },
  ]

  const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1024,
      stream: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`vLLM error ${res.status}: ${body}`)
  }

  return res.body!
}
