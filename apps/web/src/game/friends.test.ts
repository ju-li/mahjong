import { describe, expect, it } from 'vitest'
import type { Friend } from '@mahjong/protocol'
import { friendsCount, groupFriends, parseFriendCode } from './friends'

const f = (name: string, state: Friend['state'], online = false): Friend => ({ userId: name.toLowerCase(), name, avatar: null, state, online })

describe('groupFriends', () => {
  it('orders requests, then online, then offline friends, then your pending asks, each by name', () => {
    const groups = groupFriends([f('zed', 'friend', true), f('Bo', 'friend'), f('amy', 'friend', true), f('Cy', 'incoming'), f('Al', 'friend'), f('Di', 'outgoing')])
    expect(groups.incoming.map((x) => x.name)).toEqual(['Cy'])
    expect(groups.online.map((x) => x.name)).toEqual(['amy', 'zed'])
    expect(groups.offline.map((x) => x.name)).toEqual(['Al', 'Bo'])
    expect(groups.outgoing.map((x) => x.name)).toEqual(['Di'])
  })
})

describe('friendsCount', () => {
  it('says "0 friends" until there are some, then how many are online', () => {
    expect(friendsCount([])).toEqual({ key: 'friends.count.none', n: 0 })
    expect(friendsCount([f('Cy', 'incoming')])).toEqual({ key: 'friends.count.none', n: 0 })
    expect(friendsCount([f('Bo', 'friend')])).toEqual({ key: 'friends.count.online', n: 0 })
    expect(friendsCount([f('Bo', 'friend', true), f('Al', 'friend', true), f('Cy', 'friend')])).toEqual({ key: 'friends.count.online', n: 2 })
  })
})

describe('parseFriendCode', () => {
  it('accepts invite codes only', () => {
    expect(parseFriendCode('abcdefgh23')).toBe('abcdefgh23')
    expect(parseFriendCode(' ABCDEFGH23 ')).toBe('abcdefgh23')
    expect(parseFriendCode(null)).toBeNull()
    expect(parseFriendCode('short')).toBeNull()
    expect(parseFriendCode('abcdefgh1l')).toBeNull()
  })
})
