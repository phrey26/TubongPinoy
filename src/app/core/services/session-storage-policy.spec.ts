import { canPersistSession } from './session-storage-policy';

describe('session storage on shared game hosts', () => {
  it.each(['html-classic.itch.zone', 'html.itch.zone'])('keeps tokens in memory on %s', host => {
    expect(canPersistSession(host)).toBe(false);
  });
  it.each(['localhost', '127.0.0.1', 'play.bigchico.example'])('allows persistence on an independent app host %s', host => {
    expect(canPersistSession(host)).toBe(true);
  });
});
