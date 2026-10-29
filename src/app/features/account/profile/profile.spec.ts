import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { Profile } from './profile';
import { User } from '../../../core/services/user';
import { AccountState } from '../../../core/services/account-state';
import { Confirmation } from '../../../core/services/confirmation';
import { AuthUser } from '../../../core/services/auth';

describe('Edit profile', () => {
  const player: AuthUser = { id: 1, username: 'Juan', email: 'j@example.com', tansans: 0, juice: 100, displayName: 'Juan Plays', avatarId: 'sunny' };
  function setup() {
    const service = { saveProfile: vi.fn(() => of({ user: player })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: User, useValue: service }] });
    TestBed.inject(AccountState).set(player);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service };
  }

  it('previews a selected avatar and saves name/icon together only on Save', () => {
    const { fixture, component, service } = setup();
    expect(component.hasChanges).toBe(false);
    const avatar = fixture.nativeElement.querySelector('input[aria-label^="Maya:"]') as HTMLInputElement;
    avatar.click();
    component.form.controls.displayName.setValue('Maria José');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.profile-portrait').getAttribute('src')).toBe('assets/avatars/maya.png');
    expect(service.saveProfile).not.toHaveBeenCalled();
    service.saveProfile.mockReturnValue(of({ user: { ...player, displayName: 'Maria José', avatarId: 'maya' } }));
    component.save();
    expect(service.saveProfile).not.toHaveBeenCalled();
    TestBed.inject(Confirmation).respond(true);
    expect(service.saveProfile).toHaveBeenCalledWith('Maria José', 'maya');
    expect(component.hasChanges).toBe(false);
    expect(component.message()).toContain('Profile saved');
  });

  it.each(['A', ' '.repeat(5), '<script>alert(1)</script>', 'A'.repeat(31), '---'])('rejects invalid display name %s', value => {
    const { component, service } = setup();
    component.form.controls.displayName.setValue(value);
    component.save();
    expect(component.form.invalid).toBe(true);
    expect(service.saveProfile).not.toHaveBeenCalled();
  });

  it('keeps failed edits for retry, prevents duplicate saves and allows discarding', () => {
    const { component, service } = setup();
    const pending = new Subject<{ user: AuthUser }>();
    service.saveProfile.mockReturnValue(pending);
    component.form.controls.displayName.setValue('New Name');
    component.save(); component.save();
    TestBed.inject(Confirmation).respond(true);
    expect(service.saveProfile).toHaveBeenCalledTimes(1);
    expect(component.pending()).toBe(true);
    pending.error(new Error('offline'));
    expect(component.pending()).toBe(false);
    expect(component.hasChanges).toBe(true);
    expect(component.error()).toContain('could not reach');
    component.discard();
    expect(component.hasChanges).toBe(true);
    TestBed.inject(Confirmation).respond(true);
    expect(component.hasChanges).toBe(false);
    expect(component.form.controls.displayName.value).toBe('Juan Plays');
  });

  it('warns before abandoning edits and retains them when leaving is cancelled', () => {
    const { component } = setup();
    expect(component.confirmLeave()).toBe(true);
    component.form.controls.displayName.setValue('New Name');
    const answer = component.confirmLeave();
    let leave: boolean | undefined;
    if (typeof answer !== 'boolean') answer.subscribe(value => leave = value);
    TestBed.inject(Confirmation).respond(false);
    expect(leave).toBe(false);
    expect(component.form.controls.displayName.value).toBe('New Name');
  });

  it('keeps the draft and sends no save when confirmation is cancelled', () => {
    const { component, service } = setup();
    component.form.controls.displayName.setValue('New Name');
    component.save();
    TestBed.inject(Confirmation).respond(false);
    expect(service.saveProfile).not.toHaveBeenCalled();
    expect(component.hasChanges).toBe(true);
    expect(component.pending()).toBe(false);
  });
});
