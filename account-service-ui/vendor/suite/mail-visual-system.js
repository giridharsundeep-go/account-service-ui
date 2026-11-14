/** Post's mail chrome is an explicit opt-in; other suite workspaces retain their layouts. */
const scope=':host([current="mail"][mail-layout="inbox"])';
export const mailVisualStyles=`@layer gp-flat-chrome {
${scope} {--gp-text:#000;--gp-muted:#000;}
${scope} .sidebar .nav-create.nav-create {display:none!important;}
${scope} .shell {background:var(--gp-surface,#fff)!important;}
${scope} .header-actions .create-wrapper {display:none!important;}
${scope} .sidebar.sidebar {background:var(--gp-surface,#fff)!important;border:0!important;box-shadow:none!important;}
${scope} .sidebar .nav-scroll {padding:8px 10px 12px 0!important;}
${scope} .sidebar .nav-group {margin:0!important;padding:0!important;border:0!important;}
${scope} .sidebar .group-toggle {display:none!important;}
${scope} .sidebar .nav-item:not(.nav-create) {height:36px!important;min-height:36px!important;padding:0 24px!important;margin:0!important;gap:18px!important;border:0!important;border-radius:var(--gp-radius,10px)!important;color:var(--gp-text,#111)!important;font-size:14px!important;font-weight:400;}
${scope} .sidebar .nav-item.current {background:var(--gp-selection,#eaf1ff)!important;color:var(--gp-text,#000)!important;font-weight:650;}
${scope} .sidebar .nav-item:not(.nav-create):hover {background:var(--gp-selection,#edf3ff)!important;}
${scope} .sidebar .nav-item.current:hover {background:var(--gp-selection,#eaf1ff)!important;}
${scope} .footer.footer a {color:var(--gp-text,#000)!important;}
${scope} .sidebar .nav-item svg {width:20px;height:20px;}
${scope} .sidebar .collapse {background:var(--gp-surface,#fff)!important;color:var(--gp-muted,#68778e)!important;border:0!important;font-size:12px!important;}
${scope} .collapsed .sidebar .nav-item:not(.nav-create) {justify-content:center!important;padding:0!important;}
${scope} .collapsed slot[name="navigation-extra"] {display:none!important;}
${scope} .canvas.canvas {overflow:hidden!important;padding:0!important;background:var(--gp-surface,#fff)!important;}
${scope} .footer.footer {background:var(--gp-surface,#fff)!important;border:0!important;color:var(--gp-muted,#68778e)!important;padding:6px 16px!important;font-size:10px!important;}
${scope}[editor-mode="true"] .nav-resize {display:none!important;}
:host-context([data-theme="dark"])${scope} {--gp-text:#f5f5f5;--gp-muted:#f5f5f5;}
:host-context([data-theme="dark"])${scope} :is(.shell,.header.header,.sidebar.sidebar,.sidebar .collapse,.canvas.canvas,.footer.footer) {background:var(--gp-surface,#181f2b)!important;color:var(--gp-text,#e3ebf7)!important;}
:host-context([data-theme="dark"])${scope} .sidebar .nav-item:not(.nav-create) {color:var(--gp-text,#e3ebf7)!important;}
:host-context([data-theme="dark"])${scope} .sidebar .nav-item.current {background:var(--gp-selection,#273b59)!important;color:var(--gp-text,#f5f5f5)!important;}
:host-context([data-theme="dark"])${scope} .sidebar .nav-item:not(.nav-create):hover {background:var(--gp-selection,#273b59)!important;}
:host-context([data-theme="dark"])${scope} .sidebar .nav-create.nav-create {color:#fff!important;}
@media(max-width:800px) {
 ${scope} .shell:not(.mobile-expanded) .sidebar {width:0!important;overflow:hidden!important;}
 ${scope} .shell:not(.mobile-expanded) .nav-resize {display:none!important;}
 ${scope} .shell.mobile-expanded .sidebar {top:128px!important;bottom:0;width:256px!important;box-shadow:8px 0 24px #172b4d22!important;}
 ${scope} .shell.mobile-expanded .sidebar .nav-item {justify-content:flex-start!important;}
 ${scope} .shell.mobile-expanded .sidebar .nav-item span {display:inline!important;}
}
@media print {
 ${scope} :is(.header,.sidebar,.nav-resize,.footer) {display:none!important;}
 ${scope} :is(.shell,.body,.content,.canvas) {display:block!important;height:auto!important;overflow:visible!important;}
}
}`;

