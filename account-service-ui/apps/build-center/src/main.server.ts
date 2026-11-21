import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { RenderMode, provideServerRendering, withRoutes } from '@angular/ssr';
import { BuildCenterApp } from './app';

export default (context: BootstrapContext) => bootstrapApplication(BuildCenterApp, {
  providers: [provideServerRendering(withRoutes([{ path: '**', renderMode: RenderMode.Client }]))],
}, context);
