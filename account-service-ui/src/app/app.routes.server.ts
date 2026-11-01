import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Authenticated, parameterized views resolve the signed-in browser session.
  { path: 'org/:id', renderMode: RenderMode.Client },
  { path: 'viewer/:type/:id', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
