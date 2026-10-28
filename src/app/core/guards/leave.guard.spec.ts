import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Confirmation } from '../services/confirmation';
import { leaveGuard } from './leave.guard';

@Component({ template: 'Active game' })
class ActiveGame {
  private readonly confirmation = inject(Confirmation);
  confirmLeave() {
    return this.confirmation.ask({ title: 'Leave game?', message: 'Progress will reset.', confirmLabel: 'Leave' });
  }
}
@Component({ template: 'Games lobby' })
class Lobby {}

describe('Leave guard', () => {
  it('keeps the active route after cancel and changes routes after confirmation', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([
      { path: 'play', component: ActiveGame, canDeactivate: [leaveGuard] },
      { path: 'games', component: Lobby },
    ])] });
    const harness = await RouterTestingHarness.create('/play');
    const confirmation = TestBed.inject(Confirmation);
    let navigation = harness.navigateByUrl('/games');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(confirmation.active()).not.toBeNull();
    confirmation.respond(false);
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/play');
    navigation = harness.navigateByUrl('/games');
    await new Promise(resolve => setTimeout(resolve, 0));
    confirmation.respond(true);
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/games');
  });
});
