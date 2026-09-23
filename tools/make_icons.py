#!/usr/bin/env python3
"""Paints the app icon and renders the PNG sizes.

    python3 tools/make_icons.py

The icon: a snowy peak (her mountain) at sunrise over a still lake, with a small bunch of
wildflowers in front: the flowers from the letter, and a piece of the world. A light paint
texture makes it look like a little painting.

It also paints the two "canvases" she sees when the app opens: the same scene by day, and her
mountain at night (img/painting-day.jpg, img/painting-night.jpg).

Uses Google Chrome (headless) to render the SVG, and Pillow to make the smaller sizes.
"""
import random
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def treeline(rnd: random.Random, base: float, tall_edges: bool) -> str:
    """A ragged line of evergreens along the far shore."""
    pts, x = [f"M-10 {base + 40}", f"L-10 {base}"], -10
    while x < 522:
        w = rnd.randint(10, 18)
        edge = x < 120 or x > 400
        h = rnd.randint(24, 70) if (tall_edges and edge) else rnd.randint(8, 24)
        pts += [f"L{x + w / 2:.0f} {base - h}", f"L{x + w:.0f} {base - rnd.randint(0, 5)}"]
        x += w
    return " ".join(pts + [f"L522 {base + 40}Z"])


def wildflowers(rnd: random.Random) -> str:
    """Grass, lupines, paintbrush and daisies on the near shore, bottom left toward the middle."""
    out = []
    for _ in range(70):                                    # grass blades
        x = rnd.uniform(40, 380)
        h = rnd.uniform(40, 110) * (1.2 - abs(x - 190) / 380)
        lean = rnd.uniform(-18, 18)
        green = rnd.choice(["#4e7a38", "#638f41", "#3c6230", "#7aa14b"])
        out.append(f'<path d="M{x:.0f} 516 Q{x + lean / 2:.0f} {516 - h / 2:.0f} {x + lean:.0f} {516 - h:.0f}" '
                   f'stroke="{green}" stroke-width="{rnd.uniform(2.5, 4.5):.1f}" fill="none" stroke-linecap="round"/>')
    for x, top in [(96, 392), (122, 372), (150, 398), (318, 408)]:      # lupines: purple spikes
        out.append(f'<path d="M{x} 516 L{x} {top + 6}" stroke="#4f7a38" stroke-width="3.5"/>')
        for i in range(9):
            y = top + i * 9
            r = 4 + i * 0.7
            color = ["#9d86e6", "#8a6fd8", "#7659c4"][i % 3]
            out.append(f'<ellipse cx="{x - r * .55:.1f}" cy="{y}" rx="{r * .75:.1f}" ry="{r * .55:.1f}" fill="{color}"/>')
            out.append(f'<ellipse cx="{x + r * .55:.1f}" cy="{y + 3}" rx="{r * .75:.1f}" ry="{r * .55:.1f}" fill="{color}"/>')
    for x, top in [(176, 418), (272, 424), (80, 440)]:                  # paintbrush: red-orange tufts
        out.append(f'<path d="M{x} 516 L{x} {top + 10}" stroke="#4f7a38" stroke-width="3"/>')
        for i in range(7):
            out.append(f'<ellipse cx="{x + rnd.uniform(-6, 6):.1f}" cy="{top + i * 5:.1f}" rx="6" ry="4.5" '
                       f'fill="{rnd.choice(["#e4533a", "#f0743c", "#d9402f"])}"/>')
    for x, y, r, petal, center in [(206, 446, 13, "#f6cb45", "#c9771a"), (238, 468, 11, "#fbfaf4", "#e0a834"),
                                   (140, 456, 12, "#f6cb45", "#c9771a"), (292, 462, 10, "#fbfaf4", "#e0a834"),
                                   (58, 470, 11, "#fbfaf4", "#e0a834"), (340, 476, 9, "#f6cb45", "#c9771a")]:
        out.append(f'<path d="M{x} 516 L{x} {y}" stroke="#4f7a38" stroke-width="3"/>')
        for k in range(10):                                            # daisies
            out.append(f'<ellipse cx="{x}" cy="{y - r * .62:.1f}" rx="{r * .28:.1f}" ry="{r * .62:.1f}" fill="{petal}" '
                       f'transform="rotate({k * 36} {x} {y})"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="{r * .36:.1f}" fill="{center}"/>')
    return "\n    ".join(out)


