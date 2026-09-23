#!/usr/bin/env python3
"""Writes tools/.cache/review.html: every landscape in photos.json as a numbered contact sheet,
for weeding out anything that isn't "wow".

    python3 tools/review_sheet.py [pexels|wikimedia|all]

Open the sheet (python3 -m http.server, then /tools/.cache/review.html), note the numbers of the
ones to drop, and add their ids (shown on hover, and listed in review.json) to tools/rejects.txt.
"""
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THUMBS = "https://upload.wikimedia.org/wikipedia/commons/thumb/"


def thumb(p: dict) -> str:
    if p.get("u"):
        return f"{p['u']}?auto=compress&cs=tinysrgb&w=240"
    name = p.get("n") or p["f"].rsplit("/", 1)[1]
    return f"{THUMBS}{p['f']}/250px-{name}"


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    photos = [p for p in json.loads((ROOT / "photos.json").read_text())["photos"] if p["k"] == "l"]
    if which == "pexels":
        photos = [p for p in photos if p.get("u")]
    elif which == "wikimedia":
        photos = [p for p in photos if not p.get("u")]
    tiles = "\n".join(
        f'<figure title="{html.escape(p["f"])}"><img loading="lazy" src="{html.escape(thumb(p))}">'
        f'<figcaption><b>{i}</b> {html.escape((p["t"] or p["a"])[:40])}</figcaption></figure>'
        for i, p in enumerate(photos))
    out = ROOT / "tools" / ".cache" / "review.html"
    out.write_text(f"""<!doctype html><meta charset="utf-8"><title>Review</title>
<style>body{{margin:6px;background:#111;color:#ccc;font:10px system-ui}}
main{{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px}}
figure{{margin:0;min-width:0}}img{{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-radius:3px}}
figcaption{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}b{{color:#fc6;font-size:12px}}</style>
<main>{tiles}</main>""")
    (ROOT / "tools" / ".cache" / "review.json").write_text(json.dumps([p["f"] for p in photos]))
    print(f"{out} ({len(photos)} photos)")


if __name__ == "__main__":
    main()
