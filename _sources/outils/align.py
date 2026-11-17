"""Aligne chaque photo « avant » sur sa photo « après » (homographie SIFT + RANSAC).

Usage: python -I align.py <dossier_photos> <dossier_sortie> avant:apres [avant:apres ...]
Sorties: un aperçu par paire (après | avant redressé | fondu 50 %) + homographies.json
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
pairs = [a.split(":") for a in sys.argv[3:]]


def load(p):
    return cv2.imdecode(np.fromfile(str(p), dtype=np.uint8), cv2.IMREAD_COLOR)


def save(p, im, q=85):
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, q])
    buf.tofile(str(p))


def grid(im):
    im = im.copy()
    h, w = im.shape[:2]
    for k in range(1, 10):
        col = (60, 60, 255) if k == 5 else (0, 255, 255)
        cv2.line(im, (w * k // 10, 0), (w * k // 10, h), col, 1)
        cv2.line(im, (0, h * k // 10), (w, h * k // 10), col, 1)
        cv2.putText(im, str(k * 10), (w * k // 10 + 3, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)
        cv2.putText(im, str(k * 10), (3, h * k // 10 + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)
    return im


sift = cv2.SIFT_create(nfeatures=12000)
results = {}
for b, a in pairs:
    A, B = load(src / f"{a}.jpg"), load(src / f"{b}.jpg")
    kA, dA = sift.detectAndCompute(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), None)
    kB, dB = sift.detectAndCompute(cv2.cvtColor(B, cv2.COLOR_BGR2GRAY), None)
    matches = cv2.BFMatcher(cv2.NORM_L2).knnMatch(dB, dA, k=2)
    good = [m for m, n in matches if m.distance < 0.78 * n.distance]
    key = f"{b}_{a}"
    if len(good) < 8:
        print(key, "trop peu de correspondances:", len(good))
        continue
    pB = np.float32([kB[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    pA = np.float32([kA[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(pB, pA, cv2.RANSAC, 6.0, maxIters=20000, confidence=0.999)
    if H is None:
        print(key, "pas d'homographie")
        continue
    inl = int(mask.sum())
    hA, wA = A.shape[:2]
    hB, wB = B.shape[:2]
    corners = cv2.perspectiveTransform(np.float32([[0, 0], [wB, 0], [wB, hB], [0, hB]]).reshape(-1, 1, 2), H).reshape(-1, 2)
    pct = [(round(float(x) / wA * 100), round(float(y) / hA * 100)) for x, y in corners]
    warped = cv2.warpPerspective(B, H, (wA, hA), flags=cv2.INTER_LANCZOS4)
    blend = cv2.addWeighted(A, 0.5, warped, 0.5, 0)
    s = 620 / hA
    panels = [cv2.resize(x, (int(wA * s), 620), interpolation=cv2.INTER_AREA) for x in (A, warped, blend)]
    panels = [grid(p) for p in panels]
    save(out / f"{key}.jpg", np.hstack(panels))
    results[key] = {"H": H.tolist(), "inliers": inl, "good": len(good), "after_size": [wA, hA], "before_corners_pct": pct}
    print(f"{key}: correspondances={len(good)} inliers={inl} coins_avant_dans_apres(%)={pct}")

(out / "homographies.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
