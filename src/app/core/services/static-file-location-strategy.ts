import { HashLocationStrategy, PlatformLocation } from '@angular/common';
import { Injectable } from '@angular/core';

/** Preserve index.html when the host serves files but rejects directory URLs. */
@Injectable()
export class StaticFileLocationStrategy extends HashLocationStrategy {
  constructor(private readonly platform: PlatformLocation) { super(platform); }

  override prepareExternalUrl(internal: string): string {
    return this.platform.pathname + this.platform.search + super.prepareExternalUrl(internal);
  }
}
