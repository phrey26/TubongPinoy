import { canRememberSession } from './session-storage-policy';

describe('session storage on shared game hosts', () => {
  it.each(['html-classic.itch.zone', 'html.itch.zone'])('disables durable Remember Me tokens on %s', host => {
    expect(canRememberSession(host)).toBe(false);
  });
  it.each(['localhost', '127.0.0.1', 'play.bigchico.example'])('allows persistence on an independent app host %s', host => {
    expect(canRememberSession(host)).toBe(true);
  });
});
