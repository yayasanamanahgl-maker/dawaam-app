"""Prepare launcher icons for Android from repository's DAWAAM artwork.
Only needed for the CI build; nothing is installed on the user's computer.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
image_path = root.parent / 'icon-512.jpg'
src = Image.open(image_path).convert('RGB')
res = root / 'android' / 'app' / 'src' / 'main' / 'res'
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for density, size in sizes.items():
    target = res / f'mipmap-{density}'
    target.mkdir(parents=True, exist_ok=True)
    icon = src.resize((size,size), Image.Resampling.LANCZOS)
    icon.save(target / 'ic_launcher.png')
    icon.save(target / 'ic_launcher_round.png')
# Force Android launcher to use the bundled DAWAAM icon instead of the default
# Capacitor adaptive-icon xml asset (which points to a placeholder foreground).
adaptive = res / 'mipmap-anydpi-v26'
for filename in ['ic_launcher.xml','ic_launcher_round.xml']:
    (adaptive / filename).unlink(missing_ok=True)
print('Ikon DAWAAM Android disiapkan')