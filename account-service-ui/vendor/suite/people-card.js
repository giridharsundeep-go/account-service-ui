import {cleanVisualStyles,borderlessVisualStyles} from './clean-visual-system.js';
import {peopleVisualStyles,awsConsolePeopleStyles} from './visual-system.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function actorKind(id, type) {
  if (String(type || '').toUpperCase() === 'AGENT' || Number(id) < 0) return 'AGENT';
  if (String(type || '').toUpperCase() === 'SYSTEM') return 'SYSTEM';
  return String(type || '').toUpperCase() === 'HUMAN' || Number(id) > 0 ? 'HUMAN' : 'UNASSIGNED';
}
const actorSvg = kind => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kind === 'AGENT' ? '<path d="M12 3v3M9 3h6"/><rect x="5" y="6" width="14" height="14" rx="3"/><path d="M2 11v5m20-5v5M9 16h6"/><circle cx="9" cy="11" r=".8"/><circle cx="15" cy="11" r=".8"/>' : kind === 'SYSTEM' ? '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/>' : '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'}</svg>`;
function defineActorIcon() {
  if (customElements.get('gp-actor-icon')) return;
  customElements.define('gp-actor-icon', class extends HTMLElement {
    static observedAttributes = ['actor-id', 'actor-type'];
    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }
    render() {
      const kind = actorKind(this.getAttribute('actor-id'), this.getAttribute('actor-type'));
      this.setAttribute('role', 'img');this.setAttribute('aria-label', {HUMAN:'Human',AGENT:'Agent',SYSTEM:'System',UNASSIGNED:'Unassigned'}[kind]);this.dataset.actorKind=kind;
      const root=this.shadowRoot || this.attachShadow({mode:'open'});
      root.innerHTML='<style>:host{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex:0 0 auto;width:18px;height:18px;color:inherit;line-height:1}svg{width:100%;height:100%;display:block}</style>'+actorSvg(kind);
    }
  });
}
// Shared compact identity cards with explicit, adjacent profile details.
export function definePeopleCard() {
  if (typeof window === 'undefined') return;
  defineActorIcon();
  if (customElements.get('gp-person-card')) return;
  customElements.define('gp-person-card', class extends HTMLElement {
    _person = {}; _selected = false; _selectable = false;
    set person(value) { this._person = value || {}; this.render(); }
    get person() { return this._person; }
    set selected(value) { this._selected = !!value; this.updateSelection(); }
    set selectable(value) { this._selectable = !!value; this.updateSelection(); }
    connectedCallback() { this.render(); }
    disconnectedCallback() { this.disposeDetails?.(); }
    updateSelection() {
      const card = this.shadowRoot?.querySelector('article');
      if (!card) return;
      card.classList.toggle('selected', this._selected);
      card.classList.toggle('selectable', this._selectable);
      this.tabIndex = this._selectable ? 0 : -1;
      this.setAttribute('role', this._selectable ? 'checkbox' : 'article');
      this.setAttribute('aria-label', card.getAttribute('aria-label'));
      if(this._selectable)this.setAttribute('aria-checked',String(this._selected));
      else this.removeAttribute('aria-checked');
      const check = card.querySelector('.check');
      check.hidden = !this._selectable;
      check.textContent = this._selected ? '✓' : '+';
    }
    render() {
      if (!this.isConnected) return;
      this.disposeDetails?.();
      const p = this._person;
      const name = p.name || p.fullName || p.full_name || [p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).join(' ') || 'Colleague';
      const designation = (typeof p.designation === 'object' ? p.designation?.name : p.designation) || p.designationName || p.designation_name;
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      const avatar = p.avatarUrl || p.avatar_url || p.avatar || p.profilePictureUrl || p.profile_picture_url || p.profileImageUrl || p.profile_image_url || '';
      const root = this.shadowRoot || this.attachShadow({mode:'open'});
      root.innerHTML = `<style>
