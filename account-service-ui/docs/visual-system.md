# Greatley Poshley clean visual system

The non-Post apps follow the requested clean workspace reference: white surfaces, pale navigation, readable regular text, medium-weight headings, open tables with horizontal separators, and restrained blue selections. Post retains its existing layout. The main header of each product uses that product’s canonical logo and name; login and registration use only the rainbow 7.

## Shared contract

| Element | Standard |
| --- | --- |
| Typography | Self-hosted Poshley Sans; 32px/600 page titles, 16–17px row titles, 13–16px supporting text |
| Background | White in light mode; shared neutral dark surfaces in dark mode |
| Search | 50px capsule, leading icon, one outer border and visible keyboard focus |
| Actions | 46px capsule buttons, blue primary action, neutral outlined secondary action |
| Forms | 50px fields, 10px corners, continuous single border, no nested input box |
| People | Compact avatar/name/designation rows; human and agent identity icons remain distinct |
| Avatars | Circles; existing identity-based colors retained |
| Navigation | Consistent spacing, rounded selection, shared icon/text sizes |
| Lists and tables | White headers, horizontal separators, no vertical grid borders on UI tables, consistent selection color |
| Dialogs | 20px corners, consistent 24px interior spacing, shared actions |
| Motion | 160ms feedback, 280ms panels, 380ms page fade; reduced-motion preference respected |
| Page frame | Full available width with 20–44px responsive horizontal padding; 16px on small screens |
| Branding | Filled three-color app symbols; app logo and name in the main brand position, without duplicate labels |

Large decorative list-page banners are replaced by compact page headings. Profile covers remain profile content. Document text, spreadsheet cells and slide objects retain their authored content and formatting; the shared rules apply to their surrounding UI.

## Implementation

`@greatley-poshley/design-system/clean.css` is the **first import in the existing `src/styles.css`** of Astra, Relay, Folio, Tempo, Access, Grid, Prism, Gather, Forge, and Instru. Their HTML roots have `data-gp-layout="clean"`. Both are required: the early `gp-clean` layer gives its important rules precedence over the legacy `gp-post`/`gp-clarity` layers. Every new global layout selector is explicitly scoped to the opt-in attribute. Keep the import before theme and legacy styles. Use the already watched stylesheet, rather than adding a new Angular global style entry that an existing development server will not load until it restarts.

`clean.css` imports the self-hosted `fonts.css` and shared `auth.css`. Post imports only `fonts.css` and sets the shared `--gp-font` token; it has neither `clean.css` nor the layout attribute, preserving its existing layout while using the same Poshley Sans typography. Existing shared styles remain intact for backward compatibility.

`/Users/giridharsundeep/Documents/projects/greatley-poshley-suite/clean-visual-system.js` applies equivalent opt-in styles inside workspace, Apps, theme toggle, and people-card shadow roots. It returns no clean styles for Post or a page without the layout attribute. `visual-system.js` remains the legacy baseline. Linked suite code stays excluded from development prebundling.

For a future component, use semantic classes (`button primary`, `search-field`, `surface`, `workspace-heading`) and the shared variables. Preserve contextual status/severity colors, focus indicators, editor geometry, data selection and application-specific navigation behavior.

## Validation

Compile the apps without starting them. Run `node --test scripts/clean-layout.test.mjs scripts/suite-icons.test.mjs` for layout opt-in, product-brand, editor-font preservation, font assets, and people-card checks. Run the Angular tests in `auth-layout.spec.ts` for registration steps, validation, the sign-in bridge, and the canonical app gallery. Bundle checks should confirm the local web fonts and OFL/trademark assets in each non-Post app. Visual pixel matching across every page has not been verified; no application/browser session was launched.


## Canonical logos

`/Users/giridharsundeep/Documents/projects/greatley-poshley-suite/brand.js` contains the company 7, product silhouettes, and shared rainbow palette. The company uses all seven colors; each app uses a fixed three-color subset. `appLogo()` is used by app launchers, headers and editor toolbars. Keep each app’s color subset stable across renders. Do not introduce a separate icon path or gradient in a consumer.

Each app publishes the main mark at `assets/brand/rainbow-seven.svg`. This is an application asset, never a library-relative `import.meta.url` resource. `npm run sync:brand` generates both the company asset and each app's favicon from the same source. It runs automatically before `npm start` and `npm run build`.

The Angular `WorkspaceBrand` defaults to Astra. Standalone workspace headers and office editor headers use the matching product mark/name. Login and registration pass the empty app with `iconOnly` to show the company 7 without a wordmark. The shared web brand uses `icon-only` for the same result. Product names stay visible at compact header widths.

Post UI motion is limited to interface surfaces: page fade, panel entrance, color feedback, subtle hover elevation and press feedback. Page motion does not transform ancestors of fixed dialogs. Rich document text, spreadsheet cells, slide objects and video content keep their own geometry and formatting. The shadow-DOM workspace shell, Apps launcher and people cards consume the same motion tokens.

## Poshley Sans font kit

The current **1.200** kit is a modified, self-hosted derivative of the [OFL-licensed Google Sans source](https://github.com/google/fonts/tree/main/ofl/googlesans). It retains continuous weights 400–700 and true italic, while introducing a single-storey `a` default, narrower round Latin forms, a footed `l`, a crossbarred `7`, a revised `Q` tail, and adjusted Latin/word spacing. The single-storey alternate is credited to the upstream authors; the other modifications are reproducible in `design.py`.

This is a licensed derivative, not an independently drawn typeface. A “10–20% change” is not a copyright safe harbor. Redistribution relies on the SIL Open Font License; its original copyright, license, and trademark notices remain embedded and bundled. There is no Google affiliation or endorsement. See the kit's `FONTLOG.md` for precise changes.

The kit lives at `/Users/giridharsundeep/Documents/projects/greatley-poshley-design-system/fonts/poshley-sans/`. It includes desktop TTFs, WOFF2s, the upstream license/trademark notices, pinned source checksums, an output manifest, a reproducible build script, interpolation/coverage validation, `FONTLOG.md`, and `specimen.html`. Import `@greatley-poshley/design-system/fonts.css` for another consumer. Use the shared `--gp-font` for UI code; do not reintroduce remote Google Sans links.

The UI font normalization excludes Material Icons, other icon classes, code/preformatted text, authored document pages, workbook cells, slide canvases/presentations, and explicit user-selected font families. Web fonts use `font-display: swap`. System fonts remain a fallback for characters not supplied by a face. Copyright and license metadata remain embedded, and all eleven apps, including Post, distribute the notices as assets.

## Login and registration

Access and Astra’s sign-in bridge/registration use the same white layout: an 84px logo-only header, equal-width desktop halves, the product logo gallery on the left, and the form on the right. On screens below 800px the form is first, followed by the compact app gallery. The gallery uses the canonical ten product logos and names; it does not navigate away from an unfinished form.

Registration keeps its organisation/account/plan steps, existing form bindings, validation, and APIs. Sign-in retains the shared SSO flow, remember-me option, password visibility, password recovery, and account creation link. The auth surface has no workspace sidebar or extra header actions. `AuthAppGallery` shares the same registry as the Access template; `appRegistry()` is safe during server rendering.

## Shared border color

All eleven apps, including Post, use `#a0a6b1` through `--gp-border-color` in the shared `borders.css`. Field, hover/focus-border, separator, card, menu, and Material outline tokens resolve to this color in both themes. Legacy component styles and shadow-DOM styles reference the same token. Existing border widths, radii, transparent borders, and borderless controls retain their geometry. Authored document, slide, and spreadsheet borders remain content formatting.
