"""Rebuild the four tileable 1024px material swatches (NumPy and Pillow)."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

size = 1024
out = Path(__file__).resolve().parents[1] / "public/materials"
out.mkdir(exist_ok=True)
rng = np.random.default_rng(7841)
y, x = np.mgrid[:size, :size] / size


def noise(cols, rows):
    """Smooth value noise with a periodic lattice on both axes."""
    grid = rng.uniform(-1, 1, (rows, cols))
    u, v = x * cols, y * rows
    i, j = u.astype(int), v.astype(int)
    u, v = u % 1, v % 1
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    a = grid[j, i]*(1-u) + grid[j, (i+1) % cols]*u
    b = grid[(j+1) % rows, i]*(1-u) + grid[(j+1) % rows, (i+1) % cols]*u
    return a*(1-v) + b*v


def shade(color, variation):
    return np.array(color) + variation[..., None]


def raster(rgb):
    return Image.fromarray(rgb.clip(0, 255).astype(np.uint8))


def masonry(width, height, jitter):
    v = y * height + jitter
    row = np.floor(v).astype(int) % height
    u = x * width + row * .5 + jitter
    col = np.floor(u).astype(int) % width
    variation = rng.uniform(-16, 16, (height, width))[row, col]
    edge = np.minimum(np.minimum(u % 1, 1-u % 1)/width,
                      np.minimum(v % 1, 1-v % 1)/height) * size
    return variation, edge


grain = noise(4, 64)*4 + noise(10, 220)*3
bend = noise(3, 8)*1.4
for cx, cy in rng.random((18, 2)):
    dx, dy = (x-cx+.5) % 1-.5, (y-cy+.5) % 1-.5
    oval = (dx/.05)**2 + (dy/.013)**2
    bend += 2*np.exp(-oval)
    grain -= 23*np.exp(-oval*2)
tone, edge = masonry(3, 8, 0)
rings = np.cos(2*np.pi*(y*68 + bend))*.5+.5
wood = shade([166, 115, 72], tone + grain - rings**5*13 - 55*np.exp(-edge))
raster(wood).save(out/'wood.webp', quality=94)

tone, edge = masonry(4, 10, noise(70, 70)*.008)
grit = noise(80, 80)*7 + rng.normal(0, 5, x.shape)
brick = shade([158, 79, 56], tone + grit + noise(15, 20)*11)
lime = shade([175, 157, 133], grit)
mix = np.clip((edge-2.7)/1.5, 0, 1)[..., None]
raster(lime*(1-mix) + brick*mix).save(out/'brick.webp', quality=94)

phase = 2*x + y + noise(3, 3)*.65 + noise(9, 8)*.15 + noise(37, 29)*.035
vein = np.abs(np.sin(np.pi*phase))
marble = shade([227, 225, 216], noise(5, 5)*9 + noise(23, 29)*3
               - 63*np.exp(-vein*18) - 28*np.exp(-vein*4)
               - 26*np.exp(-20*np.abs(np.sin(np.pi*(phase*2+noise(5, 6)*.3)))))
raster(marble).save(out/'marble.webp', quality=94)

patch = noise(6, 7)*13 + noise(32, 32)*8
grass = raster(shade([58, 85, 39], patch))
draw = ImageDraw.Draw(grass)
for _ in range(85000):
    px, py = rng.integers(size, size=2)
    dx, dy = rng.integers(-6, 7), rng.integers(4, 16)
    value = patch[py, px] + rng.normal(6, 18)
    color = tuple(np.clip(np.array([68, 99, 43])+value, 0, 255).astype(int))
    for ox in ([0, size] if px < 7 else [0, -size] if px >= size-7 else [0]):
        for oy in ([0, size] if py < 16 else [0]):
            a, b = px+ox, py+oy
            draw.polygon([(a-1,b),(a+1,b),(a+dx,b-dy)], fill=color)
grass.save(out/'grass.webp', quality=94)
