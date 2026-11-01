import {
  afterNextRender,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';

/** Keep Angular-owned dialogs in the browser's fullscreen top layer without
 * navigating away from, or recreating, the workspace that opened them. */
@Directive({ selector: '[gpFullscreenDialogHost]', standalone: true })
export class FullscreenDialogHost implements OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  private anchor: Comment | null = null;
  constructor() {
    afterNextRender(() => this.attach());
  }
  private attach(): void {
    this.anchor = this.element.ownerDocument.createComment('workspace-dialog-host');
    this.element.parentNode?.insertBefore(this.anchor, this.element);
    this.move();
  }
  @HostListener('document:fullscreenchange') move(): void {
    const fullscreen = this.element.ownerDocument.fullscreenElement;
    if (fullscreen && !this.element.contains(fullscreen)) fullscreen.appendChild(this.element);
    else if (this.anchor?.parentNode)
      this.anchor.parentNode.insertBefore(this.element, this.anchor.nextSibling);
  }
  ngOnDestroy(): void {
    if (this.anchor?.parentNode) {
      this.anchor.parentNode.insertBefore(this.element, this.anchor);
      this.anchor.remove();
    }
  }
}
