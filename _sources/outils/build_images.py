"""Prépare les images du site Pliage PJL (recadrage, redressement avant/après, WebP).

Usage: python -I build_images.py <photos_fb> <homographies.json> <dossier_logos> <racine_du_site> <dossier_apercu>
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = Path(sys.argv[1])
HOMO = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
LOGOS = Path(sys.argv[3])
ROOT = Path(sys.argv[4])
PREVIEW = Path(sys.argv[5])
if not ROOT.is_dir():
    sys.exit(f"Racine du site introuvable: {ROOT!r}")
IMG = ROOT / "assets" / "img"
for d in (IMG, IMG / "realisations", IMG / "avant-apres", IMG / "services", PREVIEW):
    d.mkdir(parents=True, exist_ok=True)

manifest = {}


def load(name):
    return ImageOps.exif_transpose(Image.open(SRC / f"{name}.jpg")).convert("RGB")


def crop_pct(im, box):
    w, h = im.size
    x0, y0, x1, y1 = box
    return im.crop((round(w * x0 / 100), round(h * y0 / 100), round(w * x1 / 100), round(h * y1 / 100)))


def fit_ratio(im, ratio):
    """Recadre au centre pour obtenir exactement le ratio largeur/hauteur voulu."""
    w, h = im.size
    if w / h > ratio:
        nw = round(h * ratio)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / ratio)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def save_set(im, rel, widths, q=80):
    """Enregistre plusieurs largeurs en WebP; retourne les variantes (chemin relatif, w, h)."""
    out = []
    seen = set()
    for w in widths:
        w = min(w, im.width)
        if w in seen:
            continue
        seen.add(w)
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS) if w != im.width else im
        if w != im.width:
            r = r.filter(ImageFilter.UnsharpMask(radius=0.6, percent=40, threshold=2))
        p = IMG / f"{rel}-{w}.webp"
        r.save(p, "WEBP", quality=q, method=6)
        out.append({"src": f"assets/img/{rel}-{w}.webp", "w": w, "h": h, "kb": round(p.stat().st_size / 1024)})
    return out


# ---------- Héros (4:5) ----------
hero = fit_ratio(crop_pct(load("p27"), (0, 3, 81, 79)), 4 / 5)
manifest["hero"] = save_set(hero, "hero", [800, 1200], q=82)

# ---------- Services (1:1) ----------
SERVICES = {
    "pliage": ("p29", (0, 0, 100, 75)),
    "portes": ("p03", (0, 22, 100, 97)),
    "scellant": ("p18", (0, 4, 100, 85)),
}
for key, (name, box) in SERVICES.items():
    im = fit_ratio(crop_pct(load(name), box), 1)
    manifest[f"svc-{key}"] = save_set(im, f"services/{key}", [600, 1000])

# ---------- Réalisations ----------
GALLERY = [
    ("poutre-aluminium", "p12", (0, 3, 100, 62)),
    ("triplex-fenetres", "p50", (0, 10, 100, 100)),
    ("porte-entree-grise", "p56", (12, 0, 100, 78)),
    ("soffite-fascia", "p14", (0, 22, 100, 100)),
    ("fenetres-guillotine", "p20", (4, 18.5, 95, 79.5)),
    ("immeuble-logements", "p44", (0, 0, 100, 63)),
    ("garage-ouvertures", "p35", (0, 0, 100, 77)),
    ("porte-vitree-interieur", "p54", (8, 2, 94, 92)),
    ("immeuble-arriere", "p62", (0, 0, 100, 76)),
    ("fenetre-sous-sol", "p09", (0, 15, 100, 100)),
    ("porte-service", "p32", (0, 8, 100, 74)),
    ("batiment-commercial", "p52", (18, 0, 100, 62)),
    ("cadrage-garage", "p23", (4, 3, 100, 78)),
    ("immeuble-brique", "p63", (0, 0, 100, 85)),
    ("fenetre-neuve", "p46", (0, 0, 100, 78)),
]
for slug, name, box in GALLERY:
    im = crop_pct(load(name), box)
    manifest[f"g-{slug}"] = save_set(im, f"realisations/{slug}", [700, 1500])

# ---------- Avant / Après (avant redressé sur le cadre de l'après) ----------
PAIRS = [
    ("porte-entree", "p02", "p01", (15, 20.5, 79.5, 78)),
    ("nouvelle-ouverture", "p49", "p47", (12, 21.5, 91, 79)),
    ("fenetre-sous-sol", "p06", "p05", (16.5, 25, 100, 86)),
    ("porte-vitree", "p26", "p25", (2, 8.5, 92, 78.5)),
]
for slug, b, a, box in PAIRS:
    info = HOMO[f"{b}_{a}"]
    H = np.array(info["H"], dtype=np.float64)
    A = load(a)
    B = cv2.cvtColor(np.array(load(b)), cv2.COLOR_RGB2BGR)
    wA, hA = A.size
    warped = cv2.warpPerspective(B, H, (wA, hA), flags=cv2.INTER_LANCZOS4)
    valid = cv2.warpPerspective(np.full(B.shape[:2], 255, np.uint8), H, (wA, hA), flags=cv2.INTER_NEAREST)
    Wb = Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
    ca, cb = crop_pct(A, box), crop_pct(Wb, box)
    cv = crop_pct(Image.fromarray(valid), box)
    holes = 100 - 100 * np.count_nonzero(np.array(cv) > 250) / (cv.width * cv.height)
    widths = [min(ca.width, 1200)]
    manifest[f"ba-{slug}-apres"] = save_set(ca, f"avant-apres/{slug}-apres", widths, q=82)
    manifest[f"ba-{slug}-avant"] = save_set(cb, f"avant-apres/{slug}-avant", widths, q=82)
    print(f"paire {slug}: {ca.size} ratio={ca.width / ca.height:.3f} zone_non_couverte={holes:.2f}%")

# ---------- Logos ----------
def clean_logo(path):
    im = Image.open(path).convert("RGBA")
    a = np.array(im.getchannel("A")).astype(np.float32)
    hist = np.bincount(a.astype(np.uint8).ravel(), minlength=256)
    top = np.argsort(hist)[-4:][::-1]
    print(path.name, "alpha les plus fréquents:", [(int(v), int(hist[v])) for v in top])
    return im.crop(im.getbbox())


logo = clean_logo(LOGOS / "2.webp")
logo_dark = clean_logo(LOGOS / "1.webp")
for im, rel in ((logo, "logo"), (logo_dark, "logo-fonce")):
    for w in (320, 720):
        h = round(im.height * w / im.width)
        p = IMG / f"{rel}-{w}.webp"
        im.resize((w, h), Image.LANCZOS).save(p, "WEBP", quality=92, method=6)
        manifest.setdefault(rel, []).append({"src": f"assets/img/{rel}-{w}.webp", "w": w, "h": h, "kb": round(p.stat().st_size / 1024)})

# Favicons: logo sur pastille sombre
for size in (32, 180, 192, 512):
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.2), fill=(14, 15, 17, 255))
    pad = round(size * 0.1)
    box = size - 2 * pad
    l = logo.copy()
    l.thumbnail((box, box), Image.LANCZOS)
    bg.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
    bg.save(IMG / f"favicon-{size}.png")

# Image de partage (Open Graph) 1200x630
og = Image.new("RGB", (1200, 630), (14, 15, 17))
photo = fit_ratio(crop_pct(load("p27"), (0, 3, 100, 79)), 560 / 630).resize((560, 630), Image.LANCZOS)
og.paste(photo, (640, 0))
grad = Image.new("L", (160, 630))
for x in range(160):
    ImageDraw.Draw(grad).line([(x, 0), (x, 630)], fill=round(255 * (1 - x / 159)))
og.paste(Image.new("RGB", (160, 630), (14, 15, 17)), (640, 0), grad)
l = logo.copy()
l.thumbnail((430, 430), Image.LANCZOS)
og.paste(l, ((640 - l.width) // 2, (630 - l.height) // 2), l)
og.save(IMG / "partage.jpg", quality=86)

(PREVIEW / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

# ---------- Planche de contrôle ----------
items = [(k, v[-1]) for k, v in manifest.items() if not k.startswith("logo")]
COLS, CELL, PAD, LABEL = 5, 300, 8, 20
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * (CELL + PAD) + PAD, rows * (CELL + LABEL + PAD) + PAD), (24, 24, 26))
d = ImageDraw.Draw(sheet)
for i, (k, v) in enumerate(items):
    im = Image.open(ROOT / v["src"]).convert("RGB")
    im.thumbnail((CELL, CELL))
    cx = PAD + (i % COLS) * (CELL + PAD)
    cy = PAD + (i // COLS) * (CELL + LABEL + PAD)
    sheet.paste(im, (cx + (CELL - im.width) // 2, cy + LABEL + (CELL - im.height) // 2))
    d.text((cx + 2, cy + 4), f"{k} {v['w']}x{v['h']} {v['kb']}k", fill=(240, 240, 240))
sheet.save(PREVIEW / "controle.jpg", quality=85)
total = sum(f.stat().st_size for f in IMG.rglob("*") if f.is_file())
print(f"{len(manifest)} entrées, {sum(1 for f in IMG.rglob('*') if f.is_file())} fichiers, {total / 1e6:.1f} Mo")
