/** Opt-in companion for shadow DOM. Post retains its current visual styles. */
const workspace = `
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;font-size:16px;color:var(--gp-text,#202124)}
.header{min-height:76px!important;padding:12px 24px!important;gap:20px!important;border-bottom:1px solid var(--gp-border-color, #a0a6b1)!important;box-shadow:none!important}
.sidebar{background:var(--gp-navigation,#f8f9fa)!important;border-right:0!important}.nav-scroll{padding:20px 12px!important}
.nav-item{height:44px!important;min-height:44px!important;border-radius:24px!important;font:500 15px/1.4 var(--gp-font,Arial)!important;margin:3px 0!important}
.nav-item.current{background:#fff!important;color:#0972d3!important;border-left:3px solid #0972d3!important;font-weight:650!important}.nav-item:not(.current):hover{background:var(--gp-surface-muted,#f5f7f9)!important}
.nav-create{border:0!important;background:var(--gp-surface,#fff)!important;box-shadow:none!important}.group-toggle{font-size:11px!important;font-weight:500!important;letter-spacing:.06em!important;color:var(--gp-muted,#60646c)!important}
.icon-button{width:40px!important;height:40px!important;border:0!important;background:transparent!important;color:var(--gp-muted,#60646c)!important;box-shadow:none!important}.icon-button:hover{background:var(--gp-surface-muted,#f5f7f9)!important;color:var(--gp-text,#202124)!important}
.search,.project-trigger{height:50px!important;border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:26px!important;background:var(--gp-surface,#fff)!important;box-shadow:none!important}.search{padding-inline:18px!important}.search input{font:400 16px/1.5 var(--gp-font,Arial)!important}.search:focus-within{border-color:var(--gp-border-color, #a0a6b1)!important}
.create,.signin{height:46px!important;border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:23px!important;background:var(--gp-surface,#fff)!important;font:500 15px/1.4 var(--gp-font,Arial)!important;box-shadow:none!important}
.project-copy strong{font-weight:500!important;font-size:16px!important}.project-copy small{font-weight:500!important;font-size:10px!important}
.panel{border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:20px!important;box-shadow:var(--gp-float-shadow)!important;padding:20px!important}.panel-head strong{font-weight:600!important;letter-spacing:-.25px!important;font-size:21px!important}.panel-action{font-weight:400!important;font-size:15px!important}
.notice{padding:18px 0!important;border-color:var(--gp-border-color, #a0a6b1)!important}.notice strong{font-weight:600!important;font-size:16px!important}.notice p{line-height:1.6!important}
.avatar{border-radius:50%!important;font-weight:600!important}.person-copy strong{font-weight:600!important}.footer{border-color:var(--gp-border-color, #a0a6b1)!important;color:var(--gp-muted,#60646c)!important;font-size:12px!important}
button:focus-visible,a:focus-visible{outline:2px solid var(--gp-accent)!important;outline-offset:3px!important}
@media(max-width:950px){.header{gap:12px!important;padding-inline:16px!important}.header-actions{gap:8px!important}}
@media(max-width:560px){.header{padding:10px 12px!important}.header-actions{gap:6px!important}.icon-button{width:36px!important;height:36px!important}}
`;
const launcher = `
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important}.launch{height:40px!important;border:0!important;background:transparent!important;color:var(--gp-muted)!important;font-weight:500!important}.launch:hover{background:var(--gp-surface-muted)!important}
.panel{border-radius:20px!important;border-color:var(--gp-border-color, #a0a6b1)!important;box-shadow:var(--gp-float-shadow)!important;padding:16px!important}.app{border-radius:12px!important;padding:14px 10px!important}.app strong{font-size:16px!important;font-weight:600!important;letter-spacing:0!important}.app small{font-size:13px!important;line-height:1.5!important;color:var(--gp-muted)!important}.heading{font-size:11px!important;font-weight:500!important;letter-spacing:.06em!important}
`;
const people = `
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important}article{border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:16px!important;padding:20px!important;box-shadow:none!important;translate:none!important;gap:14px!important}
:host(:hover) article{box-shadow:none!important;translate:none!important}.avatar{border-radius:50%!important;font-weight:600!important}.copy strong{font-size:17px!important;font-weight:600!important;letter-spacing:0!important;line-height:1.5!important}.designation{font-size:14px!important;line-height:1.6!important}.email{font-size:13px!important;line-height:1.6!important}
.details-button{border:0!important;background:transparent!important;color:var(--gp-muted)!important}.details-button:hover{background:var(--gp-surface-muted)!important}.person-details{border-radius:16px!important;border-color:var(--gp-border-color, #a0a6b1)!important;box-shadow:var(--gp-float-shadow)!important}article.selected{border-color:var(--gp-border-color, #a0a6b1)!important;background:var(--gp-selection)!important;box-shadow:none!important}
`;
const theme = `button{width:40px!important;height:40px!important;border:0!important;background:transparent!important;color:var(--gp-muted)!important}button:hover{background:var(--gp-surface-muted)!important}button:focus-visible{outline:2px solid var(--gp-accent)!important;outline-offset:3px!important}@media(max-width:560px){button{width:36px!important;height:36px!important}}`;
export function cleanVisualStyles(surface, appId='', {sharedChrome=false}={}) {
  if (!sharedChrome && (appId === 'mail' || globalThis.document?.documentElement?.getAttribute('data-gp-layout') !== 'clean')) return '';
  return ({workspace,launcher,people,theme})[surface] || '';
}