:host{display:block;min-width:0;height:100%;font-family:'Google Sans',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}
article{height:100%;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;background:var(--gp-surface,#fff);border:1px solid var(--gp-border-color, #a0a6b1);border-radius:10px;box-shadow:0 3px 12px #172b4d14;padding:0 16px 16px;text-align:center;color:var(--gp-text,#202732);transition:border-color .15s,box-shadow .15s}
article.selectable{cursor:pointer}article.selectable:hover{box-shadow:0 5px 18px #172b4d20;border-color:var(--gp-border-color, #a0a6b1)}:host(:focus-visible) article{outline:2px solid #175fc2;outline-offset:-3px}article.selected{border-color:var(--gp-border-color, #a0a6b1);box-shadow:0 0 0 1px #175fc2,0 3px 12px #172b4d14}
.cover{width:calc(100% + 32px);height:78px;flex-shrink:0;background:var(--gp-surface-muted,#fff);object-fit:cover;object-position:center 43%}.avatar{width:64px;height:64px;flex-shrink:0;position:relative;margin:-32px 0 12px;border:3px solid var(--gp-border-color, #a0a6b1);border-radius:50%;display:grid;place-items:center;background:#3c9b68;color:white;font-size:22px;font-weight:700;overflow:hidden}.avatar[data-tone="0"]{background:#ed7d2d}.avatar[data-tone="1"]{background:#d94b58}.avatar[data-tone="3"]{background:#1764d4}.avatar[data-tone="4"]{background:#6557c8}.avatar img{width:100%;height:100%;object-fit:cover}
.copy{display:flex;flex-direction:column;gap:7px;min-width:0;width:100%;flex:1}.copy strong{font-size:17px;line-height:1.35;overflow-wrap:anywhere}.designation{font-size:14px;color:var(--gp-muted,#596579);line-height:1.4}.email{font-size:13px;color:var(--gp-muted,#69778e);overflow-wrap:anywhere;line-height:1.5}.check{position:absolute;top:10px;right:10px;width:26px;height:26px;display:grid;place-items:center;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:6px;background:var(--gp-surface,#fff);color:var(--gp-muted,#596579);font-size:18px}.selected .check{background:#175fc2;border-color:var(--gp-border-color, #a0a6b1);color:white}
@media(prefers-reduced-motion:reduce){article{transition:none}}
${peopleVisualStyles}
:host{position:relative}.copy{padding-right:38px}.selectable .copy{padding-right:70px}.details-button{position:absolute;top:12px;right:12px;grid-column:2;justify-self:end;width:34px;height:34px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:50%;background:var(--gp-surface,#fff);color:var(--gp-text,#151519);cursor:pointer;font:20px system-ui}.selectable .details-button{right:42px}.person-details{padding:20px;margin-top:8px;border:1px solid var(--gp-border-color, #a0a6b1);border-radius:16px;box-shadow:var(--gp-float-shadow);background:var(--gp-surface,#fff);color:var(--gp-text,#151519);text-align:left}.person-details h3{margin:0 30px 16px 0}.person-details dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;margin:0;font-size:14px}.person-details dd{margin:0;overflow-wrap:anywhere}.person-details dt{color:var(--gp-muted,#68686e)}.close-details{float:right;border:0;background:none;color:inherit;font-size:24px;cursor:pointer}
${cleanVisualStyles('people')}${borderlessVisualStyles('people')}${awsConsolePeopleStyles}
</style><article aria-label="${escape(name + ', ' + (designation || 'Designation not set'))}"><span class="avatar" data-tone="${Math.abs(Number(p.id || p.userId || 0)) % 5}">${escape(initials)}</span><div class="copy"><strong><gp-actor-icon actor-id="${escape(p.id || p.userId)}" actor-type="${escape(p.actorType)}"></gp-actor-icon> <span class="person-name" title="${escape(name)}">${escape(name)}</span></strong><span class="designation" title="${escape(designation || 'Designation not set')}">${escape(designation || 'Designation not set')}</span></div><button class="details-button" type="button" aria-label="View profile details" aria-expanded="false" aria-haspopup="dialog">ⓘ</button><span class="check" aria-hidden="true" hidden></span></article><section class="person-details" popover="manual" hidden role="dialog" aria-label="Profile details"><button type="button" class="close-details" aria-label="Close profile">×</button><h3>${escape(name)}</h3><dl>${[["Designation",designation],["Email",p.email],["Department",p.department],["Division",p.division],["Function",p.functionName],["Location",p.location||p.city],["Phone",p.phone],["Employee ID",p.employeeCode||p.employee_id]].filter(([,value])=>value).map(([label,value])=>`<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></section>`;
      if (avatar) {
        const image = document.createElement('img'); image.src = avatar; image.alt = name;
        image.onerror = () => image.replaceWith(document.createTextNode(initials));
        root.querySelector('.avatar').replaceChildren(image);
      }
      const details=root.querySelector('.person-details'),detailsButton=root.querySelector('.details-button');
      let nativeOpen=false;
      const placeDetails=()=>{
        const rect=this.getBoundingClientRect(),width=details.getBoundingClientRect().width;
        const viewportWidth=document.documentElement.clientWidth||window.innerWidth;
        const viewportHeight=window.innerHeight;
        details.style.left=Math.max(12,Math.min(rect.left,viewportWidth-width-12))+'px';
        const height=details.getBoundingClientRect().height;
        details.style.top=Math.max(12,Math.min(rect.bottom+6,viewportHeight-height-12))+'px';
      };
      const toggleDetails=open=>{
        if(!open&&nativeOpen){details.hidePopover();nativeOpen=false;}
        details.hidden=!open;detailsButton.setAttribute('aria-expanded',String(open));
        if(open){
          if(typeof details.showPopover==='function'){details.showPopover();nativeOpen=true;}
          placeDetails();root.querySelector('.close-details').focus();
        }
      };
      const outside=event=>{if(!details.hidden&&!event.composedPath().includes(this))toggleDetails(false);};
      const reposition=()=>{if(!details.hidden)placeDetails();};
      document.addEventListener('pointerdown',outside);
      window.addEventListener('resize',reposition);
      document.addEventListener('scroll',reposition,true);
      this.disposeDetails=()=>{toggleDetails(false);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',reposition);document.removeEventListener('scroll',reposition,true);};
      detailsButton.onclick=event=>{event.stopPropagation();toggleDetails(details.hidden);};
      root.querySelector('.close-details').onclick=event=>{event.stopPropagation();toggleDetails(false);detailsButton.focus();};
      details.onkeydown=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();toggleDetails(false);detailsButton.focus();}
        if(event.key==='Tab'){event.preventDefault();root.querySelector('.close-details').focus();}
      };
      detailsButton.onkeydown=event=>event.stopPropagation();
      const choose = () => { if (this._selectable) this.dispatchEvent(new CustomEvent('gp-person-select', {detail:this._person, bubbles:true, composed:true})); };
      root.querySelector('article').onclick = choose;
      this.onkeydown = event => { if(event.composedPath().some(node=>node.tagName==='BUTTON'))return; if (this._selectable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(); } };
      this.updateSelection();
    }
  });
}
