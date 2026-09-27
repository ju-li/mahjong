import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { AuthConfig } from './auth'

export const TEST_ISSUER = 'https://auth.test/oidc'
export const TEST_AUDIENCE = 'https://api.test'

/** A stand-in for Logto in tests: its keys, and a way to mint access tokens. */
export async function testIssuer() {
  const { publicKey, privateKey } = await generateKeyPair('ES384')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES384' }
  const config: AuthConfig = { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, keys: createLocalJWKSet({ keys: [jwk] }) }
  async function token(sub: string, opts: { issuer?: string; audience?: string; expiresIn?: string } = {}) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES384', kid: 'test' })
      .setSubject(sub)
      .setIssuer(opts.issuer ?? TEST_ISSUER)
      .setAudience(opts.audience ?? TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '1h')
      .sign(privateKey)
  }
  return { config, token }
}
