import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Contact } from './contact';

describe('Contact', () => {
  let component: Contact;
  let fixture: ComponentFixture<Contact>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [Contact],
    }).compileComponents();

    fixture = TestBed.createComponent(Contact);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('validates the preview form and explains that no message has been sent', () => {
    component.onSubmit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#contact-name-error')).toBeTruthy();
    expect(component.feedback()).toBe('');
    component.contactForm.setValue({ fullName: 'Juan Dela Cruz', email: 'juan@example.com',
      subject: 'Game Feedback', message: 'I have an idea for a new game.' });
    component.onSubmit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('no message has been sent');
    expect(component.contactForm.value.message).toBe('I have an idea for a new game.');
    component.resetForm();
    expect(component.feedback()).toBe('');
    expect(component.contactForm.value.subject).toBe('Game Feedback');
  });
});
