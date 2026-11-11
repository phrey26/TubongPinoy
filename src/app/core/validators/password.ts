import { ValidatorFn } from '@angular/forms';
import { assessPassword } from './password-policy';

/** The same new-password policy is enforced by the server's account API. */
export function passwordValidatorFor(username: () => string): ValidatorFn {
  return control => assessPassword(String(control.value ?? ''), username()).accepted ? null : { password: true };
}

export const passwordValidator: ValidatorFn = passwordValidatorFor(() => '');
