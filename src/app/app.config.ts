import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withInMemoryScrolling } from '@angular/router';
import { LocationStrategy } from '@angular/common';
import { provideHttpClient, withXhr, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { supabaseApiInterceptor } from './core/services/backend-api';
import { PageMetadata } from './core/services/page-metadata';
import { StaticFileLocationStrategy } from './core/services/static-file-location-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withXhr(), withInterceptors([supabaseApiInterceptor])),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    { provide: LocationStrategy, useClass: StaticFileLocationStrategy },
    { provide: TitleStrategy, useClass: PageMetadata }
  ]
};
