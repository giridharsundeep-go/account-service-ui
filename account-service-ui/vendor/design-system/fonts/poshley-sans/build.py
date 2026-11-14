#!/usr/bin/env python3
"""Rebuild the Poshley Sans UI derivative from pinned, verified Google Sans OFL sources.

Requires fonttools[woff] 4.68.0 and brotli 1.2.1. Uses curl's verified HTTPS
transport; never disables certificate verification. No system font install.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile

from design import customize, DESIGN
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont


def build(source_dir=None):
    root = Path(__file__).resolve().parent
    source = json.loads((root / 'source.json').read_text())
    outputs = {}
    faces = []
    modifications = {}
    latin = set(range(0x0000, 0x0100)) | set(range(0x0300, 0x0370)) | set(range(0x2000, 0x2070)) | set(range(0x20A0, 0x20D0)) | {0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC, 0x2113, 0xFEFF, 0xFFFD}
    def ranges(points):
        groups=[]
        for n in sorted(points):
            if groups and groups[-1][1]+1==n: groups[-1][1]=n
            else: groups.append([n,n])
        return ','.join('U+%X'%a if a==b else 'U+%X-%X'%(a,b) for a,b in groups)
    def face(name, style, points):
        return '@font-face {\n  font-family: "greatley-poshley-sans";\n  src: url("./fonts/poshley-sans/'+name+'") format("woff2");\n  font-style: '+style+';\n  font-weight: 400 700;\n  font-display: swap;\n  unicode-range: '+ranges(points)+';\n}\n'

    with tempfile.TemporaryDirectory(prefix='poshley-sans-') as temp:
        for italic, filename in [(False, 'GoogleSans[GRAD,opsz,wght].ttf'), (True, 'GoogleSans-Italic[GRAD,opsz,wght].ttf')]:
            metadata = source['files'][filename]
            path = Path(source_dir) / filename if source_dir else Path(temp) / filename
            if not source_dir:
                subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', metadata['url'], '--output', str(path)], check=True)
            assert hashlib.sha256(path.read_bytes()).hexdigest() == metadata['sha256'], f'Unexpected upstream font: {filename}'
            original = TTFont(path, recalcTimestamp=False)
            characters = set(original.getBestCmap())
            # A consistent UI optical master; weight still varies continuously.
            font = instantiateVariableFont(original, {'opsz': 18, 'GRAD': 0}, inplace=False)
            font.recalcTimestamp = False
            print(f'Designing {filename}...', flush=True)
            modifications['italic' if italic else 'normal'] = customize(font)
            print('Design complete; exporting faces...', flush=True)
            suffix = 'Italic' if italic else 'Regular'
            names = font['name']
            for record in names.names:
                if record.nameID in (0, 7, 8, 9, 11, 13, 14):
                    continue  # Preserve upstream copyright and license verbatim.
                value = record.toUnicode().replace('Google Sans', 'Poshley Sans').replace('GoogleSans', 'PoshleySans')
                record.string = value.encode(record.getEncoding(), errors='replace')
            replacements = {
                1: 'Poshley Sans', 2: suffix,
                3: f'GreatleyPoshley:PoshleySans-{suffix}:1.200',
                4: f'Poshley Sans {suffix}', 5: 'Version 1.200; Poshley Sans UI derivative', 6: f'PoshleySans-{suffix}',
                16: 'Poshley Sans', 17: suffix, 25: 'PoshleySans',
                10: 'Poshley Sans 1.200: modified OFL UI derivative with single-storey a defaults, narrower round forms, a footed l, crossbarred 7, a revised Q tail and adjusted Latin spacing. Original design by the Google Sans Project Authors; modifications by Greatley Poshley. No Google affiliation or endorsement.',
            }
            for name_id, value in replacements.items():
                names.removeNames(nameID=name_id)
                names.setName(value, name_id, 3, 1, 0x409)
                names.setName(value, name_id, 0, 4, 0)
            font['head'].fontRevision = 1.2
            assert set(font.getBestCmap()) == characters, 'Character coverage changed'
            stem = 'PoshleySans-Italic' if italic else 'PoshleySans'
            for extension, flavor in [('ttf', None), ('woff2', 'woff2')]:
                font.flavor = flavor
                target = root / (f'{stem}-Variable.ttf' if extension == 'ttf' else f'{stem}-v120-Variable.woff2')
                font.save(target)
                check = TTFont(target)
                assert check['name'].getDebugName(1) == 'Poshley Sans'
                assert set(check.getBestCmap()) == characters
                assert [(a.axisTag, a.minValue, a.maxValue) for a in check['fvar'].axes] == [('wght', 400, 700)]
                assert check['OS/2'].fsSelection & 1 == int(italic)
                outputs[target.name] = {'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'characters': len(characters)}
            # Load the small Latin face for common UI text. Other characters use
            # the full face only when needed; the desktop TTF retains everything.
            style = 'italic' if italic else 'normal'
            faces.append(face(f'{stem}-v120-Variable.woff2', style, characters - latin))
            font = TTFont(root / f'{stem}-Variable.ttf', recalcTimestamp=False)
            options = subset.Options()
            options.layout_features = ['*']
            options.name_IDs = ['*']
            options.name_languages = ['*']
            options.name_legacy = True
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=characters & latin)
            subsetter.subset(font)
            font.flavor = 'woff2'
            target = root / f'{stem}-v120-Latin.woff2'
            font.save(target)
            check = TTFont(target)
            assert set(check.getBestCmap()) == characters & latin
            assert check['name'].getDebugName(13), 'Keep the embedded license'
            outputs[target.name] = {'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'characters': len(check.getBestCmap())}
            faces.append(face(target.name, style, characters & latin))
    (root / 'fonts.css').write_text('/* Poshley Sans: modified OFL UI derivative, version 1.200. See fonts/poshley-sans/OFL.txt and TRADEMARKS.md. */\n' + '\n'.join(faces))
    (root / 'manifest.json').write_text(json.dumps({'family': 'Poshley Sans', 'version': '1.200', 'upstreamCommit': source['commit'], 'opticalSize': 18, 'grade': 0, 'weightRange': [400, 700], 'design': DESIGN, 'modifications': modifications, 'outputs': outputs}, indent=2) + '\n')
    print(json.dumps(outputs, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Use already downloaded, checksum-verified source files')
    build(parser.parse_args().source_dir)
