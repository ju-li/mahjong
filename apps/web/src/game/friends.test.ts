import { describe, expect, it } from 'vitest'
import type { Friend } from '@mahjong/protocol'
import { canInviteToTable, friendsCount, groupFriends, parseFriendCode, seatChanges, tableStatus } from './friends'

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

describe('tables', () => {
  const at = (code: string, openSeats: number): Friend => ({ ...f('Bo', 'friend', true), table: { code, openSeats, playing: true } })

  it('says where a friend is playing and whether you can join them', () => {
    expect(tableStatus(f('Bo', 'friend', true), null)).toEqual({ kind: 'none' })
    expect(tableStatus(at('ABCD', 2), 'ABCD')).toEqual({ kind: 'mine' })
    expect(tableStatus(at('ABCD', 2), 'WXYZ')).toEqual({ kind: 'other', code: 'ABCD', openSeats: 2, canJoin: true })
    expect(tableStatus(at('ABCD', 0), null)).toEqual({ kind: 'other', code: 'ABCD', openSeats: 0, canJoin: false })
  })

  it('offers an invite to online friends who are not already at your table', () => {
    expect(canInviteToTable(f('Bo', 'friend', true), 'ABCD')).toBe(true)
    expect(canInviteToTable(at('WXYZ', 1), 'ABCD')).toBe(true)
    expect(canInviteToTable(at('ABCD', 1), 'ABCD')).toBe(false)
    expect(canInviteToTable(f('Bo', 'friend', false), 'ABCD')).toBe(false)
    expect(canInviteToTable(f('Bo', 'outgoing', true), 'ABCD')).toBe(false)
    expect(canInviteToTable(f('Bo', 'friend', true), null)).toBe(false)
  })

  it('finds who sat down and who left', () => {
    expect(seatChanges(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ joined: ['c'], left: ['a'] })
  })
})
