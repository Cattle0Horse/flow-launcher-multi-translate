import type { LanguageCode } from './service/language'
import { detect } from 'tinyld'
import { languageCodesArr } from './service/language'

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

  const targetOnly = prefix.match(/^>?([a-z_]+)$/)
  if (targetOnly) {
    const target = targetOnly[1] as LanguageCode
    if (languageCodesArr.includes(target)) {
      return { sourceLanguageCode: oldSourceLanguageCode, targetLanguageCode: target, text: rest }
    }
  }

  if (chineseEnglishTranslation && prompt.trim().length > 0) {
    // Restrict detection to this mode's languages so short English words are not
    // mistaken for unrelated languages. Fall back for inconclusive short text.
    const detected = detect(prompt, { only: ['zh', 'en'] })
    const source = detected === 'zh' || detected === 'en'
      ? detected
      : /\p{Script=Han}/u.test(prompt) ? 'zh' : 'en'
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
