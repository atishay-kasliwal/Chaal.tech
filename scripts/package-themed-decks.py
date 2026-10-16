"""Package individual exports locally, keeping large ZIPs out of public hosting."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

repo = Path(__file__).resolve().parent.parent
for root in sorted((repo / 'static/cards').iterdir()):
    if root.name == 'diwali-taash' or not (root / 'manifest.json').exists():
        continue
    manifest = json.loads((root / 'manifest.json').read_text())
    design = repo / 'design/decks' / root.name
    production = f'''# {manifest['name']} — individual deck v1

52 faces and one reversible back, supplied as standalone SVGs and transparent 700 × 1000 PNGs. Each SVG uses a 280 × 400 viewBox and embeds its court image. The original concept remains a style reference; these are individual production interpretations, not exact extractions of the concept sheet.

## Assets and preview

- Assets: `static/cards/{root.name}/`.
- Local asset bundle: `design/decks/{root.name}/deck.zip` (outside public hosting).
- Review: `/test-decks`, choose **{manifest['name']}**.
- `court-master-v1.png`: original generated three-panel source, left jack / middle queen / right king.
- `generation-prompt.txt`: exact built-in imagegen prompt. The corresponding concept was supplied as a reference.
- `artwork/jack.png`, `queen.png`, `king.png`: individual court panels rendered from native SVG viewports.

## Rebuild

1. `node scripts/prepare-themed-courts.mjs {root.name}`
2. `node scripts/generate-themed-decks.mjs {root.name}`
3. `node scripts/export-themed-decks.mjs {root.name}`
4. `node scripts/validate-themed-decks.mjs`
5. `python3 scripts/package-themed-decks.py`

Source: built-in imagegen for court illustrations; original vector motifs and deterministic SVG assembly for frames, pips, indices, themed ace decorations and two-way backs. The three court identities are shared across suits; corner ranks, suit symbols and inset suit markers distinguish all twelve court cards. No jokers.

SVG ranks use Georgia with Times New Roman/serif fallback; PNG exports fix their appearance for sharing. Digital exports have no print bleed or CMYK proof. Original concept files are preserved. Existing gameplay and live deck selection are unchanged.

## Validation

52 unique faces; correct numeric pip counts; paired indices; valid SVG XML; all 53 PNG dimensions checked. Back rotation and transparent corners, full preview image loading and phone overflow are checked in the collection review. Full-deck desktop/mobile screenshots are saved in this folder. Artistic approval remains separate from these technical checks.
'''
    (design / 'PRODUCTION.md').write_text(production)
    readme = design / 'README.md'
    text = readme.read_text()
    marker = '\n## Individual deck — v1\n'
    text = text.split(marker)[0]
    readme.write_text(text + marker + f'\nThe complete 52-face deck and reversible back are exported under `static/cards/{root.name}/` in SVG and PNG. See [production notes](PRODUCTION.md), [asset bundle](deck.zip), or select **{manifest["name"]}** at `/test-decks`. Live game selection is unchanged.\n')
    with ZipFile(design / 'deck.zip', 'w', ZIP_DEFLATED) as archive:
        for file in sorted(root.rglob('*')):
            if file.is_file():
                archive.write(file, f'{root.name}/{file.relative_to(root)}')
        archive.write(design / 'PRODUCTION.md', f'{root.name}/PRODUCTION.md')
        if (design / 'generation-prompt.txt').exists():
            archive.write(design / 'generation-prompt.txt', f'{root.name}/generation-prompt.txt')
    print(f'{manifest["name"]}: asset ZIP packaged.')
