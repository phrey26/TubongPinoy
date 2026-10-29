import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable()
export class PageMetadata extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route = snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const title = this.buildTitle(snapshot) ?? 'Tubong Pinoy';
    const description = route.data['description'] ?? 'Filipino playground-inspired games in your browser.';
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: route.data['noindex'] ? 'noindex,follow' : 'index,follow' });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'Tubong Pinoy' });
    // No public URL exists yet. Do not advertise localhost, an iframe asset host,
    // a guessed domain, or an account URL as the canonical address.
  }
}
