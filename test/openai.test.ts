import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { languagesMap, translate } from '../src/service/openai'
import { parseSettings } from '../src/settings'

interface TranslationRequest {
  messages: { role: string, content: string }[]
}

async function requestTranslation(overrides: Record<string, string> = {}, text = 'hello') {
  const requests: TranslationRequest[] = []
  const client = axios.create({
    adapter: async (config) => {
      requests.push(JSON.parse(config.data))
      return {
        data: { choices: [{ message: { content: '  你好  ' } }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    },
  })
  const settings = parseSettings({
    services: 'openai',
    serviceConfigs: 'OPENAI_API_KEY=test-key\nOPENAI_MODEL=test-model',
    ...overrides,
  })
  const result = await translate(text, languagesMap.en!, languagesMap.zh!, client, settings)
  return { messages: requests[0]?.messages ?? [], result }
}

describe('openai prompt configuration', () => {
  it('preserves the existing messages when prompts are not configured', async () => {
    const { messages, result } = await requestTranslation()
    expect(messages).toEqual([
      {
        role: 'system',
        content: 'You are a professional translation assistant. Translate the given text accurately and naturally. Only return the translated text without any explanations or additional content.',
      },
      { role: 'user', content: 'Translate the following text from English to Chinese Simplified:\n\nhello' },
    ])
    expect(result).toBe('你好')
  })

  it('renders both custom prompts and preserves multiline formatting', async () => {
    const { messages } = await requestTranslation({
      openaiSystemPrompt: '  Translate {from} → {to}.\r\nKeep Markdown.  ',
      openaiUserPrompt: 'Source: {from}\nTarget: {to}\n\n{text}\n\nAgain: {to}',
    }, '# Hello\n\n**world**')
    expect(messages).toEqual([
      { role: 'system', content: '  Translate English → Chinese Simplified.\r\nKeep Markdown.  ' },
      { role: 'user', content: 'Source: English\nTarget: Chinese Simplified\n\n# Hello\n\n**world**\n\nAgain: Chinese Simplified' },
    ])
  })

  it('allows changing only the system prompt', async () => {
    const { messages } = await requestTranslation({ openaiSystemPrompt: 'Use concise wording.' })
    expect(messages).toEqual([
      { role: 'system', content: 'Use concise wording.' },
      { role: 'user', content: 'Translate the following text from English to Chinese Simplified:\n\nhello' },
    ])
  })

  it('allows changing only the user prompt', async () => {
    const defaults = await requestTranslation()
    const { messages } = await requestTranslation({ openaiUserPrompt: '{to}: {text}' })
    expect(messages).toEqual([
      defaults.messages[0],
      { role: 'user', content: 'Chinese Simplified: hello' },
    ])
  })

  it.each(['', ' \t\r\n '])('restores defaults for blank prompts %j', async (blank) => {
    const defaults = await requestTranslation()
    const { messages } = await requestTranslation({ openaiSystemPrompt: blank, openaiUserPrompt: blank })
    expect(messages).toEqual(defaults.messages)
  })

  it('reports a missing text placeholder without sending a translation request', async () => {
    const { messages, result } = await requestTranslation({
      openaiSystemPrompt: 'Source text: {text}',
      openaiUserPrompt: 'Translate {from} to {to}.',
    }, 'hello\n{text}')
    expect(result).toContain('must include {text}')
    expect(messages).toEqual([])
  })

  it('inserts source text literally without reinterpreting placeholders or replacement tokens', async () => {
    const text = 'Literal {from}, {to}, {text}, $&, $$, $1'
    const { messages } = await requestTranslation({
      openaiSystemPrompt: 'Translate {from} to {to}: {text}',
      openaiUserPrompt: '{text}\n{text}\n{unknown}',
    }, text)
    expect(messages).toEqual([
      { role: 'system', content: `Translate English to Chinese Simplified: ${text}` },
      { role: 'user', content: `${text}\n${text}\n{unknown}` },
    ])
  })

  it('uses custom language names in both prompts', async () => {
    const { messages } = await requestTranslation({
      openaiLanguagesMap: '{"en":"英语","zh":"简体中文"}',
      openaiSystemPrompt: '从{from}译成{to}。',
      openaiUserPrompt: '{from} → {to}: {text}',
    })
    expect(messages).toEqual([
      { role: 'system', content: '从英语译成简体中文。' },
      { role: 'user', content: '英语 → 简体中文: hello' },
    ])
  })

  it('keeps built-in names for languages omitted from custom mappings', async () => {
    const custom = await requestTranslation({ openaiLanguagesMap: '{"zh":"中文"}' })
    expect(custom.messages[1].content).toBe('Translate the following text from English to 中文:\n\nhello')
    const defaults = await requestTranslation()
    expect(defaults.messages[1].content).toBe('Translate the following text from English to Chinese Simplified:\n\nhello')
  })

  it.each(['{', 'null', '[]', '{"zh":123}', '{"zh":"  "}', '{"unknown":"语言"}'])(
    'reports invalid language mappings %s without sending a request',
    async (mapping) => {
      const { messages, result } = await requestTranslation({ openaiLanguagesMap: mapping })
      expect(result).toContain('OpenAI Languages Map')
      expect(messages).toEqual([])
    },
  )
})
