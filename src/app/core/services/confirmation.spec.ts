import { TestBed } from '@angular/core/testing';
import { Confirmation } from './confirmation';

const request = { title: 'Are you sure?', message: 'Leave this game?', confirmLabel: 'Leave' };

describe('Confirmation', () => {
  it('waits for a response and prevents a second action from replacing the first', () => {
    const service = TestBed.inject(Confirmation);
    let first: boolean | undefined;
    let second: boolean | undefined;
    service.ask(request).subscribe(value => first = value);
    service.ask({ ...request, title: 'Buy item?' }).subscribe(value => second = value);
    expect(first).toBeUndefined();
    expect(second).toBe(false);
    expect(service.active()?.title).toBe('Are you sure?');
    service.respond(false);
    expect(first).toBe(false);
    expect(service.active()).toBeNull();
    service.ask(request).subscribe(value => first = value);
    service.respond(true);
    expect(first).toBe(true);
  });

  it('dismisses an abandoned navigation confirmation', () => {
    const service = TestBed.inject(Confirmation);
    const subscription = service.ask(request).subscribe();
    subscription.unsubscribe();
    expect(service.active()).toBeNull();
  });
});
