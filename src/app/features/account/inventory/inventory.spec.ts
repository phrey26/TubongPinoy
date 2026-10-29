import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Inventory } from './inventory';
import { User } from '../../../core/services/user';
import { AccountState } from '../../../core/services/account-state';
import { AuthUser } from '../../../core/services/auth';
import { GameSkin } from '../../../core/services/customization';
import { Confirmation } from '../../../core/services/confirmation';

describe('Inventory', () => {
  const player: AuthUser = { id: 1, username: 'Juan', email: 'j@example.com', tansans: 0, juice: 100,
    equippedSkins: { 'tumbang-preso': 'slipper_pink', 'jolens-blast': 'shooter_chrome' } };
  const items: GameSkin[] = [
    { id: 'slipper_pink', name: 'Pink Slipper', game: 'tumbang-preso', imageUrl: '' },
    { id: 'slipper_blue', name: 'Blue Slipper', game: 'tumbang-preso', imageUrl: '' },
    { id: 'shooter_gold', name: 'Golden Jolens', game: 'jolens-blast', imageUrl: '' },
  ];
  function setup(fail = false) {
    const result = { items, collectibles: [], user: player };
    const service = { inventory: vi.fn(() => fail ? throwError(() => new Error('offline')) : of(result)),
      equip: vi.fn(() => of({ user: player })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: User, useValue: service }] });
    const state = TestBed.inject(AccountState);
    state.set(player);
    const fixture = TestBed.createComponent(Inventory);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service, state, result };
  }

  it('filters skins by game and shows the saved selection', () => {
    const { component, fixture } = setup();
    expect(component.visibleItems()).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.is-equipped').textContent).toContain('Pink Slipper');
    component.selectGame('jolens-blast');
    fixture.detectChanges();
    expect(component.visibleItems()).toEqual([items[2]]);
    expect(component.equippedId()).toBe('shooter_chrome');
  });

  it('waits for a confirmed change and prevents duplicate requests', () => {
    const { component, service, state } = setup();
    const pending = new Subject<{ user: AuthUser }>();
    service.equip.mockReturnValue(pending);
    component.equip(items[1]); component.equip(items[1]);
    expect(service.equip).not.toHaveBeenCalled();
    TestBed.inject(Confirmation).respond(true);
    expect(service.equip).toHaveBeenCalledTimes(1);
    expect(service.equip).toHaveBeenCalledWith('tumbang-preso', 'slipper_blue');
    expect(component.equippedId()).toBe('slipper_pink');
    const saved = { ...player, equippedSkins: { ...player.equippedSkins, 'tumbang-preso': 'slipper_blue' } };
    state.set(saved);
    pending.next({ user: saved }); pending.complete();
    expect(component.equippedId()).toBe('slipper_blue');
    expect(component.pending()).toBeNull();
  });

  it('preserves the equipped skin on failure and offers a catalog retry', () => {
    const { component, service, result } = setup(true);
    expect(component.loadError()).toContain('could not reach');
    service.inventory.mockReturnValue(of(result));
    component.load();
    expect(component.loadError()).toBe('');
    service.equip.mockReturnValue(throwError(() => new Error('offline')));
    component.equip(items[1]);
    TestBed.inject(Confirmation).respond(true);
    expect(component.equippedId()).toBe('slipper_pink');
    expect(component.error()).toContain('could not reach');
    expect(component.pending()).toBeNull();
  });

  it('keeps the current skin when confirmation is cancelled', () => {
    const { component, service } = setup();
    component.equip(items[1]);
    TestBed.inject(Confirmation).respond(false);
    expect(service.equip).not.toHaveBeenCalled();
    expect(component.equippedId()).toBe('slipper_pink');
    expect(component.pending()).toBeNull();
  });
});
