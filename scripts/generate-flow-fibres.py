"""Trace Flow's actual filaments; no bitmap is used by the animation.
Run with Python + numpy, Pillow, scipy, scikit-image:
    python scripts/generate-flow-fibres.py
The committed binary keeps these build-time tools out of the app runtime.
"""
from pathlib import Path
import struct
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage.morphology import skeletonize
from skimage.measure import approximate_polygon

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'public/flow-icon.png')
assert source.size == (1024, 1024), 'Trace the full-size 1024px logo.'
source.resize((384,384), Image.Resampling.LANCZOS).save(root / 'public/flow-loading-poster.webp', quality=88)
im = np.asarray(source.convert('L'), dtype=float)
# A structure tensor follows the real local hair direction, including the curl.
gx = gaussian_filter(im, 1, order=[0, 1])
gy = gaussian_filter(im, 1, order=[1, 0])
a, b, c = [gaussian_filter(v, 2) for v in (gx*gx, gx*gy, gy*gy)]
theta = .5*np.arctan2(2*b, a-c) + np.pi/2
vx, vy = np.cos(theta), np.sin(theta)
mask = gaussian_filter(im, 1) > 24
occupied = np.zeros(im.shape, dtype=bool)
rng = np.random.default_rng(40)
strands = []

def march(x, y, sign):
    points, visited = [], set()
    px, py = vx[int(y), int(x)]*sign, vy[int(y), int(x)]*sign
    for i in range(550):
        ix, iy = int(round(x)), int(round(y))
        if not (1 <= ix < 1023 and 1 <= iy < 1023) or not mask[iy, ix]:
            break
        cell = (ix//3, iy//3)
        if i % 3 == 0:
            if cell in visited:
                break
            visited.add(cell)
        dx, dy = vx[iy, ix], vy[iy, ix]
        if dx*px + dy*py < 0:
            dx, dy = -dx, -dy
        dx, dy = .65*dx + .35*px, .65*dy + .35*py
        norm = np.hypot(dx, dy)
        dx, dy = dx/norm, dy/norm
        points.append((x, y))
        x, y, px, py = x+dx*1.65, y+dy*1.65, dx, dy
    return points

ys, xs = np.nonzero(mask)
for index in rng.permutation(len(xs)):
    x, y = xs[index], ys[index]
    if occupied[y, x]:
        continue
    path = march(float(x), float(y), -1)[::-1] + march(float(x), float(y), 1)[1:]
    if len(path) < 8:
        continue
    # Retain brightness changes as well as geometry during simplification.
    # Maximum sample spacing preserves the light/dark detail along long arcs.
    chunks = [approximate_polygon(np.asarray(path[i:i+13]), tolerance=.4)
              for i in range(0, len(path)-1, 12)]
    points = np.concatenate([chunk[:-1] for chunk in chunks if len(chunk)>1] + [np.asarray(path[-1:])])
    strands.append((0, points))
    for x, y in path:
        x, y = int(round(x)), int(round(y))
        occupied[y:y+2, x:x+2] = True

# Add actual fine ridge traces, rather than synthetic noise, for the loose hairs
# and irregular breaking crest that distinguish this logo from a smooth ribbon.
def add_ridges(ridge_mask, layer):
    ridges = skeletonize(ridge_mask)
    ys, xs = np.nonzero(ridges)
    pixels = set(zip(xs.tolist(), ys.tolist()))
    adj = {p: [(p[0]+dx,p[1]+dy) for dx in (-1,0,1) for dy in (-1,0,1)
               if (dx or dy) and (p[0]+dx,p[1]+dy) in pixels] for p in sorted(pixels)}
    seen = set()
    def trace(p, q):
        path = [p]
        seen.update(((p,q),(q,p)))
        while True:
            path.append(q)
            choices = [v for v in adj[q] if (q,v) not in seen]
            if len(adj[q]) != 2 or not choices:
                break
            p, q = q, choices[0]
            seen.update(((p,q),(q,p)))
        if len(path) >= 5:
            strands.append((layer, approximate_polygon(np.asarray(path), tolerance=.4)))
    for p, ns in adj.items():
        if len(ns) != 2:
            for q in ns:
                if (p,q) not in seen:
                    trace(p,q)
    for p, ns in adj.items():
        for q in ns:
            if (p,q) not in seen:
                trace(p,q)
    

add_ridges((im-gaussian_filter(im,.9)>2.5) & (gaussian_filter(im,2)>28), 1)
add_ridges((gaussian_filter(im,.8)-im>1.5) & (gaussian_filter(im,2)>32), 2)

# FLW1: count, then [layer:u8, count:u16, (x*8:u16,y*8:u16,luma:u8)...].
out = bytearray(b'FLW1') + struct.pack('<H', len(strands))
for layer, points in strands:
    out += struct.pack('<BH', layer, len(points))
    for x,y in points:
        luminance = round(im[min(1023,round(y)), min(1023,round(x))])
        out += struct.pack('<HHB', round(x*8), round(y*8), luminance)
destination = root / 'src/assets/flow-fibres.bin'
destination.write_bytes(out)
print(f'{len(strands)} strands, {sum(len(p) for _,p in strands)} vertices, {len(out)} bytes')