/** Product identification belongs in the main brand slot, including Post. */
export const productBrandStyles = `
.brand-group{min-width:180px!important;flex:0 0 auto!important}.product-label{display:none!important}
@media(max-width:560px){.brand-group{min-width:0!important}.brand gp-brand{width:auto!important;overflow:visible!important}}
`;

/** Flat chrome applies to every product, including Post, without changing its palette. */
export function borderlessVisualStyles(surface) {
 const flat=':host,:host *,button:hover,article.selected,:host(:hover) article{box-shadow:none!important}:host{color:var(--gp-text,#111)!important}.copy strong,.app strong,.project-copy strong,.person-copy strong,.panel-head strong{color:var(--gp-text,#111)!important}.copy :is(.designation,.email),.person-copy small{color:var(--gp-muted,#494b50)!important}';
 const surfaces={
  workspace:`
.header.header,.sidebar.sidebar,.footer.footer,.panel.panel,.search.search,.project-trigger.project-trigger,.create.create,.signin.signin,.nav-create.nav-create,.project-row.project-row,.notice.notice,.panel-head.panel-head,.account-person.account-person,.footer-links.footer-links{border:0!important}
.header .create.create{border:1px solid #879596!important;border-radius:4px!important;background:#fff!important}
.nav-scroll>.nav-group:first-child{margin-top:0!important}
.shell,.header,.sidebar,.panel,.create,.project-trigger{color:var(--gp-text,#111)!important}
.search.search,.project-trigger.project-trigger{border:1px solid #879596!important;border-radius:4px!important;background:#fff!important;outline:0!important;transition:border-color .16s ease}
.search.search:focus-within,.project-trigger.project-trigger:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--gp-accent,#1558d6) 42%,transparent)!important;outline:0!important}
.search.search input{border:0!important;outline:0!important;color:var(--gp-text,#111)!important}
.search.search input::placeholder{color:var(--gp-muted,#494b50)!important;opacity:1}
.search.search svg,.header .icon-button,.create svg{color:var(--gp-text,#111)!important}
:host([current="chatly"]) :is(svg,.icon-button,.create){color:var(--gp-text,#111)!important}

/* Compact shared workspace chrome and outlined header dropdowns. */
.header.header{box-shadow:none!important;background:var(--gp-surface,#fff)!important}
.header.header{height:auto!important;min-height:64px!important;padding:8px 16px!important;gap:12px!important}.header-controls{gap:12px!important}.header-actions{gap:8px!important}
.search.search{height:36px!important;min-height:36px!important;padding-inline:10px!important;gap:10px!important;border:1px solid #879596!important;border-radius:4px!important;background:#fff!important}.search.search:focus-within{border-color:#0972d3!important;box-shadow:0 0 0 1px #0972d3!important}.search.search input{height:100%!important;font-size:15px!important}
.header .project-trigger.project-trigger{height:36px!important;min-height:36px!important;padding:4px 10px!important;border:1px solid #879596!important;border-radius:4px!important;background:#fff!important}
.header .project-trigger.project-trigger:is(:focus-visible,[aria-expanded="true"]){border-color:#0972d3!important;box-shadow:0 0 0 1px #0972d3!important}
.project-copy strong{font-size:14px!important;line-height:1.3!important}.project-copy small{font-size:9px!important;line-height:1.2!important}
.header .create.create,.signin{height:36px!important;min-height:36px!important;padding-inline:12px!important;border:1px solid #879596!important;border-radius:4px!important;background:#fff!important;font-size:14px!important}.icon-button{width:36px!important;height:36px!important}
.header .notifications-button,.header .help-button{border:0!important;background:transparent!important}.header .account-button{border:0!important;border-radius:50%!important;background:var(--gp-avatar-blue,#3678cb)!important;color:#fff!important;overflow:hidden!important}.header .account-button[data-has-photo="true"]{background:#e9edf3!important}.header .account-button img{display:block!important;width:100%!important;height:100%!important;border-radius:50%!important;object-fit:cover!important}
.header .panel.panel{top:calc(100% + 4px)!important;border:0!important;border-radius:22px!important;padding:14px!important;background:var(--gp-surface,#fff)!important;box-shadow:0 14px 48px rgb(32 33 36 / 16%)!important}.panel-head strong{font-size:18px!important}.notice{padding:10px 0!important}.notice strong{font-size:14px!important}.notice p{margin:4px 0 0!important;font-size:13px!important;line-height:1.45!important}
.nav-item.current{background:var(--gp-selection,#e5e7eb)!important;color:var(--gp-text,#202124)!important}.nav-scroll{padding:12px 8px!important}.nav-item{height:40px!important;min-height:40px!important;margin:1px 0!important;padding-inline:12px!important;font-size:14px!important;gap:12px!important}.nav-group{margin-top:12px!important}.group-toggle{padding-bottom:6px!important}.footer.footer{padding:8px 16px!important;font-size:12px!important}
@media(max-width:560px){.header.header{padding:8px 12px!important}.header .icon-button{width:40px!important;height:40px!important}.nav-item{height:44px!important;min-height:44px!important}}
`,
  launcher:`
button.launch.launch,.footer.footer{border:0!important}button.launch.launch{height:40px!important;border:0!important;border-radius:50%!important;background:transparent!important;color:var(--gp-text,#111)!important}
.panel.panel{display:flex!important;flex-direction:column!important;width:min(900px,calc(100vw - 32px))!important;max-width:calc(100vw - 32px)!important;max-height:calc(100dvh - 90px)!important;overflow:hidden!important;padding:0!important;top:calc(100% + 8px)!important;border:1px solid #d5dbdb!important;border-radius:6px!important;background:#fff!important;box-shadow:0 4px 12px rgb(0 0 0 / 14%)!important}.panel[hidden]{display:none!important}
.heading.heading{padding:16px 20px!important;font-size:15px!important;font-weight:600!important;letter-spacing:0!important;color:var(--gp-text)!important}.heading button{color:var(--gp-text)!important;font-size:24px!important}
.apps-list{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;padding:12px!important;background:#fff!important;overflow:auto!important;overscroll-behavior:contain!important;min-height:0!important}
.app.app{display:flex!important;align-items:center!important;gap:10px!important;padding:10px!important;min-width:0!important;background:#fff!important;border:0!important;border-radius:4px!important;color:var(--gp-text)!important}.app.app:hover,.app[aria-current]{border:0!important;background:#fff!important;color:#0972d3!important}.app[aria-current]{box-shadow:inset 3px 0 #0972d3!important}.app i{width:42px!important;height:42px!important;flex:0 0 42px!important}.app-copy{min-width:0!important}.app strong{font-size:16px!important;font-weight:600!important;line-height:1.35!important}.app small{font-size:12px!important;line-height:1.5!important;margin-top:3px!important}.app-arrow{margin-left:auto!important;font-size:16px!important}
.workspace-tools{display:flex!important;align-items:center!important;gap:10px!important;padding:12px 16px!important;background:#fff!important}.workspace-tools>span{margin-right:auto!important;font-size:12px!important}.workspace-tools button{display:flex!important;align-items:center!important;gap:7px!important;background:#fff!important;border:1px solid #879596!important;border-radius:4px!important;padding:8px!important;color:var(--gp-text)!important;font:inherit;font-size:13px!important}.workspace-tools svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.footer.footer{padding:12px 20px!important;margin:0!important;background:#fff!important;font-size:12px!important;color:var(--gp-muted)!important}
@media(max-width:520px){.apps-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}.panel.panel{width:min(700px,calc(100vw - 24px))!important}}@media(max-width:380px){.apps-list{grid-template-columns:1fr!important}.panel.panel{width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important}}
`,
  people:`
article,article.selected,.person-details.person-details,.details-button.details-button,.avatar.avatar{border:0!important}
:host article,:host article.selected{border:0!important}:host article.selected{background:var(--gp-selection,#e5e7eb)!important;color:var(--gp-text,#202124)!important}
:host{height:auto!important}article{display:grid!important;grid-template-columns:40px minmax(0,1fr) 32px!important;align-items:center!important;gap:10px!important;min-height:68px!important;height:auto!important;padding:10px!important;text-align:left!important;border-radius:10px!important}
.cover{display:none!important}.avatar.avatar{width:40px!important;height:40px!important;margin:0!important;font-size:15px!important;border-radius:50%!important}
.copy.copy,.selectable .copy.copy{padding:0!important;gap:4px!important;width:auto!important}
.avatar.avatar{grid-column:1!important;grid-row:1!important;align-self:center!important;color:#fff!important}
.copy.copy{grid-column:2!important;grid-row:1!important;min-width:0!important;align-self:center!important}
.copy strong{display:flex!important;align-items:center!important;gap:6px!important;min-width:0!important;font-size:14px!important;line-height:1.4!important}
.copy .person-name{display:block!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
.copy .designation{font-size:12px!important;line-height:1.4!important}
.details-button.details-button{grid-row:1!important;align-self:center!important}
.copy strong{font-size:14px!important;line-height:1.4!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.designation{font-size:13px!important;line-height:1.35!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
.details-button.details-button,.selectable .details-button.details-button{position:static!important;grid-column:3!important;width:32px!important;height:32px!important;border-radius:50%!important;padding:0!important;display:grid!important;place-items:center!important;color:var(--gp-text)!important}
article.selectable{padding-right:46px!important}.check{top:50%!important;right:10px!important;transform:translateY(-50%);width:24px!important;height:24px!important;border-radius:6px!important;background:var(--gp-surface-muted)!important}.selected .check{background:var(--gp-accent)!important;color:#fff!important}.check[hidden]{display:none!important}
.person-details.person-details{position:fixed!important;right:auto!important;bottom:auto!important;width:min(360px,calc(100vw - 24px))!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;margin:0!important;padding:20px!important;background:var(--gp-surface-muted,#f5f5f5)!important;border-radius:10px!important;z-index:10000!important}.person-details[hidden]{display:none!important}.person-details h3{font-size:18px!important}.person-details dl{font-size:13px!important;line-height:1.5!important}.close-details{width:28px!important;height:28px!important}
:host .person-details.person-details{border:0!important;border-radius:22px!important;box-shadow:0 14px 48px rgb(32 33 36 / 16%)!important}
`,
  theme:`button{border:0!important;color:var(--gp-text,#111)!important}`
 };
 return surfaces[surface]===undefined?'':`@layer gp-flat-chrome{${flat}${surfaces[surface]}}`;
}
