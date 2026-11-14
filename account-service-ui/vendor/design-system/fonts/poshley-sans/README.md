# Poshley Sans · Greatley Poshley font kit

Poshley Sans is a self-hosted, modified UI derivative of the **open-licensed Google Sans** typeface, distributed under SIL OFL 1.1. Version **1.200** gives the interface its own character while retaining readable geometric forms. It is not an independently drawn typeface and is not affiliated with or endorsed by Google.

The Latin design uses a single-storey `a` from the upstream alternate family, slightly narrower round letters, a newly drawn footed `l`, a crossbarred `7`, a shorter and lower `Q` tail, and more open letter/word spacing. Upright and italic receive corresponding changes. See `FONTLOG.md` for precise design decisions and `design.py` for the reproducible modifications.

**There is no percentage-of-change rule that guarantees copyright or trademark clearance.** This kit relies on the upstream OFL permission to modify and redistribute the font, with its required notices and license retained. These visual differences are design choices, not a legal safe harbor.

Upright and true italic include continuous weights **400–700**. Internal family and PostScript names use Poshley Sans. The complete source character coverage is retained in each face; see `manifest.json` for counts. Unsupported scripts use the system fallback.

## Files

- `PoshleySans-v120-Variable.woff2` and `PoshleySans-Italic-v120-Variable.woff2`: application web fonts.
- `PoshleySans-v120-Latin.woff2` and `PoshleySans-Italic-v120-Latin.woff2`: compact UI subsets, loaded for Latin text and common punctuation. Other characters load the complete face only when used.
- Matching `.ttf` files: optional desktop/design installation.
- `OFL.txt`: original copyright and SIL Open Font License 1.1; keep with redistributed fonts.
- `TRADEMARKS.md`: upstream trademark notice.
- `source.json`: pinned official Google Fonts source revision, URLs, and checksums.
- `manifest.json`: generated output checksums, axes, and character coverage.
- `build.py`: verified source download, optical/grade instancing, glyph customization, family naming, and WOFF2 generation.
- `specimen.html`: local type specimen with a weight slider.

Import `@greatley-poshley/design-system/fonts.css`, or `clean.css` which includes it. Font files are packaged with the app and use `font-display: swap`; UI text does not depend on a remote font service. Each clean-layout app also publishes the license and trademark notice in `assets/fonts/poshley-sans/`.

```css
.product-interface {
  font-family: "greatley-poshley-sans", Arial, "Segoe UI", sans-serif;
  font-weight: 400;
}
.heading { font-weight: 600; }
.numeric-metric { font-variant-numeric: tabular-nums; }
```

Use 400 for body, 500 for controls/navigation, 600 for headings, and 700 for emphasis. Recommended UI sizes: 16px body, 15px controls, 13–14px metadata, 22px section headings, and 32px page headings. Do not replace icon fonts, monospaced code, or authored editor fonts.

Rebuild using Python 3 with `fonttools[woff]==4.68.0`, `brotli==1.2.1`, then `python build.py`. The script fetches checksum-pinned files over verified HTTPS. It never disables certificate verification or installs fonts system-wide. Offline source files can be supplied with `--source-dir` and are verified using the same checksums.

Upstream: [Google Sans project](https://github.com/googlefonts/googlesans), [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/googlesans). Original glyph copyright, license, and trademark metadata are preserved. Poshley Sans is distributed under SIL OFL 1.1, with no claim of authorship of the original glyph designs.
