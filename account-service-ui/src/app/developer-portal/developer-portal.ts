import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { appUrl } from '@greatley-poshley/suite';

type AppKind = 'UI' | 'API' | 'Realtime API' | 'Worker' | 'SDK' | 'Platform' | 'Website';

interface AppGuide {
  repo: string;
  slug: string;
  product: string;
  kind: AppKind;
  port: string;
  purpose: string;
}

@Component({
  selector: 'app-developer-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './developer-portal.html',
  styleUrls: ['../docs/docs.css', './developer-portal.css'],
})
export class DeveloperPortal {
  query = '';
  readonly buildCenterUrl = appUrl('build-center');

  readonly apps: AppGuide[] = [
    { repo: 'account-service-ui', slug: 'account-service-ui', product: 'Professy', kind: 'UI', port: '4200', purpose: 'Main Professy workspace interface.' },
    { repo: 'account-service', slug: 'account-service', product: 'Professy Core', kind: 'API', port: '8080', purpose: 'Core workspace API and canonical organization data.' },
    { repo: 'chatly-ui', slug: 'chatly-ui', product: 'Hello', kind: 'UI', port: '4201', purpose: 'Workspace chat and messaging interface.' },
    { repo: 'chatly-service', slug: 'chatly-service', product: 'Hello', kind: 'API', port: '8084', purpose: 'Chat and messaging API.' },
    { repo: 'chatly-realtime-service', slug: 'chatly-realtime-service', product: 'Hello Realtime', kind: 'Realtime API', port: '8085', purpose: 'Realtime chat transport and events.' },
    { repo: 'professy-ui', slug: 'professy-ui', product: 'Professy', kind: 'UI', port: 'Confirm from repo', purpose: 'Professy UI repository; confirm its deployment target and relationship to account-service-ui.' },
    { repo: 'professy-backend', slug: 'professy-backend', product: 'Professy Core', kind: 'API', port: 'Confirm from repo', purpose: 'Professy backend repository; document owned routes and data before routing it.' },
    { repo: 'professy-email-service', slug: 'professy-email-service', product: 'Professy Email', kind: 'Worker', port: '8083', purpose: 'Independent email service with its own database and health endpoint.' },
    { repo: 'professy-notification-service', slug: 'professy-notification-service', product: 'Professy Notifications', kind: 'Worker', port: '8082', purpose: 'Independent notification service; communicates with the event system and its own database.' },
    { repo: 'greatley-poshley-agent-runtime', slug: 'greatley-poshley-agent-runtime', product: 'Agent Runtime', kind: 'Worker', port: '8092', purpose: 'Local coding-agent runtime; review its sandbox, model licensing, queue, and data-storage needs before cloud deployment.' },
    { repo: 'greatley-poshley-auth-ui', slug: 'greatley-poshley-auth-ui', product: 'Passport', kind: 'UI', port: '4204', purpose: 'Shared sign-in and identity interface.' },
    { repo: 'greatley-poshley-auth-service', slug: 'greatley-poshley-auth-service', product: 'Passport', kind: 'API', port: '8086', purpose: 'Shared identity and session service.' },
    { repo: 'greatley-poshley-calendar-ui', slug: 'greatley-poshley-calendar-ui', product: 'Agenda', kind: 'UI', port: '4203', purpose: 'Calendar and scheduling interface.' },
    { repo: 'greatley-poshley-calendar-service', slug: 'greatley-poshley-calendar-service', product: 'Agenda', kind: 'API', port: '8088', purpose: 'Calendar API and event processing.' },
    { repo: 'greatley-poshley-docs-ui', slug: 'greatley-poshley-docs-ui', product: 'Paper', kind: 'UI', port: '4202', purpose: 'Documents and knowledge interface.' },
    { repo: 'greatley-poshley-docs-service', slug: 'greatley-poshley-docs-service', product: 'Paper', kind: 'API', port: '8087', purpose: 'Project-scoped documentation API.' },
    { repo: 'greatley-poshley-forge-ui', slug: 'greatley-poshley-forge-ui', product: 'Forge', kind: 'UI', port: '4208', purpose: 'Source browsing, reviews, and repository collaboration UI.' },
    { repo: 'greatley-poshley-forge-service', slug: 'greatley-poshley-forge-service', product: 'Forge', kind: 'API', port: '8093', purpose: 'Organization-scoped Git hosting and collaboration API.' },
    { repo: 'greatley-poshley-instru-ui', slug: 'greatley-poshley-instru-ui', product: 'Radar', kind: 'UI', port: '4209', purpose: 'Service health, telemetry, releases, and incident dashboards.' },
    { repo: 'greatley-poshley-instru-service', slug: 'greatley-poshley-instru-service', product: 'Radar', kind: 'API', port: '8094', purpose: 'Telemetry collector and monitoring API; accepts write-only service ingest keys.' },
    { repo: 'greatley-poshley-instru-java', slug: 'greatley-poshley-instru-java', product: 'Radar Java SDK', kind: 'SDK', port: 'N/A', purpose: 'Java SDK and instrumentation agent; publish/version the artifact instead of deploying it as a pod.' },
    { repo: 'greatley-poshley-mail-ui', slug: 'greatley-poshley-mail-ui', product: 'Post', kind: 'UI', port: '4210', purpose: 'Internal organization email interface.' },
    { repo: 'greatley-poshley-mail-service', slug: 'greatley-poshley-mail-service', product: 'Post', kind: 'API', port: '8095', purpose: 'Mail API with a dedicated database and event-driven notifications.' },
    { repo: 'greatley-poshley-meetings-ui', slug: 'greatley-poshley-meetings-ui', product: 'Room', kind: 'UI', port: '4207', purpose: 'Meetings and video-calling interface.' },
    { repo: 'greatley-poshley-meetings-service', slug: 'greatley-poshley-meetings-service', product: 'Room', kind: 'API', port: '8091', purpose: 'Authenticated meetings API; forwards workspace requests to the core API.' },
    { repo: 'greatley-poshley-sheets-ui', slug: 'greatley-poshley-sheets-ui', product: 'Columns', kind: 'UI', port: '4205', purpose: 'Spreadsheet and data interface.' },
    { repo: 'greatley-poshley-sheets-service', slug: 'greatley-poshley-sheets-service', product: 'Columns', kind: 'API', port: '8089', purpose: 'Authenticated Sheets API; forwards workspace requests to the core API.' },
    { repo: 'greatley-poshley-slides-ui', slug: 'greatley-poshley-slides-ui', product: 'Show', kind: 'UI', port: '4206', purpose: 'Presentation and slide-authoring interface.' },
    { repo: 'greatley-poshley-slides-service', slug: 'greatley-poshley-slides-service', product: 'Show', kind: 'API', port: '8090', purpose: 'Authenticated Slides API; forwards workspace requests to the core API.' },
    { repo: 'greatley-poshley-support-ui', slug: 'greatley-poshley-support-ui', product: 'Desk', kind: 'UI', port: '4211', purpose: 'Service requests, incidents, and support management interface.' },
    { repo: 'greatley-poshley-website', slug: 'greatley-poshley-website', product: 'Greatley Poshley Website', kind: 'Website', port: 'Confirm from repo', purpose: 'Company website; confirm whether it is a static build or server-rendered before choosing its workload.' },
    { repo: 'greatley-poshley-suite', slug: 'greatley-poshley-suite', product: 'Workspace Suite', kind: 'Platform', port: 'N/A', purpose: 'Shared app registry, workspace shell, and launcher package; release it as a package, not as an EKS service.' },
  ];

  get filteredApps(): AppGuide[] {
    const query = this.query.trim().toLowerCase();
    if (!query) return this.apps;
    return this.apps.filter(app => `${app.repo} ${app.product} ${app.kind} ${app.purpose}`.toLowerCase().includes(query));
  }

  repositoryUrl(app: AppGuide): string {
    return `https://github.com/giridharsundeep-go/${app.repo}`;
  }

  get deploymentCount(): number {
    return this.apps.filter(app => !['SDK', 'Platform'].includes(app.kind)).length;
  }
}
