# Poshley Sans FONTLOG

## 1.200 · 9 November 2026

Greatley Poshley modifications to the checksum-pinned Google Sans OFL source:

- Make the existing upstream `ss08` single-storey `a` family the default, including its accented forms. The alternate outlines remain credited to the original authors.
- Narrow the outlines of selected round Latin forms (`a.alt`, `b c d e g h n o p q s u`, `C D G O Q S`) to 96% around their advance center. Advance widths and original kerning adjustments are preserved during this transformation. This produces slightly less circular counters and more space around round letters.
- Draw a short baseline foot for lowercase `l`, preserving its ascender and italic slant. Extend its advance by 76 units to prevent collisions. Composite accented `l` letters inherit the foot and matching advance.
- Add a crossbar to proportional, tabular, and alternate `7`. Its thickness follows the original top bar across weight masters. The italic version follows the face's slant.
- Shorten the separate `Q` tail vertically to 80% and move it 24 units down and 20 units right, following the round-form transformation.
- Add 6 units to Latin letter/digit advances and 10 units to ordinary/nonbreaking word spaces. One em is 1000 units; these are deliberate, modest spacing changes rather than CSS tracking overrides.
- Apply matching transformations to every weight master and preserve gvar phantom-point deltas and HVAR advance-width variations. Retain continuous 400–700 weights and true italic.
- Retain full character coverage and the original script-shaping tables. Composite glyphs that reference modified Latin bases inherit those base changes. Combining accents continue to use source mark positioning.
- Use versioned web asset names so running applications load the new glyphs instead of cached 1.100 files. Keep self-hosting, script-based subsets, embedded notices, and desktop TTFs.

These choices create a distinct Latin UI voice. They do **not** establish a percentage of originality or guarantee legal clearance. Permission for modification and redistribution comes from the SIL Open Font License 1.1. The derivative remains OFL licensed; the original copyright, license, and trademark notices remain included. This font is not affiliated with or endorsed by Google.

## 1.100

Initial Google Sans UI derivative: family renaming, fixed optical size 18/grade 0, retained weight variation, full/Latin web faces, local application integration, and upstream license preservation. This edition did not alter the source letter shapes.
