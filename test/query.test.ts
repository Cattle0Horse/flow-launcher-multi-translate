import { describe, expect, it } from 'vitest'
import { parsePrompt } from '../src/query'
import { parseSettings } from '../src/settings'

describe('chinese-english translation', () => {
  it.each([
    ['你好世界', 'zh', 'en'],
    ['繁體中文測試', 'zh', 'en'],
    ['hello world', 'en', 'zh'],
    ['请解释这个 API', 'zh', 'en'],
    ['This is an English sentence with the Chinese word 中文.', 'en', 'zh'],
    ['𠮷', 'zh', 'en'],
    ['123 !?', 'en', 'zh'],
    ['supercalifragilisticexpialidocious word', 'en', 'zh'],
  ] as const)('selects the direction for %s', (text, source, target) => {
    expect(parsePrompt(text, 'auto', 'fr', true)).toEqual({
      sourceLanguageCode: source,
      targetLanguageCode: target,
      text,
    })
  })

  it.each([
    ['zh>fr 你好', 'zh', 'fr', '你好'],
    ['>en hello', 'auto', 'en', 'hello'],
    ['fr 你好', 'auto', 'fr', '你好'],
    ['en> hello', 'en', 'de', 'hello'],
    ['en>zh', 'en', 'zh', ''],
  ] as const)('honors an explicit language prefix in %s', (prompt, source, target, text) => {
    expect(parsePrompt(prompt, 'auto', 'de', true)).toEqual({
      sourceLanguageCode: source,
      targetLanguageCode: target,
      text,
    })
  })

  it('preserves the configured direction when the mode is disabled', () => {
    expect(parsePrompt('你好', 'auto', 'fr')).toEqual({
      sourceLanguageCode: 'auto',
      targetLanguageCode: 'fr',
      text: '你好',
    })
  })

  it('does not consume an invalid prefix as a language instruction', () => {
    expect(parsePrompt('xx>yy 你好', 'auto', 'fr', true)).toEqual({
      sourceLanguageCode: 'zh',
      targetLanguageCode: 'en',
      text: 'xx>yy 你好',
    })
  })

  it('leaves empty input untranslated', () => {
    expect(parsePrompt('  ', 'auto', 'fr', true)).toEqual({
      sourceLanguageCode: 'auto',
      targetLanguageCode: 'fr',
      text: '  ',
    })
  })
})

describe('translation mode settings', () => {
  const rawSettings = { services: 'google', serviceConfigs: '' }

  it('keeps existing installations using their configured direction', () => {
    const settings = parseSettings(rawSettings)
    expect(parsePrompt('你好', settings.sourceLanguageCode, settings.targetLanguageCode, settings.translationMode === 'zh-en'))
      .toMatchObject({ sourceLanguageCode: 'auto', targetLanguageCode: 'zh' })
  })

  it('enables automatic translation from the saved mode selection', () => {
    const settings = parseSettings({ ...rawSettings, translationMode: 'Chinese ↔ English' })
    expect(parsePrompt('你好', settings.sourceLanguageCode, settings.targetLanguageCode, settings.translationMode === 'zh-en'))
      .toMatchObject({ sourceLanguageCode: 'zh', targetLanguageCode: 'en' })
  })
})
