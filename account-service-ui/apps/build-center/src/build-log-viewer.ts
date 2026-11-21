import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, ElementRef, OnInit, afterNextRender, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { isBuildInProgress } from './models';
import type { BuildRun } from './models';

const phases = [
  { id: 'checkout', label: 'Source checkout' },
  { id: 'build', label: 'Docker build' },
  { id: 'export', label: 'Image export' },
] as const;
type Phase = typeof phases[number]['id'];
const detailTabs = [
  { id: 'logs', label: 'Build logs' },
  { id: 'phases', label: 'Phase details' },
  { id: 'details', label: 'Build details' },
  { id: 'artifacts', label: 'Artifacts' },
] as const;
type DetailTab = typeof detailTabs[number]['id'];

const exportLine = /^(?:#\d+ exporting to docker image format\b|Saving image archive$|Saved image archive at )/;
const errorLine = /^(?:#\d+\s+(?:\d+(?:\.\d+)?\s+)?)?\s*(?:ERROR\b|\[ERROR\]|fatal:|FAILURE:|npm (?:ERR!|error\b)|(?:docker|git) exited with code)/i;

@Component({
  selector: 'app-build-log-viewer',
  imports: [DatePipe, TitleCasePipe],
  templateUrl: './build-log-viewer.html',
  styleUrl: './build-log-viewer.css',
})
export class BuildLogViewer implements OnInit {
  readonly pipelineName = input.required<string>();
  readonly run = input.required<BuildRun>();
  readonly text = input.required<string | null>();
  readonly pending = input(false);
  readonly error = input('');
  readonly downloadPending = input(false);
  readonly closed = output<void>();
  readonly reload = output<void>();
  readonly archiveRequested = output<void>();

  private readonly console = viewChild<ElementRef<HTMLElement>>('logConsole');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly active = computed(() => isBuildInProgress(this.run().status));
  protected readonly phase = signal<Phase | null>(null);
  protected readonly detailTabs = detailTabs;
  protected readonly detail = signal<DetailTab>('logs');
  protected readonly query = signal('');
  protected readonly errorsOnly = signal(false);
  protected readonly wrap = signal(true);
  protected readonly follow = signal(false);
  protected readonly copyStatus = signal('');

  protected readonly elapsed = computed(() => {
    const { startedAt, finishedAt } = this.run();
    if (!finishedAt) return '';
    const seconds = Math.floor((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
    if (!Number.isFinite(seconds) || seconds < 0) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return `${hours ? `${hours}h ` : ''}${minutes ? `${minutes}m ` : ''}${seconds % 60}s`;
  });

  protected readonly lines = computed(() => {
    const text = this.text();
    if (!text) return [];
    const messages = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r\n|\n|\r/);
    if (messages.at(-1) === '') messages.pop();
    let phase: Phase = 'checkout';
    return messages.map((message, index) => {
      if (message.startsWith('Building ') && message.includes(' from commit ')) phase = 'build';
      else if (exportLine.test(message)) phase = 'export';
      return { number: index + 1, message, phase, error: errorLine.test(message) };
    });
  });

  protected readonly stages = computed(() => {
    const { status } = this.run();
    const phase = this.lines().at(-1)?.phase ?? (status === 'running' ? 'checkout' : null);
    const reached = phases.findIndex(stage => stage.id === phase);
    return phases.map((stage, index) => {
      let state = 'Pending';
      if (status === 'succeeded' || index < reached) state = 'Complete';
      else if (index === reached) state = status === 'failed' ? 'Failed' : status === 'stopped' ? 'Stopped' : 'Running';
      return { ...stage, state };
    });
  });

  protected readonly errorCount = computed(() => this.lines().filter(line => line.error).length);
  protected readonly filtered = computed(() => Boolean(this.phase() || this.errorsOnly() || this.query().trim()));
  protected readonly visibleLines = computed(() => {
    const phase = this.phase();
    const query = this.query().trim().toLowerCase();
    const errorsOnly = this.errorsOnly();
    return this.lines().filter(line => (!phase || line.phase === phase) &&
      (!errorsOnly || line.error) && (!query || line.message.toLowerCase().includes(query)));
  });

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
    afterRenderEffect({
      mixedReadWrite: () => {
        const viewport = this.console()?.nativeElement;
        const count = this.visibleLines().length;
        this.wrap();
        if (viewport && count && this.follow() && !this.filtered()) viewport.scrollTop = viewport.scrollHeight;
      },
    });
  }

  ngOnInit(): void {
    this.follow.set(this.active());
  }

  protected selectPhase(id: string): void {
    this.phase.set(phases.find(phase => phase.id === id)?.id ?? null);
    this.scrollToFirstLine();
  }

  protected showPhaseLog(phase: Phase): void {
    this.selectPhase(phase);
    this.detail.set('logs');
  }

  protected moveTab(event: KeyboardEvent): void {
    const current = detailTabs.findIndex(tab => tab.id === this.detail());
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (current + detailTabs.length - 1) % detailTabs.length; break;
      case 'ArrowRight': next = (current + 1) % detailTabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = detailTabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const id = detailTabs[next].id;
    this.detail.set(id);
    document.getElementById(`run-tab-${id}`)?.focus();
  }

  protected scrollToFirstLine(): void {
    const viewport = this.console()?.nativeElement;
    if (viewport) viewport.scrollTop = 0;
  }

  protected pauseOnScroll(event: Event): void {
    const viewport = event.currentTarget as HTMLElement;
    if (!this.filtered() && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 32) {
      this.follow.set(false);
    }
  }

  protected async copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text() ?? '');
      this.copyStatus.set('Log copied to clipboard.');
    } catch {
      this.copyStatus.set('Clipboard unavailable. Select the log text to copy it.');
    }
  }
}
