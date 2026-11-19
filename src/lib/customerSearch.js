const HANGUL_INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFC').toLowerCase().replace(/\s+/g, '')
}

export function hangulInitials(value) {
  return normalizeSearchText(value).split('').map(character => {
    const code = character.charCodeAt(0)
    if (code < 0xAC00 || code > 0xD7A3) return character
    return HANGUL_INITIALS[Math.floor((code - 0xAC00) / 588)] || character
  }).join('')
}

export function searchTextMatches(value, query) {
  const text = normalizeSearchText(value)
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true
  if (text.includes(normalizedQuery)) return true
  return /^[ㄱ-ㅎ]+$/.test(normalizedQuery) && hangulInitials(text).includes(normalizedQuery)
}

export function normalizeSearchPhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('0082')) digits = `0${digits.slice(4)}`
  else if (digits.startsWith('82')) digits = `0${digits.slice(2)}`
  return digits
}

export function searchPhoneMatches(value, query) {
  const normalizedQuery = normalizeSearchPhone(query)
  if (!normalizedQuery) return false
  const phone = normalizeSearchPhone(value)
  const rawPhone = String(value || '').replace(/\D/g, '')
  const rawQuery = String(query || '').replace(/\D/g, '')
  return phone.includes(normalizedQuery) || rawPhone.includes(rawQuery)
}
