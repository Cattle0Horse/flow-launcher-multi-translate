import type { LanguageCode } from './service/language'
import { detect } from 'tinyld'
import { languageCodesArr } from './service/language'

function detectChineseEnglish(text: string): 'zh' | 'en' {
  // Restrict detection so short English words are not mistaken for other languages.
  const detected = detect(text, { only: ['zh', 'en'] })
  if (detected === 'zh' || detected === 'en')
    return detected

  // Fall back for inconclusive short text.
  return /\p{Script=Han}/u.test(text) ? 'zh' : 'en'
}

export function parsePrompt(
  prompt: string,
  oldSourceLanguageCode: LanguageCode,
  oldTargetLanguageCode: LanguageCode,
  chineseEnglishTranslation = false,
): {
    sourceLanguageCode: LanguageCode
    targetLanguageCode: LanguageCode
    text: string
  } {
  const spaceIndex = prompt.indexOf(' ')
  const prefix = spaceIndex === -1 ? prompt : prompt.substring(0, spaceIndex)
  const rest = spaceIndex === -1 ? '' : prompt.substring(spaceIndex + 1).trim()

  // Explicit prefixes always use the configured defaults for any omitted language.
  const pair = prefix.match(/^([a-z_]+)>([a-z_]+)$/)
  if (pair) {
    const source = pair[1] as LanguageCode
    const target = pair[2] as LanguageCode
    if (languageCodesArr.includes(source) && languageCodesArr.includes(target)) {
      return { sourceLanguageCode: source, targetLanguageCode: target, text: rest }
    }
  }

  const sourceOnly = prefix.match(/^([a-z_]+)>$/)
  if (sourceOnly) {
    const source = sourceOnly[1] as LanguageCode
    if (languageCodesArr.includes(source)) {
      return { sourceLanguageCode: source, targetLanguageCode: oldTargetLanguageCode, text: rest }
    }
  }

  // In automatic mode, words such as "is", "it", and "hi" must stay in the text.
  const targetOnly = chineseEnglishTranslation
    ? prefix.match(/^>([a-z_]+)$/)
    : prefix.match(/^>?([a-z_]+)$/)
  if (targetOnly) {
    const target = targetOnly[1] as LanguageCode
    if (languageCodesArr.includes(target)) {
      return { sourceLanguageCode: oldSourceLanguageCode, targetLanguageCode: target, text: rest }
    }
  }

  if (chineseEnglishTranslation && prompt.trim().length > 0) {
    const source = detectChineseEnglish(prompt)
    return {
      sourceLanguageCode: source,
      targetLanguageCode: source === 'zh' ? 'en' : 'zh',
      text: prompt,
    }
  }

  return {
    sourceLanguageCode: oldSourceLanguageCode,
    targetLanguageCode: oldTargetLanguageCode,
    text: prompt,
  }
}
