import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SafeUrlPipe } from '../../../shared/pipes/safe-url-pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-contact',
  imports: [FormsModule, ReactiveFormsModule, SafeUrlPipe],
  templateUrl: './contact.html',
  styleUrl: './contact.css',
})
export class Contact {

  contactForm!: FormGroup;

  isSubmitted = false;
  readonly feedback = signal('');

  // 🗺️ Google Maps embed URL
  mapUrl: string =
    'https://www.google.com/maps?q=Holy+Angel+University,+Angeles+City,+Philippines&output=embed';

  // 📋 Dropdown options
  subjects: string[] = [
    'Game Feedback',
    'Technical Issue',
    'In-game Purchase Query',
    'Others'
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  // ✅ Initialize form
  private initializeForm(): void {
    this.contactForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      subject: ['Game Feedback', Validators.required],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  // ✅ Easy access to form controls
  get f() {
    return this.contactForm.controls;
  }

  // ✅ Submit handler
  onSubmit(): void {
    this.isSubmitted = true;
    this.feedback.set('');
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;
    this.feedback.set('Your message is ready to preview. Delivery is coming soon; no message has been sent.');
  }

  // ✅ Reset form manually
  resetForm(): void {
    this.feedback.set('');
    this.contactForm.reset({
      subject: 'Game Feedback'
    });

    this.isSubmitted = false;
  }
}
