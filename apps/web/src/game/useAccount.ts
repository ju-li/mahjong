import { computed, ref, shallowRef } from 'vue'
import type LogtoClient from '@logto/browser'
import { useI18n } from '../i18n/useI18n'

/**
 * Optional accounts through Logto's hosted sign-in page (email + password, Google, Apple). Guests
 * never load any of this: the Logto SDK is imported only when a saved session exists or the player
 * asks to sign in, so solo play and the offline app stay as light as before.
 */
const ENDPOINT: string | undefined = import.meta.env.VITE_LOGTO_ENDPOINT
const APP_ID: string | undefined = import.meta.env.VITE_LOGTO_APP_ID
/** API resource the game server accepts tokens for. */
const RESOURCE: string | undefined = import.meta.env.VITE_LOGTO_RESOURCE

/** Where Logto sends the player back after signing in; Caddy serves the app there. */
export const CALLBACK_PATH = '/callback'
/** The page to return to once the sign-in callback is handled. */
const RETURN_KEY = 'mahjong.signInReturn'

/** Accounts are configured for this build. */
export const accountsEnabled = Boolean(ENDPOINT && APP_ID && RESOURCE)

export type AccountUser = { userId: string; email: string | null; name: string | null }

const user = shallowRef<AccountUser | null>(null)
/** The saved session has been checked (or there was none to check). */
const ready = ref(!accountsEnabled)
let client: Promise<LogtoClient> | null = null

function logto(): Promise<LogtoClient> {
  client ??= import('@logto/browser').then(({ default: Client }) => new Client({ endpoint: ENDPOINT!, appId: APP_ID!, resources: [RESOURCE!], scopes: ['email', 'profile'] }))
  return client
}

/** A Logto session is saved in this browser, so it's worth loading the SDK. */
function hasSavedSession(): boolean {
  try {
    return localStorage.getItem(`logto:${APP_ID}:idToken`) !== null
  } catch {
    return false
  }
}

async function loadUser(c: LogtoClient): Promise<void> {
  if (!(await c.isAuthenticated())) {
    user.value = null
    return
  }
  const claims = await c.getIdTokenClaims()
  user.value = { userId: claims.sub, email: (claims.email as string | undefined) ?? null, name: (claims.name as string | undefined) ?? (claims.username as string | undefined) ?? null }
}

/**
 * Run once at start-up: finish a sign-in that just redirected back here, or pick up a saved session.
 * Returns true when the page was the sign-in callback (the caller then continues where the player was).
 */
async function init(): Promise<boolean> {
  if (!accountsEnabled) return false
  try {
    if (location.pathname === CALLBACK_PATH) {
      const c = await logto()
      await c.handleSignInCallback(location.href)
      await loadUser(c)
      let back = '/'
      try {
        back = sessionStorage.getItem(RETURN_KEY) ?? '/'
        sessionStorage.removeItem(RETURN_KEY)
      } catch {
        // No session storage: land on the home page.
      }
      history.replaceState(null, '', back)
      return true
    }
    if (hasSavedSession()) await loadUser(await logto())
  } catch (error) {
    console.warn('sign-in check failed', error)
    user.value = null
  } finally {
    ready.value = true
  }
  return false
}

/** Off to Logto's sign-in page; the player comes back to this same page afterwards. */
async function signIn(firstScreen: 'signIn' | 'register' = 'signIn'): Promise<void> {
  if (!accountsEnabled) return
  try {
    sessionStorage.setItem(RETURN_KEY, `${location.pathname}${location.search}${location.hash}`)
  } catch {
    // Without session storage the player lands on the home page instead.
  }
  try {
    const c = await logto()
    await c.signIn({ redirectUri: `${location.origin}${CALLBACK_PATH}`, firstScreen })
  } catch (error) {
    // Auth server down or unreachable: say so; playing carries on as a guest.
    console.warn('sign-in unavailable', error)
    window.alert(useI18n().t('account.unavailable'))
  }
}

async function signOut(): Promise<void> {
  if (!accountsEnabled) return
  const c = await logto()
  user.value = null
  await c.signOut(location.origin)
}

/** A fresh access token for the game server, or undefined for a guest. Never loads the SDK for guests. */
async function accessToken(): Promise<string | undefined> {
  if (!accountsEnabled || !user.value) return undefined
  try {
    return await (await logto()).getAccessToken(RESOURCE!)
  } catch (error) {
    console.warn('could not get an access token; playing as a guest', error)
    return undefined
  }
}

export function useAccount() {
  return {
    enabled: accountsEnabled,
    ready,
    user,
    signedIn: computed(() => user.value !== null),
    init,
    signIn,
    signOut,
    accessToken,
  }
}
