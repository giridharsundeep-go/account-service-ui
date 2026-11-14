"""Poshley Sans 1.200 Latin UI design, applied before subsetting.

Changes preserve compatible contour topology and gvar phantom-point metrics.
No percentage of modification is represented as a legal clearance threshold.
"""
from array import array
import unicodedata
from functools import lru_cache

from fontTools.misc.roundTools import otRound
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates

DESIGN = {
    'latinRoundWidthScale': 0.96,
    'latinLetterSpacingUnits': 6,
    'wordSpaceIncreaseUnits': 10,
    'aForm': 'single-storey, using the upstream ss08 alternates',
    'lForm': 'new baseline foot for distinction from capital I',
    'sevenForm': 'new crossbar in proportional and tabular numerals',
    'qForm': 'shorter, lowered tail',
    'scope': 'Latin UI; original non-Latin script shaping retained',
}


def customize(font):
    glyf, metrics = font['glyf'], font['hmtx'].metrics
    report = {'outlines': [], 'spacing': [], 'defaultAlternates': []}

    def edit(name, draw):
        glyph = glyf[name]
        if glyph.isComposite() or glyph.numberOfContours <= 0:
            return
        original, controls = glyf._getCoordinatesAndControls(name, metrics)
        count = len(original) - 4
        points, ends, flags = draw(list(original[:count]), glyph.endPtsOfContours, glyph.flags)
        for variation in font['gvar'].variations.get(name, []):
            variation.calcInferredDeltas(original, controls.endPts)
            absolute = [(x + dx, y + dy) for (x, y), (dx, dy) in zip(original[:count], variation.coordinates[:count])]
            changed, _, _ = draw(absolute, glyph.endPtsOfContours, glyph.flags)
            variation.coordinates = [(otRound(x - bx), otRound(y - by)) for (x, y), (bx, by) in zip(changed, points)] + variation.coordinates[-4:]
        glyph.coordinates = GlyphCoordinates([(otRound(x), otRound(y)) for x, y in points])
        glyph.endPtsOfContours = list(ends)
        glyph.flags = array('B', flags)
        glyph.numberOfContours = len(ends)
        glyph.recalcBounds(glyf)
        # HVAR contains advance-width deltas only; preserve those and phantom
        # deltas. The base bearing follows the new outline, with no extra shift.
        metrics[name] = (metrics[name][0], glyph.xMin)
        report['outlines'].append(name)

    # Choose the existing, fully hinted/kerning-compatible single-storey family
    # for every precomposed a, including Vietnamese and other accented forms.
    alternate = {}
    for record in font['GSUB'].table.FeatureList.FeatureRecord:
        if record.FeatureTag == 'ss08':
            for index in record.Feature.LookupListIndex:
                for table in font['GSUB'].table.LookupList.Lookup[index].SubTable:
                    alternate.update(getattr(table, 'ExtSubTable', table).mapping)
    for table in font['cmap'].tables:
        if table.isUnicode():
            for code, name in list(table.cmap.items()):
                if name in alternate:
                    table.cmap[code] = alternate[name]
    report['defaultAlternates'] = sorted(alternate.values())

    # Slightly narrower round forms with unchanged advance widths, so existing
    # kerning pairs and variable metrics remain valid. Accented composites inherit
    # their base outlines; unrelated scripts/marks are left alone.
    for name in sorted(set('bcdeghnopqsuCDGOQS') | {'a.alt'}):
        width = metrics[name][0]
        edit(name, lambda p, e, f, width=width: ([(x * .96 + width * .02, y) for x, y in p], e, f))

    # Distinguishable lowercase l: same ascender/slant, with a short baseline foot.
    # Construct each variable master from its original stem, including italic.
    def foot(p, ends, flags):
        left, top_left, top_right, right = p
        height = right[0] - left[0]
        slant = (top_left[0] - left[0]) / (top_left[1] - left[1])
        foot_x = right[0] + slant * height
        return ([left, top_left, top_right, (foot_x, height), (foot_x + 76, height), (right[0] + 76, 0)], [5], [1] * 6)
    edit('l', foot)
    metrics['l'] = (metrics['l'][0] + 76, metrics['l'][1])
    # Composite accented l forms use the same foot and need its extra advance.
    @lru_cache(maxsize=None)
    def has_l(name):
        return name == 'l' or (glyf[name].isComposite() and any(has_l(c.glyphName) for c in glyf[name].components))
    for name in font.getGlyphOrder():
        if name != 'l' and has_l(name):
            metrics[name] = (metrics[name][0] + 76, metrics[name][1])

    # Crossbarred 7, also in tabular/alternate numbers. Match the slant of italic.
    italic = bool(font['OS/2'].fsSelection & 1)
    for name in ['seven', 'seven.tf', 'seven.ss03']:
        if name not in glyf or glyf[name].isComposite():
            continue
        width = metrics[name][0]
        def crossbar(p, e, f, width=width):
            # Stem thickness is inferred from the top bar in every weight master.
            top = max(y for x, y in p)
            upper = sorted({y for x, y in p if top - 200 < y < top})
            thickness = max(55, min(110, (top - upper[-1]) * .78)) if upper else 64
            x, y = width * .51, 350
            skew = .212 if italic else 0
            # Clockwise contour matches the original filled outline.
            bar = [(x - 103, y - thickness / 2), (x - 103 + skew * thickness, y + thickness / 2), (x + 103 + skew * thickness, y + thickness / 2), (x + 103, y - thickness / 2)]
            return (p + bar, list(e) + [len(p) + 3], list(f) + [1] * 4)
        edit(name, crossbar)
        glyf[name].flags[0] |= 0x40  # OVERLAP_SIMPLE, intentional bar/diagonal join.

    def q_tail(p, ends, flags):
        first, last = ends[0] + 1, ends[1] + 1
        return ([(x + 20, y * .8 - 24) if first <= i < last else (x, y) for i, (x, y) in enumerate(p)], ends, flags)
    edit('Q', q_tail)

    letters = set()
    for code, name in font.getBestCmap().items():
        if 'LATIN' in unicodedata.name(chr(code), '') or 0x30 <= code <= 0x39:
            letters.add(name)
    letters.update(alternate.keys())
    letters.update(alternate.values())
    letters.update(n for n in font.getGlyphOrder() if n.endswith('.tf') and n.split('.')[0] in ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'])
    for name in sorted(letters):
        advance, bearing = metrics[name]
        if advance > 0:
            metrics[name] = (advance + 6, bearing)
            report['spacing'].append(name)
    for name in ['space', 'uni00A0']:
        if name in metrics:
            metrics[name] = (metrics[name][0] + 10, metrics[name][1])
    # Only Latin composites whose bases changed need their bounds refreshed.
    changed = set(report['outlines'])
    @lru_cache(maxsize=None)
    def affected(name):
        return name in changed or (glyf[name].isComposite() and any(affected(c.glyphName) for c in glyf[name].components))
    for name in font.getGlyphOrder():
        if glyf[name].isComposite() and affected(name):
            glyf[name].recalcBounds(glyf)
    return report
