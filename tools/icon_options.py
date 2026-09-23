#!/usr/bin/env python3
"""Paints a few alternative app icons side by side, to choose from.

    python3 tools/icon_options.py [output-folder]

Each option is written as <name>.svg and <name>.png, plus options.png (all of them, big and at
home-screen size). The chosen one gets copied into make_icons.py.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_icons  # noqa: E402  (the current icon: mountain lake with wildflowers)

PAINT = make_icons.scene().split('<filter id="paint"')[1].split("</filter>")[0]
PAINT_FILTER = f'<filter id="paint"{PAINT}</filter>'


def flower_world() -> str:
    """B: a daisy whose center is the Earth."""
    petals = []
    for k in range(18):
        a = k * 20
        petals.append(f'<ellipse cx="256" cy="136" rx="30" ry="98" fill="#fffdf7" stroke="#eadfcf" stroke-width="3" '
                      f'transform="rotate({a} 256 256)"/>')
    return f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd9c2"/><stop offset=".55" stop-color="#f6b8c6"/><stop offset="1" stop-color="#c3b1e6"/>
    </linearGradient>
    <radialGradient id="sea" cx=".38" cy=".35" r=".75">
      <stop offset="0" stop-color="#6fc3f0"/><stop offset=".6" stop-color="#2f88cc"/><stop offset="1" stop-color="#1c5f9e"/>
    </radialGradient>
    <clipPath id="globe"><circle cx="256" cy="256" r="78"/></clipPath>
    {PAINT_FILTER}
  </defs>
  <g filter="url(#paint)">
    <rect x="-40" y="-40" width="592" height="592" fill="url(#bg)"/>
    <path d="M256 420 C250 470 262 500 256 560" stroke="#6f9a45" stroke-width="12" fill="none"/>
    <path d="M258 470 C300 440 346 452 372 430 C340 482 296 488 258 482Z" fill="#7aa850"/>
    {''.join(petals)}
    <circle cx="256" cy="256" r="84" fill="#f2c14e"/>
    <g clip-path="url(#globe)">
      <circle cx="256" cy="256" r="78" fill="url(#sea)"/>
      <path d="M186 206 C206 186 236 192 246 214 C252 232 236 244 240 262 C244 284 228 300 222 324 C212 312 214 292 204 280
               C190 266 170 262 176 240 C180 226 176 216 186 206Z" fill="#5db36a"/>
      <path d="M268 196 C292 186 322 196 330 214 C338 232 320 236 324 254 C330 280 316 306 298 322 C290 300 296 282 282 268
               C266 254 262 236 272 224 C276 214 262 206 268 196Z" fill="#6dbd63"/>
      <path d="M206 206 C214 200 224 202 228 210" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".5"/>
      <circle cx="226" cy="222" r="70" fill="#fff" opacity=".08"/>
    </g>
    <circle cx="256" cy="256" r="78" fill="none" stroke="#f2c14e" stroke-width="6"/>
  </g>
"""


def postcard() -> str:
    """C: her mountain as a vintage postcard, with a flower stamp."""
    scene = make_icons.scene().replace('id="paint"', 'id="paint2"').replace('url(#paint)', 'url(#paint2)')
    return f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9e6f2"/><stop offset="1" stop-color="#b9cde2"/>
    </linearGradient>
    <clipPath id="photo"><rect x="-172" y="-118" width="344" height="236" rx="6"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 262) rotate(-6)">
    <rect x="-196" y="-142" width="392" height="284" rx="14" fill="#000" opacity=".16" transform="translate(6 10)"/>
    <rect x="-196" y="-142" width="392" height="284" rx="14" fill="#fbf6ea"/>
    <g clip-path="url(#photo)">
      <svg x="-172" y="-160" width="344" height="344" viewBox="0 0 512 512">{scene}</svg>
    </g>
    <g transform="translate(120 -92) rotate(4)">
      <rect x="-40" y="-48" width="80" height="96" fill="#fff" stroke="#e7ddcc" stroke-width="10" stroke-dasharray="6 5"/>
      <rect x="-30" y="-38" width="60" height="76" fill="#f6d8a8"/>
      <path d="M0 30 L0 -2" stroke="#4f7a38" stroke-width="4"/>
      <g fill="#e4533a">{''.join(f'<ellipse cx="0" cy="-16" rx="7" ry="13" transform="rotate({a} 0 -2)"/>' for a in range(0, 360, 45))}</g>
      <circle cx="0" cy="-2" r="6" fill="#f2c14e"/>
    </g>
  </g>
