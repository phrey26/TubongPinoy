import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { afterEach } from 'vitest';
import { TumbangAudio, DEFAULT_AUDIO } from '../../../core/services/tumbang-audio';
import { Settings } from './settings';
import { User } from '../../../core/services/user';
import { AccountState } from '../../../core/services/account-state';
import { Confirmation } from '../../../core/services/confirmation';
import { AuthUser } from '../../../core/services/auth';

describe('Account settings', () => {
  afterEach(() => localStorage.clear());
  const player: AuthUser = { id: 1, username: 'Juan', email: 'j@example.com', tansans: 0, juice: 100 };
  function setup() {
    const service = { saveSettings: vi.fn(() => of({ user: player })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: User, useValue: service }] });
    const state = TestBed.inject(AccountState);
    state.set(player);
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service, state, confirmation: TestBed.inject(Confirmation) };
  }

  it('restores immediately saved sound sliders without making an account credential draft', () => {
    const { fixture, component, service } = setup();
    const audio = TestBed.inject(TumbangAudio);
    for (const channel of ['master', 'effects', 'interface'] as const) {
      const slider = fixture.nativeElement.querySelector(`#audio-${channel}`) as HTMLInputElement;
      expect(fixture.nativeElement.querySelector(`label[for="audio-${channel}"]`)).toBeTruthy();
      slider.value = '42'; slider.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
      expect(audio.settings()[channel]).toBe(42); expect(slider.getAttribute('aria-valuetext')).toBe('42 percent');
    }
    expect(component.hasDraft).toBe(false); expect(service.saveSettings).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('tubong.audio.v1.1')!).effects).toBe(42);
  });

  it('previews, mutes, and restores the sound mixer', () => {
    const { fixture } = setup(); const audio = TestBed.inject(TumbangAudio);
    const preview = vi.spyOn(audio, 'preview').mockResolvedValue();
    const button = fixture.nativeElement.querySelector('[aria-label="Preview Game effects"]') as HTMLButtonElement;
    button.click(); expect(preview).toHaveBeenCalledWith('effects');
    audio.toggleMute(); fixture.detectChanges(); expect(button.disabled).toBe(true);
    audio.reset(); fixture.detectChanges(); expect(audio.settings()).toEqual(DEFAULT_AUDIO); expect(button.disabled).toBe(false);
    const stop = vi.spyOn(audio, 'stopPreview'); fixture.destroy(); expect(stop).toHaveBeenCalled();
  });

  it.each(['username', 'email', 'password'] as const)('requires confirmation before changing %s', action => {
    const { component, service, confirmation } = setup();
    const value = action === 'username' ? 'JuanNew' : action === 'email' ? 'new@example.com' : 'new-password-123';
    component.forms[action].setValue({ value, currentPassword: 'old-password', confirmPassword: value });
    component.save(action);
    expect(service.saveSettings).not.toHaveBeenCalled();
    expect(confirmation.active()?.title).toContain('Are you sure');
    expect(confirmation.active()?.message).not.toContain('old-password');
    if (action === 'password') expect(confirmation.active()?.message).not.toContain(value);
    confirmation.respond(false);
    expect(component.pending()).toBeNull();
    expect(component.forms[action].controls.value.value).toBe(value);
    expect(service.saveSettings).not.toHaveBeenCalled();
    service.saveSettings.mockReturnValue(of({ user: { ...player, ...(action !== 'password' ? { [action]: value } : {}) } }));
    component.save(action);
    confirmation.respond(true);
    expect(service.saveSettings).toHaveBeenCalledWith(action === 'password'
      ? { action, currentPassword: 'old-password', newPassword: value, confirmPassword: value }
      : { action, currentPassword: 'old-password', [action]: value });
    expect(component.hasDraft).toBe(false);
    expect(component.message()).toContain('has been changed');
    expect(component.forms[action].controls.currentPassword.value).toBe('');
  });

  it('rejects missing current passwords, invalid credentials and password mismatches', () => {
    const { component, service, confirmation } = setup();
    for (const [action, value, confirmPassword, currentPassword] of [
      ['username', 'NewName', '', ''], ['username', 'bad username', '', 'old-password'],
      ['email', 'bad-email', '', 'old-password'], ['password', 'short', 'short', 'old-password'],
      ['password', 'new-password', 'mismatch', 'old-password'],
      ['password', 'é'.repeat(37), 'é'.repeat(37), 'old-password'],
      ['password', 'password\0', 'password\0', 'old-password'],
    ] as const) {
      component.forms[action].setValue({ value, confirmPassword, currentPassword });
      component.save(action);
      expect(component.forms[action].invalid).toBe(true);
      expect(confirmation.active()).toBeNull();
    }
    expect(service.saveSettings).not.toHaveBeenCalled();
  });

  it('keeps rejected email edits for retry, clears the password, and preserves the session', () => {
    const { component, service, confirmation, state } = setup();
    service.saveSettings.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Your current password is incorrect.' } })));
    component.forms.email.setValue({ value: 'new@example.com', currentPassword: 'wrong-password', confirmPassword: '' });
    component.save('email'); confirmation.respond(true);
    expect(component.error()).toContain('current password is incorrect');
    expect(component.forms.email.controls.value.value).toBe('new@example.com');
    expect(component.forms.email.controls.currentPassword.value).toBe('');
    expect(state.user()).toEqual(player);
    expect(component.pending()).toBeNull();
  });

  it('blocks duplicate submissions and clears all entered current passwords after success', () => {
    const { component, service, confirmation } = setup();
    const request = new Subject<{ user: AuthUser }>();
    service.saveSettings.mockReturnValue(request);
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.forms.email.controls.currentPassword.setValue('old-password');
    component.save('username'); component.save('username');
    confirmation.respond(true);
    component.save('username');
    expect(service.saveSettings).toHaveBeenCalledTimes(1);
    request.next({ user: { ...player, username: 'NewName' } }); request.complete();
    expect(component.forms.email.controls.currentPassword.value).toBe('');
    expect(component.hasDraft).toBe(false);
  });

  it('confirms discarding and leaving, retaining drafts when cancelled', () => {
    const { component, confirmation } = setup();
    expect(component.confirmLeave()).toBe(true);
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.discard(); confirmation.respond(false);
    expect(component.hasDraft).toBe(true);
    const answer = component.confirmLeave();
    let leave: boolean | undefined;
    if (typeof answer !== 'boolean') answer.subscribe(value => leave = value);
    confirmation.respond(false);
    expect(leave).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    component.onBeforeUnload(unload as BeforeUnloadEvent);
    expect(unload.defaultPrevented).toBe(true);
    component.discard(); confirmation.respond(true);
    expect(component.hasDraft).toBe(false);
    expect(component.forms.username.controls.value.value).toBe('Juan');
  });

  it('clears drafts when the account changes and never submits the old account confirmation', () => {
    const { component, confirmation, state, fixture, service } = setup();
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.save('username');
    state.set({ ...player, id: 2, username: 'Maria' });
    fixture.detectChanges();
    confirmation.respond(true);
    expect(service.saveSettings).not.toHaveBeenCalled();
    expect(component.forms.username.controls.value.value).toBe('Maria');
    expect(component.hasDraft).toBe(false);
  });
});
