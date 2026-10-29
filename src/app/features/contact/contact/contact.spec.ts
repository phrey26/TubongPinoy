import { Confirmation } from '../../../core/services/confirmation';
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

  it('does not embed Google until requested and removes the embed when hidden', () => {
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const load = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Load Google Map'))!;
    load.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')?.getAttribute('src')).toContain('https://www.google.com/maps');
    const hide = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Hide map'))!;
    hide.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('rejects blank-looking names and messages without claiming to send anything', () => {
    component.contactForm.setValue({ fullName: '   ', email: 'juan@example.com',
      subject: 'Game Feedback', message: '          ' });
    component.onSubmit();
    expect(component.contactForm.invalid).toBe(true);
    expect(component.feedback()).toBe('');
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
    TestBed.inject(Confirmation).respond(false);
    expect(component.contactForm.value.message).toBe('I have an idea for a new game.');
    component.resetForm();
    TestBed.inject(Confirmation).respond(true);
    expect(component.feedback()).toBe('');
    expect(component.contactForm.value.subject).toBe('Game Feedback');
  });
});
