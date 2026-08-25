const DONE_KEY = 'perspective-training.first-launch-done'

function detectFirstAppLaunch(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem(DONE_KEY) === '1') return false
    localStorage.setItem(DONE_KEY, '1')
    return true
  } catch {
    return false
  }
}

/** True only on the very first page load in this browser. Refresh and later visits are random. */
export const IS_FIRST_APP_LAUNCH = detectFirstAppLaunch()

export function initialOrientationSeed(): number | null {
  return IS_FIRST_APP_LAUNCH ? null : Math.random()
}
