// Canonical filled app symbols and the shared company mark. Each app publishes assets/brand.
export const brandMarkUrl='assets/brand/rainbow-seven.svg';
const symbols={"people":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0","support":"M12 1a10 10 0 0 1 10 10v7a4 4 0 0 1-4 4h-4v-3h4a1 1 0 0 0 1-1v-1h-3v-7h3a7 7 0 0 0-14 0h3v7H4a3 3 0 0 1-3-3v-3A11 11 0 0 1 12 1ZM10 19h4v4h-4Z","professy":"M3 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM10 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2ZM17 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z","chatly":"M5 2h14a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H9l-7 4V6a4 4 0 0 1 3-4ZM6 7v2h12V7ZM6 12v2h9v-2Z","documents":"M5 1h10l7 7v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2ZM15 2v7h6ZM7 13v2h11v-2ZM7 18v2h8v-2Z","calendar":"M6 0h2v4H6ZM17 0h2v4h-2ZM4 3h1v3h4V3h7v3h4V3h1a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM5 10v4h4v-4ZM11 10v4h4v-4ZM17 10v4h4v-4ZM5 16v4h4v-4ZM11 16v4h4v-4ZM17 16v4h4v-4Z","sheets":"M5 1h11l6 6v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2ZM16 2v6h5ZM6 11v3h5v-3ZM13 11v3h6v-3ZM6 16v4h5v-4ZM13 16v4h6v-4Z","slides":"M3 2h19a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-8v3h4v2H7v-2h4v-3H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM9 6v9l8-4.5Z","meetings":"M3 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM20 8l5-4v16l-5-4ZM6 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z","forge":"M3 1a3 3 0 1 1-1 5.8v10.4A3 3 0 1 1 0 17V6.8A3 3 0 0 1 3 1ZM20 1a3 3 0 1 1-1 5.8V10a7 7 0 0 1-7 7H8v-3h4a4 4 0 0 0 4-4V6.8A3 3 0 0 1 20 1Z","instru":"M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10H2ZM10 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v18h-6ZM18 8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14h-6Z","mail":"M3 3h19a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 5v3l9.5 7L22 8V5l-9.5 7Z","identity":"M12.5 0 23 4v7c0 7-10.5 13-10.5 13S2 18 2 11V4ZM12.5 6a3.5 3.5 0 0 0-1.5 6.7V17h3v-4.3A3.5 3.5 0 0 0 12.5 6Z"};
export const appIconPath=id=>symbols[id]||symbols.professy;
// Company uses the full rainbow; each app keeps a fixed three-color subset everywhere.
export const brandColors=Object.freeze(['#f32937','#ff8317','#ffcf00','#24a151','#147aff','#5840d5','#b72bbd']);
// Curated once from the rainbow, so an app's identity never changes between renders.
const appPalettes=Object.freeze({
 professy:[4,5,2], chatly:[1,6,4], documents:[4,3,5], calendar:[3,1,4],
 sheets:[3,2,4], slides:[1,2,6], meetings:[5,3,0], forge:[6,4,1],
 instru:[0,1,5], mail:[0,4,3], identity:[5,2,0], support:[4,6,1], people:[5,4,6]
});
const appBands=[
 'M0 0h32v32H0Z',
 'M34 6v28H-2V20C6 14 18 9 34 6Z',
 'M34 19v15H4C12 25 22 21 34 19Z'
];
const seven='M5 2h23a2 2 0 0 1 2 2v2c0 1-.2 1.5-.6 2.4L18.5 29a1.8 1.8 0 0 1-1.7 1H9a1.5 1.5 0 0 1-1.4-2.2L17 10H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z';
const bands=[
 'M0 0h32v32H0Z',
 'M13-2h21v36H-2V11C7 10 15 4 13-2Z',
 'M22-2h12v36H-2V17C6 13 21 6 22-2Z',
 'M34 5v29H-2V23C6 15 14 9 34 5Z',
 'M34 13v21H-2v-5C6 21 17 15 34 13Z',
 'M34 20v14H4C9 26 21 22 34 20Z',
 'M34 26v8H8C13 29 23 27 34 26Z'
];
export function appLogoSvg(id){
 const path=id==='company'?seven:appIconPath(id);
 const shape=path;
 const transform=id==='company'?'':' transform="translate(3 3) scale(1.08)"';
 const colorBands=id==='company'?bands:appBands;
 const colors=id==='company'?brandColors:(appPalettes[id]||appPalettes.professy).map(i=>brandColors[i]);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><clipPath id="brand-shape"><path d="${shape}"${transform} fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#brand-shape)">${colorBands.map((band,i)=>`<path d="${band}" fill="${colors[i]}"/>`).join('')}</g></svg>`;
}
export const appLogo=id=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(appLogoSvg(id));
export function defineBrand(){if(typeof customElements==='undefined'||customElements.get('gp-brand'))return;customElements.define('gp-brand',class extends HTMLElement{
 static get observedAttributes(){return ['app','name','icon-only'];}
 connectedCallback(){if(!this.shadowRoot)this.attachShadow({mode:'open'});this.render();}attributeChangedCallback(){if(this.shadowRoot)this.render();}
 render(){const root=this.shadowRoot;root.innerHTML=`<style>:host{display:inline-flex;vertical-align:middle;color:var(--gp-text,#14151a);font-family:var(--gp-font,system-ui);min-width:0}.lockup{display:inline-flex;align-items:center;gap:12px;min-width:0}.mark-frame{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;flex-shrink:0}.mark{width:44px;height:44px;object-fit:contain;display:block}:host(:not([app])) .mark{width:44px;height:44px;max-width:none}.name{font-weight:var(--gp-brand-weight,780);font-size:var(--gp-brand-size,21px);letter-spacing:var(--gp-brand-tracking,-.65px);white-space:nowrap}:host([icon-only]) .name{display:none}:host([icon-only]) .mark-frame,:host([icon-only]) .mark{width:36px;height:36px}@media(max-width:600px){.mark-frame,.mark{width:36px;height:36px}:host(:not([app])) .mark{width:36px;height:36px}.name{font-size:18px}.lockup{gap:8px}}</style><span class="lockup"><span class="mark-frame"><img class="mark" width="44" height="44" alt=""></span><span class="name"></span></span>`;root.querySelector('img').src=this.hasAttribute('app')?appLogo(this.getAttribute('app')):brandMarkUrl;root.querySelector('.name').textContent=this.getAttribute('name')||'Greatley Poshley';if(!this.hasAttribute('aria-label'))this.setAttribute('aria-label',this.getAttribute('name')||'Greatley Poshley');}
});}
