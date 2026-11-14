#!/usr/bin/env python3
"""Validate generated font coverage, attribution, interpolation and UI numerals."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parent
for stem in ['PoshleySans', 'PoshleySans-Italic']:
    full = TTFont(root / f'{stem}-Variable.ttf')
    web = TTFont(root / f'{stem}-v120-Variable.woff2')
    assert full.getBestCmap() == web.getBestCmap()
    for face in [full, web, TTFont(root / f'{stem}-v120-Latin.woff2')]:
        assert face['name'].getDebugName(1) == 'Poshley Sans'
        assert 'Google' in face['name'].getDebugName(0), 'Retain original copyright'
        assert 'Open Font License' in face['name'].getDebugName(13)
        assert [(a.axisTag, a.minValue, a.maxValue) for a in face['fvar'].axes] == [('wght', 400, 700)]
        for name in face.getGlyphOrder():
            glyph = face['glyf'][name]
            points = len(glyph.components) if glyph.isComposite() else len(getattr(glyph, 'coordinates', []))
            for variation in face['gvar'].variations.get(name, []):
                assert len(variation.coordinates) == points + 4, (name, 'invalid variable contour topology')
    latin = TTFont(root / f'{stem}-v120-Latin.woff2')
    assert full.getBestCmap()[ord('a')].endswith('.alt')
    tabular = {}
    for record in latin['GSUB'].table.FeatureList.FeatureRecord:
        if record.FeatureTag == 'tnum':
            for index in record.Feature.LookupListIndex:
                for table in latin['GSUB'].table.LookupList.Lookup[index].SubTable:
                    tabular.update(getattr(getattr(table, 'ExtSubTable', table), 'mapping', {}))
    stems = []
    for weight in [400, 450, 500, 550, 600, 650, 700]:
        instance = instantiateVariableFont(latin, {'wght': weight}, inplace=False)
        glyphs = instance.getGlyphSet()
        for code in range(33, 127):
            name = instance.getBestCmap()[code]
            assert glyphs[name].width > 0, (stem, weight, code)
        letter = instance['glyf']['l']
        assert letter.numberOfContours == 1 and len(letter.coordinates) == 6
        stems.append(letter.coordinates[2][0] - letter.coordinates[1][0])
        seven = instance['glyf']['seven']
        assert seven.numberOfContours >= 2, 'Crossbar is retained across weights'
        # Tabular numerals must continue to align in dashboards and tables.
        digits = [instance.getBestCmap()[ord(n)] for n in '0123456789']
        assert all(n in tabular for n in digits), 'Tabular number feature survives subsetting'
        advances = {instance['hmtx'][tabular[n]][0] for n in digits}
        assert len(advances) == 1, (stem, weight, advances)
    assert all(b >= a for a, b in zip(stems, stems[1:])), 'Weight interpolation remains monotonic'
    assert stems[-1] > stems[0], 'Weight axis still changes the outlines'
    print(f'{stem}: coverage, attribution, variable contours, 7 weights and tabular alignment passed')
