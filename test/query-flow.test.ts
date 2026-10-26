import clipboard from 'clipboardy'
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
vi.mock('clipboardy', () => ({ default: { read: vi.fn(), writeSync: vi.fn() } }))
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
    ['is this ok', 'en>zh-CN: is this ok'],
    ['hi', 'en>zh-CN: hi'],
    ['This is an English sentence with the Chinese word 中文.', 'en>zh-CN: This is an English sentence with the Chinese word 中文.'],
    ['zh>fr 你好', 'zh-CN>fr: 你好'],
  ])('sends the selected direction to the service for %s', async (prompt, result) => {
    expect((await query(prompt))[0].title).toBe(result)
  })

  it('shows automatic mode without relying on unused configured language codes', async () => {
    const items = await query('', { sourceLanguageCode: 'invalid', targetLanguageCode: 'invalid' })
    expect(items).toHaveLength(2)
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

  it('translates the complete clipboard through the empty-query entry', async () => {
    vi.mocked(clipboard.read).mockResolvedValue('en\r\nhello\r\n\r\nworld')
    const items = await query('')
    const command = items.at(-1)!.jsonRPCAction!.query.replace(/^tr /, '')
    expect((await query(command))[0].title).toBe('en>zh-CN: en\r\nhello\r\n\r\nworld')
  })

  it('automatically reads the clipboard only for empty queries when enabled', async () => {
    vi.mocked(clipboard.read).mockResolvedValue('你好\n世界')
    expect((await query('', { autoTranslateClipboard: 'True' }))[0].title).toBe('zh-CN>en: 你好\n世界')
    expect((await query('hello', { autoTranslateClipboard: 'true' }))[0].title).toBe('en>zh-CN: hello')
  })

  it('honors explicit direction without treating clipboard text as a command', async () => {
    vi.mocked(clipboard.read).mockResolvedValue('en hello\nworld')
    expect((await query('zh>fr /clipboard'))[0].title).toBe('zh-CN>fr: en hello\nworld')
  })

  it('reports empty and unreadable clipboards', async () => {
    vi.mocked(clipboard.read).mockResolvedValue(' \r\n')
    expect((await query('/clipboard'))[0].title).toBe('剪贴板中没有文本')
    vi.mocked(clipboard.read).mockRejectedValue(new Error('unavailable'))
    expect((await query('/clipboard'))[0].title).toBe('无法读取剪贴板')
  })
})
