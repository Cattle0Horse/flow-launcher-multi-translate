import { describe, expect, it, vi } from 'vitest'
import '../src/index'

interface ResultItem {
  title: string
  subtitle: string
  jsonRPCAction?: { query: string }
}

type QueryHandler = (
  request: { prompt: string, settings: Record<string, string> },
  response: { add: (...items: ResultItem[]) => void },
) => Promise<void>

const harness = vi.hoisted(() => ({ query: undefined as QueryHandler | undefined }))

vi.mock('flow-plugin', () => ({
  Flow: class {
    static Actions = {
      custom: () => ({}),
      changeQuery: (query: string) => ({ query }),
    }

    on(event: string, handler: QueryHandler) {
      if (event === 'query')
        harness.query = handler
    }

    add() {
      throw new Error('Unexpected configuration warning')
    }
  },
}))

vi.mock('../src/axios', () => ({ createAxiosInstance: () => ({}) }))
vi.mock('../src/logger', () => ({ logger: { info: () => {} } }))
vi.mock('../src/service', () => ({
  serviceNamesMap: { google: { en: 'Google', tr: 'Google', zh: '谷歌' } },
  services: {
    google: {
      languagesMap: { auto: 'auto', zh: 'zh-CN', en: 'en', fr: 'fr' },
      // Echo the provider-facing request as the result, exposing wrong directions or stripped text.
      translate: async (text: string, from: string, to: string) => `${from}>${to}: ${text}`,
    },
  },
}))

async function query(prompt: string, settings: Record<string, string> = {}) {
  const items: ResultItem[] = []
  await harness.query!({
    prompt,
    settings: {
      services: 'google',
      serviceConfigs: '',
      translateDelay: '0',
      interfaceLanguage: '简体中文',
      translationMode: 'Chinese ↔ English',
      ...settings,
    },
  }, { add: (...results) => items.push(...results) })
  return items
}

describe('automatic translation query flow', () => {
  it.each([
    ['你好', 'zh-CN>en: 你好'],
    ['hello', 'en>zh-CN: hello'],
    ['This is an English sentence with the Chinese word 中文.', 'en>zh-CN: This is an English sentence with the Chinese word 中文.'],
    ['zh>fr 你好', 'zh-CN>fr: 你好'],
  ])('sends the selected direction to the service for %s', async (prompt, result) => {
    expect((await query(prompt))[0].title).toBe(result)
  })

  it('shows automatic mode without relying on unused configured language codes', async () => {
    const items = await query('', { sourceLanguageCode: 'invalid', targetLanguageCode: 'invalid' })
    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('↔')
  })

  it('translates using the resolved direction even if inactive language settings are invalid', async () => {
    const items = await query('你好', { sourceLanguageCode: 'invalid', targetLanguageCode: 'invalid' })
    expect(items[0].title).toBe('zh-CN>en: 你好')
  })

  it('keeps language-pair selections working as explicit direction overrides', async () => {
    const items = await query('', { languagePairs: 'zh>fr', triggerKeyword: 'tr' })
    const selectedQuery = items[1].jsonRPCAction!.query.replace(/^tr /, '')
    expect((await query(`${selectedQuery}你好`))[0].title).toBe('zh-CN>fr: 你好')
  })
})
