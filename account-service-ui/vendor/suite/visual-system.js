/** Shared shadow-DOM chrome. Values inherit the Clarity tokens from every app. */
export const workspaceVisualStyles = `
/* The brand is never hidden; compact screens retain the mark. */
.brand{display:inline-flex!important;align-items:center;flex-shrink:0;overflow:visible}.brand-group gp-brand{flex-shrink:0}.product-label img{display:block;object-fit:contain;flex-shrink:0}@media(max-width:560px){.brand gp-brand{width:36px;overflow:hidden}.brand-group{flex:0 0 auto!important}.header-actions{margin-left:auto}.header-actions gp-apps{display:inline-block!important}}

:host(:not([editor-mode="true"]):not([embedded="true"])) .canvas slot::slotted(*){width:100%;max-width:100%;margin-left:auto;margin-right:auto;box-sizing:border-box}
:host([integrated-navigation="true"]) .canvas slot::slotted(.chatly-shell){width:100%;max-width:100%;margin-inline:auto}
@media(max-width:800px){:host .canvas slot::slotted(*){width:100%!important;max-width:100%!important}}

.sidebar{width:var(--navigation-width,248px)!important}.collapsed .sidebar{width:72px!important}.nav-resize{width:8px;margin-left:-4px;margin-right:-4px;position:relative;z-index:20;flex:0 0 8px;cursor:col-resize;touch-action:none;outline-offset:-2px}.nav-resize:after{content:"";position:absolute;inset:15px 3px;border-radius:8px;transition:background .15s}.nav-resize:hover:after,.nav-resize:focus-visible:after,.resizing .nav-resize:after{background:var(--gp-accent,#1764d4)}.resizing{user-select:none;cursor:col-resize}.collapsed .nav-resize,.public .nav-resize,.identity .nav-resize,:host([integrated-navigation="true"]) .nav-resize,:host([editor-mode="true"]) .nav-resize,:host([embedded="true"]) .nav-resize{display:none}.brand-group{min-width:280px!important;flex:0 0 auto!important}.brand{text-decoration:none}.product-label{display:flex!important;align-items:center;gap:7px;font-size:15px;font-weight:700;order:-1;white-space:nowrap}.header-search{max-width:none!important}@media(max-width:1050px){.brand-group{min-width:0!important}.product-label{display:none!important}}@media(max-width:800px){.sidebar{width:72px!important}.nav-resize{display:none}.shell.mobile-expanded .sidebar{width:248px!important}}

:host{font-family:var(--gp-font,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif)!important;color:var(--gp-text,#111113);font-size:15px}
.shell,.header,.sidebar,.canvas,.footer{background:var(--gp-page,#fff)!important;color:var(--gp-text,#111113)!important;border-color:var(--gp-border-color, #a0a6b1)!important}
.header{min-height:78px;height:auto;padding:12px 20px;gap:18px}.brand{font-family:inherit;font-weight:800;letter-spacing:-.04em;color:var(--gp-text,#111113)!important;font-size:22px}.brand-group{flex:0 1 235px;min-width:210px}.header-actions{gap:8px}
button,input,a{font-family:inherit}.icon-button{width:44px;height:44px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:50%;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important}.icon-button:hover{background:var(--gp-surface-muted,#f5f5f7)!important}
.search{height:50px;border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:999px!important;background:var(--gp-surface,#fff)!important;padding:0 18px;gap:12px;color:var(--gp-muted,#68686e)!important}.search input{font-family:inherit;font-size:16px;color:var(--gp-text,#111113)!important;height:46px;border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important}.search input::placeholder{color:var(--gp-muted,#68686e)}.search:focus-within{border-color:var(--gp-border-color, #a0a6b1)!important}.search:has(input:focus-visible){outline:2px solid var(--gp-accent,#1769ff);outline-offset:2px}.search kbd{border-color:var(--gp-border-color, #a0a6b1);background:var(--gp-surface-muted,#f5f5f7);color:var(--gp-muted,#68686e)}
.create,.signin{height:48px;border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:999px!important;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important;padding:0 18px;font-size:15px;font-weight:650}.create svg{color:var(--gp-text,#111113)}
.avatar{border-radius:24%;font-size:15px;font-weight:750}.account-button{border-radius:50%;width:42px;height:42px}.nav-scroll{padding:22px 12px}.nav-item{border-radius:14px;margin:3px 0;height:48px;font-size:15px;font-weight:600;color:var(--gp-text,#111113)!important}.nav-item.current{background:var(--gp-selection,#edf3ff)!important;color:var(--gp-accent,#1769ff)!important}.nav-item:not(.current):hover{background:var(--gp-surface-muted,#f5f5f7)!important}.group-toggle{font-size:10px;color:var(--gp-muted,#68686e);letter-spacing:.09em;padding-bottom:12px}.nav-create{border:1px solid var(--gp-border-color, #a0a6b1);border-radius:999px}.collapse{font-size:13px;background:var(--gp-page,#fff)!important;color:var(--gp-muted,#68686e)!important;border-color:var(--gp-border-color, #a0a6b1)!important}
.panel{border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:22px!important;padding:20px;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important;box-shadow:var(--gp-float-shadow,0 14px 42px #0002)!important}.panel-head strong{font-size:21px;letter-spacing:-.025em;font-weight:750}.panel-action{font-size:15px;border-radius:12px;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important}.panel-action:hover{background:var(--gp-surface-muted,#f5f5f7)!important}.account-person{border-color:var(--gp-border-color, #a0a6b1)}.person-copy strong{font-size:17px}.person-copy small,.panel-message{color:var(--gp-muted,#68686e)}.notice{padding:18px 0;border-color:var(--gp-border-color, #a0a6b1)}.notice strong{font-size:16px;font-weight:750}.notice p{font-size:14px;color:var(--gp-muted,#68686e)}.notice time{font-size:12px;color:var(--gp-muted,#68686e)}
.project-trigger{height:50px;border-radius:999px!important;border-color:var(--gp-border-color, #a0a6b1)!important;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important}.project-copy small{font-size:9px;letter-spacing:.07em;color:var(--gp-muted,#68686e)}.project-copy strong{font-size:15px;font-weight:700}.project-row{min-height:64px;border-radius:12px;font-size:15px;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important}.project-row:hover,.project-row.selected{background:var(--gp-selection,#edf3ff)!important}.footer{font-size:11px;padding:12px 22px;color:var(--gp-muted,#68686e)!important}.footer a{color:var(--gp-accent,#1769ff)}
@media(max-width:1250px){.brand-group{min-width:180px;flex-basis:190px}.brand{font-size:19px}.header{gap:12px;padding-inline:12px}.header-actions{gap:6px}.help-button,.search kbd{display:none}.project-control{width:230px}}
@media(max-width:950px){.header{flex-wrap:wrap}.brand-group{flex:1}.header-controls{flex-basis:100%;order:3}.project-control{width:230px;flex-shrink:1}.header-actions{margin-left:auto}.project-panel{max-width:calc(100vw - 24px)}}
@media(max-width:560px){.header{padding:10px 12px;gap:10px}.brand-group{min-width:0}.brand{font-size:18px}.header-controls{gap:8px}.project-control{width:42%;min-width:135px}.project-copy strong{font-size:13px}.project-trigger{padding-inline:10px;gap:6px}.project-trigger>svg:first-child{display:none}.search{padding-inline:13px}.search input{font-size:15px}.create{padding-inline:12px}.header-actions .notifications-button{display:none}}

/* Post chrome and motion, shared by every standalone application. */
.header{background:var(--gp-page,#fff)!important}.canvas{background:var(--gp-page,#fff)!important}.canvas slot::slotted(*){width:100%!important;max-width:100%!important;margin-inline:0!important}.nav-item{height:48px;border-radius:14px}.search{font-size:16px}.product-label{font-size:15px}.brand-group{gap:10px}.header-actions{gap:10px}
@keyframes gp-shell-panel{from{opacity:0;translate:0 8px;scale:.985}to{opacity:1;translate:0 0;scale:1}}
@media(prefers-reduced-motion:no-preference){.panel:not([hidden]){animation:gp-shell-panel var(--gp-duration,280ms) var(--gp-ease,cubic-bezier(.22,1,.36,1)) both}.nav-item,.icon-button,.create,.panel-action,.project-row{transition:background-color 160ms ease,scale 160ms var(--gp-ease,cubic-bezier(.22,1,.36,1))}.icon-button:active,.create:active{scale:.97}.sidebar{transition:width var(--gp-duration,280ms) var(--gp-ease,cubic-bezier(.22,1,.36,1))}.resizing .sidebar{transition:none}.group-toggle svg{transition:rotate 220ms ease}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
export const launcherVisualStyles = `
:host{font-family:var(--gp-font,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif)!important}button.launch{height:44px;border-radius:999px;border-color:var(--gp-border-color, #a0a6b1)!important;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important;font-family:inherit;font-size:14px;padding:0 15px}.panel{top:54px;border:1px solid var(--gp-border-color, #a0a6b1)!important;border-radius:24px!important;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important;box-shadow:var(--gp-float-shadow,0 14px 42px #0002)!important;padding:16px}.heading{color:var(--gp-muted,#68686e);font-size:10px;font-weight:700;letter-spacing:.08em;padding:5px 8px 14px}.app{border-radius:14px;padding:13px 10px;gap:14px;background:var(--gp-surface,#fff)!important;color:var(--gp-text,#111113)!important}.app:hover{background:var(--gp-surface-muted,#f5f5f7)!important}.app i{width:43px;height:43px;border-radius:24%}.app i:after{display:none}.app strong{font-size:16px;font-weight:750;letter-spacing:-.015em}.app small{font-size:12px;color:var(--gp-muted,#68686e);margin-top:3px}.footer{font-size:11px;color:var(--gp-muted,#68686e);border-color:var(--gp-border-color, #a0a6b1)}

@keyframes gp-apps-open{from{opacity:0;translate:0 -6px;scale:.98}to{opacity:1;translate:0 0;scale:1}}@media(prefers-reduced-motion:no-preference){.panel:not([hidden]){animation:gp-apps-open var(--gp-duration,280ms) var(--gp-ease,cubic-bezier(.22,1,.36,1)) both}.app{transition:background-color 160ms ease,scale 160ms ease}.app:active{scale:.98}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
export const peopleVisualStyles = `
:host{font-family:var(--gp-font,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif)!important}article{display:grid!important;grid-template-columns:56px minmax(0,1fr);gap:14px;align-items:start;min-height:118px;height:100%;padding:18px!important;text-align:left!important;border-radius:18px!important;border-color:var(--gp-border-color, #a0a6b1)!important;box-shadow:var(--gp-shadow,0 2px 10px #0001)!important;color:var(--gp-text,#111113)!important;background:var(--gp-surface,#fff)!important}.cover{display:none!important}.avatar{width:56px!important;height:56px!important;margin:0!important;border:0!important;border-radius:24%!important;font-size:20px!important}.copy{padding-right:8px;gap:5px!important}.copy strong{font-size:17px!important;line-height:1.35;font-weight:750;letter-spacing:-.015em}.designation{font-size:14px!important;color:var(--gp-muted,#68686e)!important}.email{font-size:13px!important;color:var(--gp-muted,#68686e)!important;line-height:1.45}article.selectable{padding-right:38px!important}article.selected{border-color:var(--gp-border-color, #a0a6b1)!important;box-shadow:0 0 0 1px var(--gp-accent,#1769ff)!important;background:var(--gp-selection,#edf3ff)!important}.check{top:14px;right:12px;width:22px;height:22px;border-radius:50%;font-size:16px;border-color:var(--gp-border-color, #a0a6b1);color:var(--gp-muted,#68686e)}.selected .check{background:#1769ff;border-color:var(--gp-border-color, #a0a6b1);color:#fff}:host(:focus-visible) article{outline:2px solid var(--gp-accent,#1769ff);outline-offset:2px}

@media(prefers-reduced-motion:no-preference){article{transition:box-shadow var(--gp-duration,280ms) ease,border-color 160ms ease,translate var(--gp-duration,280ms) var(--gp-ease,cubic-bezier(.22,1,.36,1))}:host(:hover) article{translate:0 -2px;box-shadow:0 6px 20px #0001!important}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/** AWS Console inspired chrome shared across every workspace application. */
export const awsConsoleShellStyles = `@layer gp-flat-chrome {
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;color:#16191f!important;font-size:14px!important}
.shell,.header,.sidebar,.canvas,.footer{background:#fff!important;color:#16191f!important;border-color:#d5dbdb!important}
.header.header{height:64px!important;min-height:64px!important;padding:8px 20px!important;gap:16px!important;border-bottom:1px solid #d5dbdb!important;box-shadow:none!important}
.brand{font-family:inherit!important;font-size:20px!important;font-weight:700!important;letter-spacing:-.02em!important;color:#16191f!important}
.brand-group{min-width:200px!important;gap:12px!important}
.header-actions{gap:6px!important}
.icon-button{width:36px!important;height:36px!important;border:0!important;border-radius:4px!important;background:transparent!important;color:#414d5c!important}
.icon-button:hover{background:#f2f3f3!important;color:#16191f!important}
:host .search.search,.header .project-trigger.project-trigger{height:36px!important;min-height:36px!important;border:1px solid #879596!important;border-radius:4px!important;background:#fff!important;padding:0 10px!important;box-shadow:none!important;color:#414d5c!important}
.search.search:focus-within,.header .project-trigger.project-trigger:focus-visible{border-color:#0972d3!important;box-shadow:0 0 0 1px #0972d3!important}
.search.search input{height:34px!important;font:400 14px/1.4 var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;color:#16191f!important}
.search.search input::placeholder{color:#5f6b7a!important}
.create.create,.signin.signin{height:36px!important;min-height:36px!important;padding:0 12px!important;border:1px solid #879596!important;border-radius:4px!important;background:#fff!important;color:#16191f!important;font:650 14px/1.2 var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;box-shadow:none!important}
.create.create:hover,.signin.signin:hover{background:#f2f3f3!important}
.sidebar.sidebar{width:var(--navigation-width,248px)!important;background:#fff!important;border-right:1px solid #d5dbdb!important}
.nav-scroll{padding:12px 8px!important}
.nav-item{height:36px!important;min-height:36px!important;margin:2px 0!important;padding:0 10px!important;border-radius:4px!important;font:500 14px/1.4 var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;color:#16191f!important;gap:10px!important}
.nav-item.current{background:#fff!important;color:#0972d3!important;font-weight:650!important;border-left:3px solid #0972d3!important}
.nav-item:not(.current):hover{background:#fff!important;color:#0972d3!important}
.group-toggle{padding:8px 8px 5px!important;color:#5f6b7a!important;font-size:11px!important;font-weight:650!important;letter-spacing:.04em!important}
.nav-group{margin-top:8px!important}
.collapse{border:0!important;border-radius:4px!important;background:#fff!important;color:#5f6b7a!important}
.panel.panel{top:calc(100% + 4px)!important;border:1px solid #d5dbdb!important;border-radius:6px!important;padding:12px!important;background:#fff!important;color:#16191f!important;box-shadow:0 4px 12px rgb(0 0 0 / 14%)!important}
.panel-head strong{font-size:16px!important;font-weight:650!important;letter-spacing:0!important}
.panel-action{border-radius:4px!important;color:#16191f!important;font-size:14px!important}
.panel-action:hover,.project-row:hover{background:#fff!important;color:#0972d3!important}
.notice{padding:10px 0!important;border-color:#d5dbdb!important}
.notice strong{font-size:14px!important;font-weight:650!important}
.notice p{font-size:13px!important;line-height:1.45!important;color:#5f6b7a!important}
.project-row.project-row{min-height:40px!important;border-radius:4px!important}
.footer.footer{padding:8px 20px!important;border-top:1px solid #d5dbdb!important;color:#5f6b7a!important;font-size:11px!important}
.footer-links a{color:#0972d3!important}
button:focus-visible,a:focus-visible{outline:2px solid #0972d3!important;outline-offset:2px!important}
@media(max-width:800px){.header.header{height:auto!important;min-height:60px!important;padding:8px 12px!important}.sidebar.sidebar{border-right:0!important}.nav-item{height:40px!important;min-height:40px!important}}
}`;

export const awsConsoleLauncherStyles = `@layer gp-flat-chrome {
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;color:#16191f!important}
button.launch.launch{width:auto!important;height:36px!important;min-height:36px!important;padding:0 8px!important;border:0!important;border-radius:4px!important;background:#fff!important;color:#414d5c!important;font:600 13px/1.2 var(--gp-font,'Poshley Sans',Arial,sans-serif)!important}
button.launch.launch:hover{background:#fff!important;color:#0972d3!important}
:host .panel.panel[role="dialog"]{width:min(900px,calc(100vw - 32px))!important;max-width:calc(100vw - 32px)!important;top:calc(100% + 6px)!important;padding:8px!important;border:1px solid #d5dbdb!important;border-radius:6px!important;background:#fff!important;box-shadow:0 4px 12px rgb(0 0 0 / 14%)!important}
:host .apps-list{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;padding:12px!important;background:#fff!important}
.heading.heading{padding:10px 12px!important;color:#5f6b7a!important;font-size:12px!important;letter-spacing:0!important}
.app.app,.app.app:hover,.app.app[aria-current="page"]{min-height:66px!important;padding:8px 10px!important;border-radius:4px!important;background:#fff!important;color:#16191f!important}
.app.app[aria-current="page"]{box-shadow:inset 3px 0 #0972d3!important;color:#0972d3!important}
.app strong{font-size:14px!important;font-weight:650!important}
.app small{font-size:12px!important;color:#5f6b7a!important}
.app i{width:34px!important;height:34px!important;border-radius:4px!important}
 .workspace-tools{border-color:#d5dbdb!important;background:#fff!important}
.workspace-tools button{border:1px solid #879596!important;border-radius:4px!important;background:#fff!important}
.footer.footer{padding:10px 12px!important;border-color:#d5dbdb!important;background:#fff!important;font-size:11px!important;color:#5f6b7a!important}
@media(max-width:520px){:host .panel.panel[role="dialog"]{width:min(700px,calc(100vw - 24px))!important}.apps-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:380px){:host .panel.panel[role="dialog"]{width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important}.apps-list{grid-template-columns:1fr!important}}
}`;

export const awsConsolePeopleStyles = `@layer gp-flat-chrome {
:host{font-family:var(--gp-font,'Poshley Sans',Arial,sans-serif)!important;color:#16191f!important}
article{border:1px solid #d5dbdb!important;border-radius:6px!important;background:#fff!important;box-shadow:none!important;translate:none!important}
article.selected{border-color:#0972d3!important;background:#eaf4ff!important;box-shadow:0 0 0 1px #0972d3!important}
:host(:hover) article{box-shadow:none!important;translate:none!important}
.copy strong{font-size:14px!important;font-weight:650!important;letter-spacing:0!important}
.designation,.email{color:#5f6b7a!important;font-size:13px!important}
.details-button,.close-details{border:1px solid #879596!important;border-radius:4px!important;background:#fff!important;color:#16191f!important}
.person-details.person-details{border:1px solid #d5dbdb!important;border-radius:6px!important;background:#fff!important;box-shadow:0 4px 12px rgb(0 0 0 / 14%)!important}
}`;

export const awsConsoleThemeStyles = `@layer gp-flat-chrome {
button{width:36px!important;height:36px!important;border:0!important;border-radius:4px!important;background:transparent!important;color:#414d5c!important}
button:hover{background:#f2f3f3!important;color:#16191f!important}
}`;
