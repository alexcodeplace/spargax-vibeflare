#!/usr/bin/env python3
"""Import the current canonical Spargax identity; never regenerate the retired VF logo.
Usage: python3 tools/build-logo-assets.py <canonical-checkout> <approved-commit>
The original 2026-09-13 pack remains unchanged in docs/design/logo.
"""
from pathlib import Path
import argparse
import json
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source')
parser.add_argument('revision')
args = parser.parse_args()
public = ROOT/'apps/ui/public'
subprocess.run(['node', str(ROOT/'apps/ui/scripts/import-spargax-brand.mjs'), args.source, args.revision, str(public), str(ROOT/'apps/ui/src/components/brand/dot-grid')], check=True)
manifest = json.loads((public/'assets/brand/manifest.json').read_text())
for name,size in [('favicon-32.png',32),('favicon-64.png',64),('apple-touch-icon.png',180),('icon-192.png',192)]:
    shutil.copyfile(public/'assets/brand'/manifest['version']/f'spargax-mark-{size}.png', public/name)
subprocess.run(['node', str(ROOT/'tools/verify-logo-assets.mjs')], check=True)
