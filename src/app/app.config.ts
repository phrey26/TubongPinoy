import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withInMemoryScrolling, withHashLocation } from '@angular/router';
import { provideHttpClient, withXhr, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { supabaseApiInterceptor } from './core/services/backend-api';
import { PageMetadata } from './core/services/page-metadata';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withXhr(), withInterceptors([supabaseApiInterceptor])),
    provideRouter(routes, withHashLocation(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    { provide: TitleStrategy, useClass: PageMetadata }
  ]
};