def scene() -> str:
    rnd = random.Random(21)
    trees = treeline(rnd, 318, tall_edges=True)
    return f"""
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7ea8d8"/><stop offset=".45" stop-color="#c9d4e4"/><stop offset=".62" stop-color="#f1d2b0"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff7e8"/><stop offset=".4" stop-color="#ffecd0" stop-opacity=".85"/><stop offset="1" stop-color="#ffecd0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9dbad6"/><stop offset=".5" stop-color="#5f86ab"/><stop offset="1" stop-color="#34536f"/>
    </linearGradient>
    <clipPath id="water"><rect y="326" width="512" height="190"/></clipPath>
    <filter id="paint" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" result="brushed"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="3" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0.14 0 0 0 0.86  0.14 0 0 0 0.86  0.14 0 0 0 0.86  0 0 0 0 1" result="canvas"/>
      <feBlend in="brushed" in2="canvas" mode="multiply" result="textured"/>
      <feComposite in="textured" in2="brushed" operator="in"/>
    </filter>
  </defs>
  <g filter="url(#paint)">
    <rect x="-40" y="-40" width="592" height="592" fill="url(#sky)"/>
    <g stroke="#fff" stroke-linecap="round" fill="none" opacity=".35">
      <path d="M40 92 Q120 78 190 94" stroke-width="7"/><path d="M300 70 Q380 58 470 74" stroke-width="6"/>
    </g>
    <circle cx="352" cy="214" r="96" fill="url(#glow)"/>
    <circle cx="352" cy="214" r="30" fill="#fff6e6"/>
    <path d="M-10 262 L60 226 L120 250 L166 218 L206 240 L276 196 L340 236 L400 206 L462 242 L522 222 V330 H-10Z" fill="#a4aecb"/>
    <g id="peak">
      <path d="M40 326 L150 212 L200 150 L238 104 L262 146 L290 132 L330 176 L372 204 L420 250 L474 326Z" fill="#415b79"/>
      <path d="M238 104 L262 146 L290 132 L330 176 L310 184 L292 164 L272 178 L256 158 L244 176 L236 150 L222 170 L212 150Z" fill="#f4f6fa"/>
      <path d="M330 176 L372 204 L396 228 L372 226 L354 212 L336 220 L320 196Z" fill="#e9eef6"/>
      <path d="M238 104 L212 150 L222 170 L236 150 L230 132Z" fill="#c3d0e2"/>
      <path d="M200 150 L176 186 L196 196 L208 176Z" fill="#dbe4f0"/>
    </g>
    <path d="{trees}" fill="#24453b"/>
    <rect x="-40" y="326" width="592" height="226" fill="url(#lake)"/>
    <g clip-path="url(#water)">
      <use href="#peak" opacity=".42" transform="translate(0 326) scale(1 -.6) translate(0 -326)"/>
      <path d="{trees}" fill="#1b352f" opacity=".55" transform="translate(0 326) scale(1 -.6) translate(0 -326)"/>
    </g>
    <g stroke="#fff" stroke-linecap="round" opacity=".4">
      <path d="M300 372 H420" stroke-width="5"/><path d="M340 398 H460" stroke-width="4"/><path d="M380 426 H470" stroke-width="4"/>
    </g>
    {wildflowers(rnd)}
  </g>
"""


