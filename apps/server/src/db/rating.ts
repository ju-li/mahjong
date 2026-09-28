import { rate, rating } from 'openskill'

export type Skill = { mu: number; sigma: number }

/** Where every player starts: OpenSkill's defaults (mu 25, sigma 25/3). */
export function initialSkill(): Skill {
  const { mu, sigma } = rating()
  return { mu, sigma }
}

/**
 * New skills after one match. `places` are finishing places among the rated players (1 = best,
 * ties allowed). Uses OpenSkill's Plackett–Luce model, which handles any number of players.
 */
export function rateMatch(skills: readonly Skill[], places: readonly number[]): Skill[] {
  const teams = skills.map((s) => [rating({ mu: s.mu, sigma: s.sigma })])
  return rate(teams, { rank: [...places] }).map(([r]) => ({ mu: r!.mu, sigma: r!.sigma }))
}

/**
 * The number players see: a conservative estimate (mu − 3σ) scaled so a new player shows 1000
 * and it climbs as the game gets surer of them.
 */
export function displayRating(skill: Skill): number {
  return Math.round(1000 + 40 * (skill.mu - 3 * skill.sigma))
}
