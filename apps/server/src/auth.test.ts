import { describe, expect, it } from 'vitest'
import { authConfigFromEnv, tokenVerifier } from './auth'
import { testIssuer } from './testAuth'

describe('tokenVerifier', async () => {
  const issuer = await testIssuer()
  const verify = tokenVerifier(issuer.config)

  it('accepts a Logto access token for our API', async () => {
    expect(await verify(await issuer.token('user-1'))).toBe('user-1')
  })

  it('treats anything else as a guest', async () => {
    expect(await verify(undefined)).toBeNull()
    expect(await verify('')).toBeNull()
    expect(await verify('not.a.jwt')).toBeNull()
    expect(await verify(await issuer.token('u', { audience: 'https://other.api' }))).toBeNull()
    expect(await verify(await issuer.token('u', { issuer: 'https://evil/oidc' }))).toBeNull()
    expect(await verify(await issuer.token('u', { expiresIn: '-1m' }))).toBeNull()
    const stranger = await testIssuer()
    expect(await verify(await stranger.token('u'))).toBeNull()
  })

  it('is off without configuration', async () => {
    expect(await tokenVerifier(null)(await issuer.token('u'))).toBeNull()
    expect(authConfigFromEnv({})).toBeNull()
    expect(authConfigFromEnv({ LOGTO_ENDPOINT: 'https://auth.x/', LOGTO_API_RESOURCE: 'https://api.x' })).toMatchObject({ issuer: 'https://auth.x/oidc', audience: 'https://api.x' })
  })
})
