"""Generate sample Mandelbrot renders matching mandelbrot/index.html's math."""
import numpy as np
from PIL import Image

def mandelbrot(width, height, cx, cy, scale, max_iter):
    x = (np.arange(width) - width / 2) * scale + cx
    y = (np.arange(height) - height / 2) * scale + cy
    X, Y = np.meshgrid(x, y)
    C = X + 1j * Y
    Z = np.zeros_like(C)
    div_time = np.full(C.shape, max_iter, dtype=float)
    mask = np.ones(C.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C[mask]
        escaped = np.abs(Z) > 2
        newly = escaped & mask
        div_time[newly] = i
        mask &= ~escaped
        if not mask.any():
            break
    # smooth coloring for escaped points
    with np.errstate(invalid='ignore', divide='ignore'):
        log_zn = np.log(np.abs(Z) ** 2 + 1e-12) / 2
        nu = np.log(log_zn / np.log(2) + 1e-12) / np.log(2)
    smooth = div_time + 1 - nu
    smooth = np.where(div_time >= max_iter, max_iter, smooth)
    return smooth

def palette(name, t):
    t = np.clip(t, 0, 1)
    if name == 'grayscale':
        v = (t * 255).astype(np.uint8)
        return v, v, v
    if name == 'fire':
        r = np.clip(t * 400, 0, 255).astype(np.uint8)
        g = np.clip(t * 200, 0, 255).astype(np.uint8)
        b = np.clip(t * 80, 0, 255).astype(np.uint8)
        return r, g, b
    if name == 'ocean':
        r = np.clip(20 + t * 30, 0, 255).astype(np.uint8)
        g = np.clip(60 + t * 150, 0, 255).astype(np.uint8)
        b = np.clip(120 + t * 135, 0, 255).astype(np.uint8)
        return r, g, b
    # classic
    r = (9 * (1 - t) * t ** 3 * 255).astype(np.uint8)
    g = (15 * (1 - t) ** 2 * t ** 2 * 255).astype(np.uint8)
    b = (8.5 * (1 - t) ** 3 * t * 255).astype(np.uint8)
    return r, g, b

def make_image(width, height, cx, cy, scale, max_iter, palette_name, path):
    smooth = mandelbrot(width, height, cx, cy, scale, max_iter)
    escaped_mask = smooth < max_iter
    t = np.where(escaped_mask, smooth / max_iter, 0)
    r, g, b = palette(palette_name, t)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[..., 0] = np.where(escaped_mask, r, 0)
    img[..., 1] = np.where(escaped_mask, g, 0)
    img[..., 2] = np.where(escaped_mask, b, 0)
    Image.fromarray(img, 'RGB').save(path)
    print(f"Saved {path}")

if __name__ == '__main__':
    W, H = 900, 675
    base_scale = 3.0 / min(W, H)

    # 1. Full classic view
    make_image(W, H, -0.5, 0, base_scale, 300, 'classic', 'mandelbrot/render_classic_full.png')

    # 2. Zoomed into seahorse valley, fire palette
    make_image(W, H, -0.743643887037151, 0.13182590420533, base_scale * 0.00005, 800, 'fire', 'mandelbrot/render_seahorse_fire.png')

    # 3. Zoomed into a spiral region, ocean palette
    make_image(W, H, -0.7453, 0.1127, base_scale * 0.0008, 600, 'ocean', 'mandelbrot/render_spiral_ocean.png')

    # 4. Grayscale full view
    make_image(W, H, -0.5, 0, base_scale, 300, 'grayscale', 'mandelbrot/render_grayscale_full.png')
