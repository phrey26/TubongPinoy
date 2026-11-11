/** itch.io serves unrelated uploads from the same browser origin. */
export function canPersistSession(hostname = window.location.hostname): boolean {
  return hostname !== 'html-classic.itch.zone' && hostname !== 'html.itch.zone';
}
