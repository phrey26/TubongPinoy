import { ValidatorFn } from '@angular/forms';

/** Match PHP's password length rule, which counts UTF-8 bytes, not JS characters. */
export const passwordValidator: ValidatorFn = control => {
  const value = String(control.value ?? '');
  const bytes = new TextEncoder().encode(value).length;
  return bytes >= 8 && bytes <= 72 && !value.includes('\0') ? null : { password: true };
};
