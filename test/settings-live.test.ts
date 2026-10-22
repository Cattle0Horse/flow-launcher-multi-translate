import type { Settings } from '../src/settings'
import { describe, expect, it, vi } from 'vitest'
import '../src/index'

interface ResultItem {
  title: string
}

type QueryHandler = (
  request: { prompt: string, settings: Record<string, string> },
  response: { add: (...items: ResultItem[]) => void },
) => Promise<void>

const harness = vi.hoisted(() => ({ query: undefined as QueryHandler | undefined }))

vi.mock('flow-plugin', () => ({
  Flow: class {
    static Actions = { custom: () => ({}) }

    on(event: string, handler: QueryHandler) {
      if (event === 'query')
        harness.query = handler
    }
  },
}))

vi.mock('../src/logger', () => ({ logger: { info: () => {}, warn: () => {} } }))
vi.mock('../src/axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/axios')>()
  return {
    createAxiosInstance(settings: Settings) {
      const client = actual.createAxiosInstance(settings)
      // Observe real request construction without connecting to a translation service.
      client.defaults.adapter = async (config) => {
        const body = JSON.parse(config.data)
        const content = JSON.stringify({
          url: config.url,
          model: body.model,
          messages: body.messages,
          authorization: config.headers.get('Authorization') ?? null,
          timeout: config.timeout,
          proxy: config.proxy ?? null,
        })
        return {
          data: { choices: [{ message: { content } }] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      return client
    },
  }
})

async function query(settings: Record<string, string> = {}) {
  const items: ResultItem[] = []
  await harness.query!({
    prompt: 'hello',
    settings: {
      services: 'openai',
      serviceConfigs: 'OPENAI_MODEL=first-model\nOPENAI_BASE_URL=http://first.invalid\nOPENAI_API_KEY=first-key',
      sourceLanguageCode: 'en',
      targetLanguageCode: 'zh',
      translateDelay: '0',
      requestTimeout: '1500',
      ...settings,
    },
  }, { add: (...results) => items.push(...results) })
  return items[0].title
}

describe('live settings across consecutive queries', () => {
  it('uses updated OpenAI settings for the same query without restarting', async () => {
    const first = JSON.parse(await query())
    expect(first).toMatchObject({
      url: 'http://first.invalid/v1/chat/completions',
      model: 'first-model',
      authorization: 'Bearer first-key',
    })
    expect(first.messages[1].content).toBe('Translate the following text from English to Chinese Simplified:\n\nhello')

    const second = JSON.parse(await query({
      serviceConfigs: 'OPENAI_MODEL=second-model\nOPENAI_BASE_URL=http://second.invalid',
      sourceLanguageCode: 'zh',
      targetLanguageCode: 'en',
      openaiLanguagesMap: '{"zh":"中文","en":"英语"}',
      openaiSystemPrompt: '从{from}译为{to}。',
      openaiUserPrompt: '译文：{text}',
    }))
    expect(second).toMatchObject({
      url: 'http://second.invalid/v1/chat/completions',
      model: 'second-model',
      authorization: null,
      messages: [
        { role: 'system', content: '从中文译为英语。' },
        { role: 'user', content: '译文：hello' },
      ],
    })
  })

  it('rebuilds the HTTP client when proxy or timeout settings change', async () => {
    const first = JSON.parse(await query())
    expect(first).toMatchObject({ timeout: 1500, proxy: null })
    const second = JSON.parse(await query({ proxyUrl: 'http://127.0.0.1:8123', requestTimeout: '9500' }))
    expect(second).toMatchObject({
      timeout: 9500,
      proxy: { protocol: 'http', host: '127.0.0.1', port: 8123 },
    })
  })

  it('recovers on the next query after an invalid mapping is corrected', async () => {
    expect(await query({ openaiLanguagesMap: '{' })).toContain('OpenAI Languages Map')
    const corrected = JSON.parse(await query({ openaiLanguagesMap: '{"zh":"中文"}' }))
    expect(corrected.messages[1].content).toBe('Translate the following text from English to 中文:\n\nhello')
  })
})
