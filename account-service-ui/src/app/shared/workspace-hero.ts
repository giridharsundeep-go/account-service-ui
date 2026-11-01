import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-workspace-hero',
  standalone: true,
  templateUrl: './workspace-hero.html',
  styleUrls: ['./workspace-hero.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceHeroComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() image = '';
  @Input() imageAlt = '';
  @Input() compact = false;
}
