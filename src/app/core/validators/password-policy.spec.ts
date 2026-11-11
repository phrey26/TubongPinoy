import { assessPassword } from './password-policy';

describe('new-password strength policy', () => {
  it.each(['', 'short', 'password123', 'Password123456789!', 'Qwerty1234567890!',
    '123456789012345', 'Abcdefghijklmnop', 'a'.repeat(20), 'abc'.repeat(7),
    'little little little', 'password             ', 'a'.repeat(20) + '\n',
    '\u00a0'.repeat(20)])('rejects weak input %#', value => {
    expect(assessPassword(value).accepted).toBe(false);
  });

  it('accepts long passphrases without requiring particular character classes', () => {
    expect(assessPassword('mga bituin sa tahimik na gabi').accepted).toBe(true);
    expect(assessPassword('Mga tala sa gabi! 4829').accepted).toBe(true);
  });

  it('rejects a username inside a new password regardless of case', () => {
    expect(assessPassword('Mga tala sa JUAN20 na gabi!', 'juan20').notPersonal).toBe(false);
    expect(assessPassword('Mga tala sa gabi! 4829', 'juan20').accepted).toBe(true);
  });

  it('does not count surrounding whitespace toward the minimum length', () => {
    expect(assessPassword('      tala      ').longEnough).toBe(false);
  });

  it('counts Unicode characters independently of the bcrypt byte limit', () => {
    expect(assessPassword('🔐'.repeat(14)).longEnough).toBe(false);
    expect(assessPassword('🔐'.repeat(15)).longEnough).toBe(true);
    const prefix = 'Café sa tahimik na gabi • 4829! 🌺';
    const password = prefix + 'AbcDefGhJkLmNpQrStUvWxYz0123456789'.slice(0, 72 - new TextEncoder().encode(prefix).length);
    expect(new TextEncoder().encode(password).length).toBe(72);
    expect(assessPassword(password).accepted).toBe(true);
    expect(assessPassword(password + 'é').fitsStorage).toBe(false);
  });

  it('rejects null characters and reports no progress for an empty password', () => {
    expect(assessPassword('Mga tala sa gabi!\0 4829').accepted).toBe(false);
    expect(assessPassword('').requirementsMet).toBe(0);
  });
});
