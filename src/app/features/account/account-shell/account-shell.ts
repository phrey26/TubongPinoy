import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccountState } from '../../../core/services/account-state';
import { avatarUrl } from '../../../core/services/customization';

@Component({
  selector: 'app-account-shell',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './account-shell.html',
  styleUrl: './account-shell.css',
})
export class AccountShell {
  readonly active = input.required<'profile' | 'inventory' | 'settings'>();
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly account = inject(AccountState);
  readonly avatarUrl = avatarUrl;
  readonly links = [
    { id: 'profile', label: 'Edit profile', detail: 'Your name & player icon', icon: 'account' },
    { id: 'inventory', label: 'Inventory', detail: 'Find your lucky look', icon: 'package' },
    { id: 'settings', label: 'Settings', detail: 'Sound & sign-in details', icon: 'settings' },
  ];
}
