"""Genera los PNG de Acompaña a partir de la geometría vectorial de acompana.svg.

Requiere Python 3 y Pillow. No descarga recursos ni usa fuentes del sistema.
Ejecutar desde cualquier directorio: python backend/icons/generate-icons.py
Los trazos cúbicos coinciden con el SVG; supersampling 4x evita bordes dentados.
"""
from pathlib import Path
from math import hypot
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BACKGROUND = '#245565'
CREAM = '#FFFCF8'
TERRACOTTA = '#D6A189'
HEART = [
    ((256, 183), (214, 126), (152, 140), (152, 191)),
    ((152, 191), (152, 238), (207, 276), (256, 312)),
    ((256, 312), (305, 276), (360, 238), (360, 191)),
    ((360, 191), (360, 140), (298, 126), (256, 183)),
]
CRADLE = [
    ((167, 310), (182, 337), (215, 354), (256, 354)),
    ((256, 354), (297, 354), (330, 337), (345, 310)),
]


def curve_points(segments, scale):
    points = []
    for p0, p1, p2, p3 in segments:
        for step in range(81):
            t = step / 80
            points.append(tuple(scale * ((1-t)**3*p0[j] + 3*(1-t)**2*t*p1[j]
                                         + 3*(1-t)*t*t*p2[j] + t**3*p3[j])
                                for j in (0, 1)))
    return points


def stroke(draw, segments, color, width, scale):
    points = curve_points(segments, scale)
    radius = width * scale / 2
    # La unión de discos aproxima el stroke redondo sin los picos del joint
    # de Pillow al redondear una polilínea con muchos puntos subpíxel.
    for x, y in points:
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)


def render(size):
    factor = 4
    image = Image.new('RGB', (size*factor, size*factor), BACKGROUND)
    draw = ImageDraw.Draw(image)
    scale = size*factor/512
    stroke(draw, HEART, CREAM, 26, scale)
    stroke(draw, CRADLE, TERRACOTTA, 22, scale)
    return image.resize((size, size), Image.Resampling.LANCZOS)


for filename, size in [('favicon-32.png', 32), ('favicon-48.png', 48),
                       ('apple-touch-icon.png', 180), ('icon-192.png', 192),
                       ('icon-512.png', 512), ('icon-maskable-512.png', 512)]:
    image = render(size)
    image.save(ROOT / filename, optimize=True)
    print(f'{filename}: {size}x{size}, RGB, fondo opaco')

# La identidad esencial cabe dentro del círculo seguro maskable: radio 40 %.
for path, width in [(HEART, 26), (CRADLE, 22)]:
    assert all(hypot(x-256, y-256)+width/2 <= 512*0.4
               for x, y in curve_points(path, 1)), 'Trazo fuera de zona segura'
