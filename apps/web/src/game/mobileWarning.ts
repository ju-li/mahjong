const STORAGE_KEY = 'mahjong.mobileWarningSeen.v1'

/** Phones and small tablets: a touch screen without room for the full table. */
function isMobile(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (max-width: 1024px)').matches
}

/** The "not optimized for mobile" notice shows once per browser, on mobile only. */
export function needsMobileWarning(): boolean {
  if (!isMobile()) return false
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}

export function markMobileWarningSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // Not persisted; the notice may show again next visit.
  }
}