"""


def golden_hour() -> str:
    """D: bold sunset colors, her mountain, and wildflowers in silhouette."""
    rnd = random.Random(5)
    blooms = []
    for x in range(20, 500, 26):
        h = rnd.randint(40, 110)
        blooms.append(f'<path d="M{x} 520 Q{x + rnd.randint(-10, 10)} {520 - h / 2} {x + rnd.randint(-14, 14)} {520 - h}" '
                      f'stroke="#1c1430" stroke-width="5" fill="none" stroke-linecap="round"/>')
        if rnd.random() < .6:
            color = rnd.choice(["#ff8fb1", "#ffb35c", "#ffe07a", "#c9a0ff"])
            blooms.append(f'<circle cx="{x + rnd.randint(-14, 14)}" cy="{520 - h}" r="{rnd.randint(7, 11)}" fill="{color}"/>')
    return f"""
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2b72"/><stop offset=".35" stop-color="#b7478a"/>
      <stop offset=".58" stop-color="#f48b3c"/><stop offset=".72" stop-color="#ffd36e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <circle cx="300" cy="300" r="92" fill="#ffe7a1"/>
  <path d="M-10 330 L70 270 L140 300 L210 240 L280 290 L360 250 L430 290 L522 250 V520 H-10Z" fill="#a24f86"/>
  <path d="M40 360 L150 240 L200 186 L238 132 L262 170 L290 158 L330 200 L380 240 L470 360Z" fill="#5e3372"/>
  <path d="M238 132 L262 170 L290 158 L318 190 L298 196 L284 178 L266 190 L252 172 L242 188 L234 164 L220 180 L214 166Z" fill="#ffd2dc"/>
  <path d="M-10 380 L80 330 L170 360 L260 320 L350 356 L440 326 L522 350 V520 H-10Z" fill="#3a2254"/>
  {''.join(blooms)}
"""


OPTIONS = {
    "A-mountain-lake": ("A · Mountain lake & wildflowers", make_icons.scene),
    "B-flower-world": ("B · A flower holding the world", flower_world),
    "C-postcard": ("C · The postcard", postcard),
    "D-golden-hour": ("D · Golden hour", golden_hour),
}


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent / ".cache" / "icon-options")
    out.mkdir(parents=True, exist_ok=True)
    tiles = []
    for name, (label, draw) in OPTIONS.items():
        rounded = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
                   f'<defs><clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath></defs>'
                   f'<g clip-path="url(#tile)">{draw()}</g></svg>')
        (out / f"{name}.svg").write_text(rounded)
        make_icons.render(rounded, out / f"{name}.png")
        tiles.append((label, Image.open(out / f"{name}.png").convert("RGBA")))
    sheet = Image.new("RGBA", (4 * 300 + 40, 460), (24, 25, 27, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (label, img) in enumerate(tiles):
        x = 20 + i * 300
        big = img.resize((256, 256), Image.LANCZOS)
        sheet.paste(big, (x + 12, 20), big)
        for size, dx in ((96, 30), (48, 150)):
            small = img.resize((size, size), Image.LANCZOS)
            sheet.paste(small, (x + dx, 300 + (96 - size) // 2), small)
        draw.text((x + 12, 420), label, fill=(225, 225, 225))
    sheet.convert("RGB").save(out / "options.png")
    print(out / "options.png")


if __name__ == "__main__":
    main()
