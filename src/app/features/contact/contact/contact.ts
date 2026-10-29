import { Component, ChangeDetectionStrategy, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Confirmation } from '../../../core/services/confirmation';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SafeUrlPipe } from '../../../shared/pipes/safe-url-pipe';
import { RouterLink } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-contact',
  imports: [FormsModule, ReactiveFormsModule, SafeUrlPipe, RouterLink],
  templateUrl: './contact.html',
  styleUrl: './contact.css',
})
export class Contact {
  private readonly confirmation = inject(Confirmation);
  private readonly destroyRef = inject(DestroyRef);

  contactForm!: FormGroup;

  isSubmitted = false;
  readonly feedback = signal('');
  readonly mapEnabled = signal(false);

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
      fullName: ['', [Validators.required, Validators.maxLength(100),
        (control: AbstractControl) => String(control.value ?? '').trim().length >= 2 ? null : { fullName: true }]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      subject: ['Game Feedback', [Validators.required, (control: AbstractControl) => this.subjects.includes(control.value) ? null : { subject: true }]],
      message: ['', [Validators.required, Validators.maxLength(5000),
        (control: AbstractControl) => String(control.value ?? '').trim().length >= 10 ? null : { message: true }]]
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
    if (!this.hasDraft) { this.clearForm(); return; }
    this.confirmation.ask({
      title: 'Are you sure you want to clear this form?',
      message: 'The message and contact details you entered will be removed.',
      confirmLabel: 'Clear form', cancelLabel: 'Keep editing',
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
      if (confirmed) this.clearForm();
    });
  }

  get hasDraft(): boolean {
    const value = this.contactForm?.value;
    return !!(value && (value.fullName || value.email || value.message ||
      (value.subject && value.subject !== 'Game Feedback')));
  }

  confirmLeave() {
    return !this.hasDraft || this.confirmation.ask({
      title: 'Are you sure you want to leave?',
      message: 'Your message has not been sent. The details you entered will be discarded.',
      confirmLabel: 'Discard and leave', cancelLabel: 'Keep editing',
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasDraft) { event.preventDefault(); event.returnValue = ''; }
  }

  private clearForm(): void {
    this.feedback.set('');
    this.contactForm.reset({
      subject: 'Game Feedback'
    });

    this.isSubmitted = false;
  }
}