def night_scene() -> str:
    """Her mountain at dusk turning to night: violet sky, first stars, wildflowers in silhouette."""
    rnd = random.Random(5)
    blooms = []
    for x in range(20, 500, 26):
        h = rnd.randint(40, 110)
        blooms.append(f'<path d="M{x} 520 Q{x + rnd.randint(-10, 10)} {520 - h / 2} {x + rnd.randint(-14, 14)} {520 - h}" '
                      f'stroke="#1c1430" stroke-width="5" fill="none" stroke-linecap="round"/>')
        if rnd.random() < .6:
            color = rnd.choice(["#ff8fb1", "#ffb35c", "#ffe07a", "#c9a0ff"])
            blooms.append(f'<circle cx="{x + rnd.randint(-14, 14)}" cy="{520 - h}" r="{rnd.randint(7, 11)}" fill="{color}"/>')
    stars = "".join(f'<circle cx="{rnd.randint(10, 500)}" cy="{rnd.randint(8, 150)}" r="{rnd.choice([1.4, 1.8, 2.4])}" '
                    f'fill="#fff" opacity="{rnd.uniform(.5, .95):.2f}"/>' for _ in range(34))
    return f"""
  <defs>
    <linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#23195a"/><stop offset=".35" stop-color="#b7478a"/>
      <stop offset=".58" stop-color="#f48b3c"/><stop offset=".72" stop-color="#ffd36e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#nsky)"/>
  {stars}
  <circle cx="300" cy="300" r="92" fill="#ffe7a1"/>
  <path d="M-10 330 L70 270 L140 300 L210 240 L280 290 L360 250 L430 290 L522 250 V520 H-10Z" fill="#a24f86"/>
  <path d="M40 360 L150 240 L200 186 L238 132 L262 170 L290 158 L330 200 L380 240 L470 360Z" fill="#5e3372"/>
  <path d="M238 132 L262 170 L290 158 L318 190 L298 196 L284 178 L266 190 L252 172 L242 188 L234 164 L220 180 L214 166Z" fill="#ffd2dc"/>
  <path d="M-10 380 L80 330 L170 360 L260 320 L350 356 L440 326 L522 350 V520 H-10Z" fill="#3a2254"/>
  {''.join(blooms)}
"""


def svg(rounded: bool) -> str:
    clip = '<clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>' if rounded else ""
    body = f'<g clip-path="url(#tile)">{scene()}</g>' if rounded else scene()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'<defs>{clip}</defs>{body}</svg>')


def render(svg_text: str, out: Path, size: int = 512) -> None:
    svg_text = svg_text.replace('width="512" height="512"', f'width="{size}" height="{size}"', 1)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}</style>{svg_text}')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--default-background-color=00000000", f"--window-size={size},{size}",
                        f"--screenshot={out}", page.as_uri()], check=True, capture_output=True)


def painting(scene_svg: str, out: Path) -> None:
    """A square canvas for the opening screen, saved as a compact JPEG."""
    tmp = out.with_suffix(".png")
    render(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{scene_svg}</svg>', tmp, 960)
    Image.open(tmp).convert("RGB").save(out, quality=86, optimize=True, progressive=True)
    tmp.unlink()


def main() -> None:
    ICONS.mkdir(exist_ok=True)
    (ROOT / "tools" / "icon.svg").write_text(svg(rounded=True))
    render(svg(rounded=False), ICONS / "icon-maskable-512.png")
    render(svg(rounded=True), ICONS / "icon-512.png")
    Image.open(ICONS / "icon-512.png").resize((192, 192), Image.LANCZOS).save(ICONS / "icon-192.png")
    Image.open(ICONS / "icon-maskable-512.png").convert("RGB").resize((180, 180), Image.LANCZOS).save(ICONS / "apple-touch-icon.png")
    (ROOT / "img").mkdir(exist_ok=True)
    painting(scene(), ROOT / "img" / "painting-day.jpg")
    painting(night_scene(), ROOT / "img" / "painting-night.jpg")
    print("icons:", ", ".join(sorted(p.name for p in ICONS.glob("*.png"))), "| paintings: day, night")


if __name__ == "__main__":
    main()
