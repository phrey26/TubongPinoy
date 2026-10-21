import { SafeUrlPipe } from './safe-url-pipe';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';

describe('SafeUrlPipe', () => {
  it('create an instance', () => {
    const pipe = new SafeUrlPipe(TestBed.inject(DomSanitizer));
    expect(pipe).toBeTruthy();
  });
});
