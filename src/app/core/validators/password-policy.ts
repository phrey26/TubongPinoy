export const PASSWORD_MIN_CHARACTERS = 15;
export const PASSWORD_MAX_BYTES = 72;

// Small offline blocklist, not a claim to screen every breached password.
export const COMMON_PASSWORD_ROOTS = [
  'password', 'passw0rd', 'pssword', 'qwerty', 'letmein', 'welcome',
  'iloveyou', 'admin', 'administrator', 'changeme', 'newpassword', 'testpassword',
  'trustno1', 'secret', 'login', 'monkey', 'dragon', 'football', 'sunshine',
];
export const PASSWORD_SEQUENCES = [
  '0123456789012345678901234567890123456789012345678901234567890123456789012',
  '9876543210987654321098765432109876543210987654321098765432109876543210987',
  'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcbazyxwvutsrqponmlkjihgfedcbazyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnmqwertyuiopasdfghjklzxcvbnmqwertyuiopasdfghjklzxcvbnm',
];

export interface PasswordAssessment {
  longEnough: boolean;
  fitsStorage: boolean;
  notCommon: boolean;
  notPersonal: boolean;
  accepted: boolean;
  requirementsMet: number;
}

export function assessPassword(value: string, username = ''): PasswordAssessment {
  const normalized = value.toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  const longEnough = Array.from(value.trim()).length >= PASSWORD_MIN_CHARACTERS;
  const fitsStorage = value.length > 0 && !value.includes('\0') && new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES;
  const commonRoot = COMMON_PASSWORD_ROOTS.some(root => compact === root ||
    (compact.startsWith(root) && /^[0-9]+$/.test(compact.slice(root.length))));
  const sequence = compact.length >= PASSWORD_MIN_CHARACTERS && PASSWORD_SEQUENCES.some(run => run.includes(compact));
  const repeatedPattern = /^(.{1,36})\1+(?![\s\S])/us;
  const repeated = repeatedPattern.test(value) || repeatedPattern.test(value.trim()) ||
    (compact.length >= PASSWORD_MIN_CHARACTERS && repeatedPattern.test(compact));
  const notCommon = value.trim().length > 0 && !commonRoot && !sequence && !repeated;
  const name = username.trim().toLowerCase();
  const notPersonal = value.length > 0 && (!name || !normalized.includes(name));
  const requirementsMet = [longEnough, fitsStorage, notCommon, notPersonal].filter(Boolean).length;
  return { longEnough, fitsStorage, notCommon, notPersonal, accepted: requirementsMet === 4, requirementsMet };
}
