#!/usr/bin/env python3
"""
Builds photos.json: the list of pictures the app shows.

Every picture comes from Wikimedia Commons "Featured pictures", the very best photos on
Commons as voted by its photographers. They're all freely licensed, and the app credits each
photographer on screen.

    python3 tools/build_photos.py            # build (re-uses what's saved in tools/.cache)
    python3 tools/build_photos.py --fresh    # forget the cache and download everything again
    python3 tools/build_photos.py --animals  # also write tools/.cache/animal_candidates.html,
                                             # a contact sheet for picking funny animals
    python3 tools/build_photos.py --score-colors   # measure how colorful each photo really is
                                                   # (slow: Wikimedia only allows a trickle; resumable)

Funny animals are hand-picked: put their "File:..." names in tools/animal_picks.txt.
Needs Pillow (pip install pillow) to score how vivid each photo is.
Nothing here runs on Mom's phone; this is a once-in-a-while step.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from io import BytesIO
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / ".cache"
OUT = ROOT / "photos.json"
ANIMAL_PICKS = HERE / "animal_picks.txt"

API = "https://commons.wikimedia.org/w/api.php"
THUMBS = "https://upload.wikimedia.org/wikipedia/commons/thumb/"
UA = "VistasPhotoListBuilder/1.0 (small personal slideshow app; low volume)"

# Commons gallery pages to draw from. Sub-pages (".../Natural/Norway", ...) are included automatically.
LANDSCAPE_GALLERIES = [
    "Featured pictures/Places/Natural",
    "Featured pictures/Places/Agriculture",
    "Featured pictures/Places/Roads",
    "Featured pictures/Places/Panoramas",
    "Featured pictures/Places/Settlements",     # only the ones that are mostly scenery (see below)
    "Featured pictures/Natural phenomena",
]
ANIMAL_GALLERIES = [
    "Featured pictures/Animals/Mammals",
    "Featured pictures/Animals/In their habitats",
    "Featured pictures/Animals/Birds",
]

# Tall photos that fill an upright phone screen. Featured pictures first, then Quality images
# (technically excellent photos reviewed by the community), limited to scenery.
_SCENIC = ("(mountain OR lake OR waterfall OR forest OR valley OR glacier OR canyon OR fjord OR coast OR beach OR "
           "sunset OR sunrise OR autumn OR river OR cliff OR alps OR meadow OR fields)")
TALL_SEARCHES = [
    f'incategory:"Featured_pictures_on_Wikimedia_Commons" fileh:>2400 filew:<3200 {_SCENIC}',
]
TALL_ASPECT = (0.45, 0.87)  # width / height

# Pexels: professional, jaw-dropping photos (free to use). Only used when tools/.pexels-key exists.
PEXELS_KEY_FILE = HERE / ".pexels-key"
PEXELS_API = "https://api.pexels.com/v1/search"
PEXELS_SEARCHES = [
    "moraine lake", "banff national park", "dolomites", "swiss alps", "patagonia", "torres del paine",
    "iceland waterfall", "kirkjufell", "lofoten", "norway fjord", "faroe islands", "scottish highlands",
    "lake como", "plitvice lakes", "yosemite valley", "grand canyon sunset", "antelope canyon", "monument valley",
    "zion national park", "glacier national park", "aurora borealis", "autumn mountains", "fall foliage mountains",
    "cherry blossom landscape", "lavender field", "tulip field", "rice terraces", "tuscany landscape",
    "sand dunes sunset", "turquoise water beach", "tropical island aerial", "fall colors lake",
    "misty mountains sunrise", "mountain lake reflection", "alpine meadow flowers", "golden hour mountains",
    "sunset over mountains", "turquoise lake", "glacier lagoon", "canyon river", "mount fuji", "zhangjiajie",
    "volcano landscape", "salt flat reflection", "rainbow landscape", "pink sky landscape",
    "vibrant sunset landscape", "epic mountain landscape", "colorful sky mountains",
]
PEOPLE = re.compile(r"\b(person|people|man|men|woman|women|girl|boy|child|children|kids?|couple|family|friends|"
                    r"hikers?|tourists?|travell?ers?|backpacker|climber|surfer|skier|crowd|bride|groom|someone|"
                    r"selfie|lady|guy|he|she|his|her)\b", re.I)

# Pexels photos whose description shows they're not really about the scenery.
NOT_SCENERY = re.compile(r"\b(car|cars|vehicle|truck|van|bus|motorcycle|bicycle|bike|tent|tents|camper|skyscrapers?|"
                         r"city|buildings?|tower|monument|drone|airplane|plane|food|dog|cat|horse)\b", re.I)

# The very first photo she sees: Mount Shuksan from Picture Lake, the scene she painted.
FIRST_PHOTO = "File:Picture Lake - Flickr - SqueakyMarmot.jpg"
FIRST_TITLE = "Mount Shuksan from Picture Lake, Washington"
# More of "her" mountain, mixed in with everything else.
EXTRA_LANDSCAPES = [
    "File:Mount Shuksan, Picture Lake (2362739742).jpg",
    "File:Mount Shuksan at North Cascades National Park in Washington 1.jpg",
]

# Not what she's here for: views from space, night skies, macro shots, and anything bleak or industrial.
SKIP = re.compile(
    r"satellite|from space|\biss\b|astronaut|orthophoto|\bcave|grotto|interior|underwater|\bcoral|\breef|"
    r"microscop|\bmacro\b|snowflake|ice crystal|milky way|star trail|night sky|\bnight\b|eclipse|lightning|"
    r"firework|\bmap\b|diagram|\bsprite|dying|pollut|waste|landfill|industr|factory|power (plant|station)|"
    r"quarry|\bmine\b|mining|fish farm|refinery|pipeline|construction|wildfire|burn(ed|t)\b|drought|flood|"
    r"school|campus|prison|stadium|airport|parking|highway|motorway|interchange|cemetery|graveyard", re.I)
# City scenes aren't what she's here for, whichever gallery they come from (checked against title and description).
CITY = re.compile(r"\bstreet\b|downtown|skyline|shopping|\bbuilding|apartment|traffic|parking|\bcity centre|\bcity center", re.I)
# Photos from the "Settlements" gallery stay only if they're really about the scenery.
SCENERY = re.compile(r"mountain|\balp|valley|lake|river|\bsea\b|coast|fjord|glacier|hill|meadow|forest|"
                     r"countryside|rural|landscape|vineyard|terrace|canyon|waterfall", re.I)
URBAN = re.compile(r"street|downtown|skyline|square|market|harbou?r|port\b|church|cathedral|castle|palace|"
                   r"building|tower|bridge|night|aerial view of the city|old town", re.I)
# Animal candidates worth a look for the funny-animal contact sheet.
CHARACTER = re.compile(
    r"monkey|macaque|baboon|gorilla|chimp|orangutan|lemur|gibbon|langur|capuchin|mandrill|gelada|marmoset|"
    r"tamarin|proboscis|\bseal|sea lion|walrus|otter|\bbear|\bfox|meerkat|squirrel|marmot|prairie dog|raccoon|"
    r"sloth|koala|kangaroo|wallaby|quokka|\bowl|puffin|penguin|pelican|\bgoat|ibex|llama|alpaca|camel|giraffe|"
    r"\bpig\b|hippo|\bfrog|\btoad|chameleon|parrot|\bkea\b|toucan|hornbill|frogmouth|shoebill|flamingo|booby|"
    r"hedgehog|\bhare\b|rabbit|beaver|\bcub\b|juvenile|\bbaby|yawn|tongue|playing|curious|sleeping|grooming", re.I)

# Color-rich moments come up earlier in each round of the slideshow.
VIVID = re.compile(r"sunset|sunrise|\bdawn|\bdusk|golden hour|alpenglow|autumn|fall colou?rs?|foliage|blossom|bloom|"
                   r"flower|lavender|tulip|popp(y|ies)|heather|rapeseed|sunflower|rainbow|aurora|turquoise|emerald|"
                   r"reflect|glacier|colou?rful|vivid|lagoon", re.I)

# Birds only make the contact sheet if they're the characterful kind.
FUNNY_BIRDS = re.compile(r"\bowl|puffin|penguin|pelican|parrot|\bkea\b|toucan|hornbill|frogmouth|shoebill|"
                         r"flamingo|booby|macaw|cockatoo|potoo|kookaburra|oxpecker|chick", re.I)

MIN_WIDTH = 1920          # the app shows 1280px images and saves 1920px ones
ASPECT = (0.5, 2.4)       # anything wider is a thin strip on a phone
DROP_DULLEST = 0.18       # leave out the least colorful 18% of landscapes
PEXELS_DROP_DULLEST = 0.55  # Pexels: keep only the most colorful 45% (bright, vivid, "wow")
BOOST_VIVID = 0.40        # the most colorful 40% come up earlier in each round


# ---------------------------------------------------------------- Commons API

def http_get(url: str, data: bytes | None = None, tries: int = 8) -> bytes:
    """Fetch a URL, backing off politely whenever Wikimedia says it's busy."""
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504):
                raise
            wait = min(int(e.headers.get("Retry-After") or 0) or 10 * 2 ** attempt, 120)
            print(f"   Wikimedia is busy; waiting {wait}s...", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit("Wikimedia kept saying it's busy. Try again in a few minutes.")


def api(params: dict) -> dict:
    body = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2", "maxlag": "5"}).encode()
    while True:
        data = json.loads(http_get(API, body))
        if data.get("error", {}).get("code") != "maxlag":
            time.sleep(1.0)
            return data
        time.sleep(5)


def gallery_pages(prefix: str) -> list[str]:
    d = api({"action": "query", "list": "allpages", "apnamespace": 4, "apprefix": prefix, "aplimit": "max"})
    return [p["title"] for p in d["query"]["allpages"]]


def files_on(page: str) -> list[str]:
    out, cont = [], {}
    while True:
        d = api({"action": "query", "prop": "images", "titles": page, "imlimit": "max", **cont})
        for p in d["query"]["pages"]:
            out += [i["title"] for i in p.get("images", []) if re.search(r"\.jpe?g$", i["title"], re.I)]
        if "continue" not in d:
            return out
        cont = d["continue"]


def search_files(query: str, limit: int = 4000) -> list[str]:
    out, offset = [], 0
    while offset < limit:
        d = api({"action": "query", "list": "search", "srsearch": query, "srnamespace": 6,
                 "srlimit": "max", "sroffset": offset, "srprop": ""})
        out += [h["title"] for h in d.get("query", {}).get("search", []) if re.search(r"\.jpe?g$", h["title"], re.I)]
        if "continue" not in d:
            break
        offset = d["continue"]["sroffset"]
    return out


def fetch_info(titles: list[str], info: dict, save) -> None:
    todo = [t for t in dict.fromkeys(titles) if t not in info]
    for n in range(0, len(todo), 50):
        batch, cont = todo[n:n + 50], {}
        print(f"   details {n + len(batch)}/{len(todo)}", file=sys.stderr)
        while True:
            d = api({
                "action": "query", "prop": "imageinfo", "titles": "|".join(batch),
                "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1280, "iiextmetadatalanguage": "en",
                "iiextmetadatafilter": "ObjectName|ImageDescription|Artist|LicenseShortName|GPSLatitude|GPSLongitude|Categories",
                **cont,
            })
            for p in d["query"]["pages"]:
                if "imageinfo" in p:
                    info[p["title"]] = p["imageinfo"][0]
                elif p.get("missing") or p.get("invalid"):
                    info[p["title"]] = None
            if "continue" not in d:
                break
            cont = d["continue"]
        save()


# ---------------------------------------------------------------- how vivid is it?

def colorfulness(jpeg: bytes) -> list[float]:
    """Hasler & Süsstrunk colorfulness, plus mean and spread of brightness, from a tiny thumbnail."""
    from PIL import Image
    img = Image.open(BytesIO(jpeg)).convert("RGB")
    px = list(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata())
    n = len(px)
    rg = [r - g for r, g, b in px]
    yb = [(r + g) / 2 - b for r, g, b in px]
    lum = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px]
    mean = lambda xs: sum(xs) / n
    std = lambda xs, m: (sum((x - m) ** 2 for x in xs) / n) ** 0.5
    m_rg, m_yb, m_l = mean(rg), mean(yb), mean(lum)
    colorful = (std(rg, m_rg) ** 2 + std(yb, m_yb) ** 2) ** 0.5 + 0.3 * (m_rg ** 2 + m_yb ** 2) ** 0.5
    return [round(colorful, 1), round(m_l, 1), round(std(lum, m_l), 1)]


def score_vividness(entries: list[dict], scores: dict, save) -> None:
    """Scores photos one at a time, slowly (Wikimedia limits scripts that fetch many thumbnails).
    Progress is saved as it goes, so an interrupted run picks up where it left off."""
    todo = [e for e in entries if e["f"] not in scores]
    if not todo:
        return
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("   (Pillow isn't installed, so photos aren't scored for vividness)", file=sys.stderr)
        return
    print(f"   scoring {len(todo)} photos for vividness (this takes a while)...", file=sys.stderr)
    for i, e in enumerate(todo, 1):
        url = f"{THUMBS}{e['f']}/120px-{e.get('n') or e['f'].rsplit('/', 1)[1]}"
        try:
            scores[e["f"]] = colorfulness(http_get(url, tries=6))
        except SystemExit:
            print(f"   Wikimedia wants a break; stopping after {i - 1}. Run again later to finish.", file=sys.stderr)
            break
        except Exception as ex:  # one bad thumbnail shouldn't stop the build
            print(f"   couldn't score {e['f']}: {ex}", file=sys.stderr)
        if i % 50 == 0:
            save()
            print(f"   vividness {i}/{len(todo)}", file=sys.stderr)
        time.sleep(2.5)
    save()


# ---------------------------------------------------------------- Pexels

def fetch_pexels(key: str, cache: dict, save) -> None:
    """Runs each search for tall and wide photos. Results are cached, so a run cut short by the
    hourly limit (200 searches) picks up where it left off."""
    for query in PEXELS_SEARCHES:
        for orientation in ("portrait", "landscape"):
            slot = f"{query}|{orientation}"
            if slot in cache:
                continue
            url = PEXELS_API + "?" + urllib.parse.urlencode(
                {"query": query, "orientation": orientation, "size": "large", "per_page": 80, "locale": "en-US"})
            req = urllib.request.Request(url, headers={"Authorization": key, "User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data, remaining = json.load(r), int(r.headers.get("X-Ratelimit-Remaining") or 999)
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise SystemExit("Pexels didn't accept the key in tools/.pexels-key. Check it and try again.")
                print(f"   Pexels said {e.code}; stopping for now (run again later to finish).", file=sys.stderr)
                return
            cache[slot] = [{"id": p["id"], "w": p["width"], "h": p["height"], "u": p["src"]["original"],
                            "a": p.get("photographer") or "", "t": p.get("alt") or ""} for p in data.get("photos", [])]
            save()
            print(f"   pexels {len(cache)}/{len(PEXELS_SEARCHES) * 2}: {slot} ({len(cache[slot])})", file=sys.stderr)
            if remaining < 5:
                print("   Pexels hourly limit reached; run again in an hour to finish.", file=sys.stderr)
                return
            time.sleep(0.3)


def score_pexels(photos: list[dict], scores: dict, save) -> None:
    """Measures color and contrast from a tiny preview (Pexels' image service handles this happily)."""
    from concurrent.futures import ThreadPoolExecutor
    todo = [p for p in photos if str(p["id"]) not in scores]
    if not todo:
        return
    print(f"   measuring colors of {len(todo)} Pexels photos...", file=sys.stderr)

    def one(p: dict):
        try:
            return str(p["id"]), colorfulness(http_get(f"{p['u']}?auto=compress&cs=tinysrgb&w=96", tries=3))
        except Exception:
            return str(p["id"]), None

    with ThreadPoolExecutor(max_workers=24) as pool:
        for i, (pid, result) in enumerate(pool.map(one, todo), 1):
            if result:
                scores[pid] = result
            if i % 500 == 0:
                save()
                print(f"   colors {i}/{len(todo)}", file=sys.stderr)
    save()


def pexels_caption(alt: str) -> str:
    alt = re.sub(r"\s+", " ", alt).strip(" .")
    return shorten(alt[:1].upper() + alt[1:], 90) if alt else ""


# ---------------------------------------------------------------- cleaning up text

def plain(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def mostly_latin(s: str) -> bool:
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and sum(c < "ɐ" for c in letters) / len(letters) > 0.9


def first_sentence(text: str) -> str:
    text = re.sub(r"^(English|en)\s*:\s*", "", text)
    text = re.split(r"\s(?:Deutsch|Français|Español|Italiano|Polski|Nederlands|Português|Русский|Українська)\s*:", text)[0]
    for m in re.finditer(r"\.\s", text):
        before = text[:m.start()].rsplit(" ", 1)[-1]
        if before.lower() not in {"mt", "st", "ft", "ca", "approx", "no", "nr", "e.g", "i.e", "u.s", "n.p"} and len(before) > 1:
            return text[:m.start()]
    return text.rstrip(". ")


def shorten(text: str, limit: int = 90) -> str:
    if len(text) <= limit:
        return text
    cut = max(text.rfind(", ", 0, limit), text.rfind("; ", 0, limit))
    if cut > 35:
        return text[:cut]
    return text[:text.rfind(" ", 0, limit - 1)].rstrip(",;:- ") + "…"


def file_title(title: str, meta: dict) -> str:
    t = plain(meta.get("ObjectName", {}).get("value")) or title[5:]
    t = re.sub(r"\.(jpe?g)$", "", t, flags=re.I).replace("_", " ")
    t = re.sub(r"\s*-\s*Flickr\s*-.*$", "", t)                          # "- Flickr - username"
    t = re.sub(r"\((?:[^)]*\d{5,}[^)]*|cropped|edit(?:ed)?|retouched|\d{1,3})\)", "", t, flags=re.I)
    t = re.sub(r"\b(?:DSC|DSCF|IMG|DJI|PANO|P)[_ -]?\d{3,}\w*|\b\d+px\b", "", t, flags=re.I)
    t = re.sub(r",\s*,?\s*DD\s*\d+.*$", "", t)                           # "..., , DD 10"
    t = re.sub(r"\b(?:19|20)\d{2}[-_. ]?\d{2}[-_. ]?\d{2}\b|\b\d{8,}\b", "", t)   # dates, ids
    t = re.sub(r"(?<=[^\W\d_])\d{1,2}$|\s+(?:[-,]\s*)?\d{1,3}$|\s+edit\d*$", "", t, flags=re.I)  # trailing numbers
    return re.sub(r"\s{2,}", " ", t).strip(" -,_.;")


BOILERPLATE = re.compile(r"^(this is an? (photo|picture|image)|this (photo|image|file|media)|photo taken|taken (on|at|with|by)|"
                         r"uploaded)|natural monument with the id|cultural heritage monument with the id", re.I)


def polish(t: str) -> str:
    t = re.split(r"\s+--\s+", t)[0]                                            # "Place -- 2025 -- 0117"
    t = re.sub(r"^(high[- ]resolution )?(an? )?(photo|picture|image|photograph) of ", "", t, flags=re.I)
    t = re.sub(r"\s*\([^)]*[^\x00-ɏ][^)]*\)", "", t)                     # "(झारकोट)"
    t = re.sub(r"\s*\(\s*[A-Z][a-z]+ [a-z]+(?: [a-z]+)?\s*\)", "", t)          # "(Bradypus variegatus)"
    t = re.sub(r"(?:[\s,-]+\d{3,})+$", "", t)                                  # "..., 0539 9409", "Himal-3794"
    t = re.sub(r"\s+(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+)?"
               r"(?:19|20)\d{2}$", "", t)                                      # "... December 2016"
    t = re.sub(r"\s+([,;.])", r"\1", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -,;.")
    return t[:1].upper() + t[1:]


def caption(title: str, meta: dict) -> str:
    """A friendly English caption: the photographer's description when it's short, else the file name."""
    desc = first_sentence(plain(meta.get("ImageDescription", {}).get("value")))
    if BOILERPLATE.search(desc):
        desc = ""
    name = file_title(title, meta)
    artist = nice_artist(meta)
    if len(artist) > 3:                        # the photographer is credited on its own line already
        name = re.sub(re.escape(artist), "", name, flags=re.I)
    if desc and mostly_latin(desc) and 8 <= len(desc) <= 95:
        return polish(desc)
    if name and mostly_latin(name) and len(name) >= 4:
        return polish(shorten(name))
    return polish(shorten(desc) if desc else name)


def nice_artist(meta: dict) -> str:
    a = plain(meta.get("Artist", {}).get("value"))
    a = re.sub(r"(?i)link back to creator infobox template|wikidata:?\s*Q\d+|\(talk\)|User:", "", a)
    a = re.sub(r"(?i)^(this )?(photo|picture|image)( was)? (taken )?by\s+|^(photographer|author)\s*:\s*", "", a.strip())
    a = re.split(r"\s*(?:\(|\||;|\bfrom\b|\bderivative work\b)", a)[0]
    return a.strip(" .,-")[:40] or "Unknown photographer"


def to_entry(title: str, ii: dict, kind: str) -> dict:
    meta = ii.get("extmetadata", {})
    m = re.match(r"https://upload\.wikimedia\.org/wikipedia/commons/([^?]+)", ii["url"])
    if not m:
        raise ValueError(f"unexpected file url: {ii['url']}")
    entry = {
        "f": m.group(1),                       # path of the original, e.g. "a/ab/Some_lake.jpg"
        "w": ii["width"], "h": ii["height"],
        "t": caption(title, meta),
        "a": nice_artist(meta),
        "l": plain(meta.get("LicenseShortName", {}).get("value")) or "see source",
        "k": kind,                             # "l" landscape, "a" animal
    }
    thumb = re.search(r"/1280px-([^?]+)", ii["thumburl"])
    if thumb and thumb.group(1) != entry["f"].rsplit("/", 1)[1]:
        entry["n"] = thumb.group(1)            # Commons shortens very long thumbnail names
    try:
        entry["g"] = [round(float(meta["GPSLatitude"]["value"]), 4), round(float(meta["GPSLongitude"]["value"]), 4)]
    except (KeyError, ValueError):
        pass
    return entry


def usable(ii: dict | None, min_width: int = MIN_WIDTH) -> bool:
    if not ii or ii.get("mime") != "image/jpeg" or "thumburl" not in ii:
        return False
    return ii["width"] >= min_width and ASPECT[0] <= ii["width"] / ii["height"] <= ASPECT[1]


def tall_usable(ii: dict | None) -> bool:
    if not ii or ii.get("mime") != "image/jpeg" or "thumburl" not in ii:
        return False
    return ii["width"] >= 1280 and ii["height"] >= 1920 and TALL_ASPECT[0] <= ii["width"] / ii["height"] <= TALL_ASPECT[1]


def words(title: str, ii: dict) -> str:
    meta = ii.get("extmetadata", {})
    return " ".join([title, plain(meta.get("ImageDescription", {}).get("value"))[:400],
                     plain(meta.get("Categories", {}).get("value"))])


# ---------------------------------------------------------------- contact sheet for picking animals

def write_animal_sheet(candidates: list[tuple[str, dict]]) -> Path:
    tiles = "\n".join(
        f'<figure><img loading="lazy" src="{THUMBS}{e["f"]}/250px-{e.get("n") or e["f"].rsplit("/", 1)[1]}">'
        f'<figcaption><b>{i}</b> {html.escape(title[5:60])}</figcaption></figure>'
        for i, (title, e) in enumerate(candidates))
    page = CACHE / "animal_candidates.html"
    page.write_text(f"""<!doctype html><meta charset="utf-8"><title>Animal candidates</title>
<style>body{{margin:8px;background:#111;color:#ddd;font:11px system-ui}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px}}
figure{{margin:0}}img{{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-radius:4px}}
figcaption{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}b{{color:#fc6}}</style>
<main>{tiles}</main>""")
    (CACHE / "animal_candidates.json").write_text(json.dumps([t for t, _ in candidates], ensure_ascii=False))
    return page


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fresh", action="store_true", help="ignore tools/.cache and download everything again")
    ap.add_argument("--animals", action="store_true", help="write a contact sheet of funny-animal candidates")
    ap.add_argument("--score-colors", action="store_true", help="measure each photo's colors (slow, resumable)")
    args = ap.parse_args()

    CACHE.mkdir(exist_ok=True)
    files = {name: CACHE / f"{name}.json" for name in ("sources", "info", "vivid")}
    if args.fresh:
        for f in files.values():
            f.unlink(missing_ok=True)
    cached = {name: json.loads(f.read_text()) if f.exists() else {} for name, f in files.items()}
    sources, info, vivid = cached["sources"], cached["info"], cached["vivid"]
    saver = lambda name, obj: (lambda: files[name].write_text(json.dumps(obj)))

    # sources.json maps kind -> gallery page -> file titles
    if not isinstance(next(iter(sources.values()), {}), dict) or not sources:
        print("1/4  Finding featured pictures...", file=sys.stderr)
        sources = {"landscape": {}, "animal": {}}
        for kind, galleries in (("landscape", LANDSCAPE_GALLERIES), ("animal", ANIMAL_GALLERIES)):
            for prefix in galleries:
                for page in gallery_pages(prefix):
                    sources[kind][page] = files_on(page)
                    print(f"   {len(sources[kind][page]):4d}  {page}", file=sys.stderr)
        saver("sources", sources)()

    missing = [q for q in TALL_SEARCHES if q not in sources.get("tall", {})]
    if missing:
        print("1b/4 Finding tall photos...", file=sys.stderr)
        for q in missing:
            sources.setdefault("tall", {})[q] = search_files(q)
            print(f"   {len(sources['tall'][q]):4d}  {q[:70]}...", file=sys.stderr)
        saver("sources", sources)()
    tall_titles = [t for q in TALL_SEARCHES for t in sources["tall"].get(q, [])]

    picks = [ln.split("#")[0].strip() for ln in ANIMAL_PICKS.read_text().splitlines()] if ANIMAL_PICKS.exists() else []
    picks = [p for p in picks if p]
    every = [t for kind in ("landscape", "animal") for titles in sources[kind].values() for t in titles] + tall_titles
    print("2/4  Getting photo details...", file=sys.stderr)
    fetch_info(every + [FIRST_PHOTO, *EXTRA_LANDSCAPES] + picks, info, saver("info", info))

    print("3/4  Choosing landscapes...", file=sys.stderr)
    candidates, extra_paths = [], set()
    # Animals are never landscapes, even when a scenery search turns them up.
    seen = {FIRST_PHOTO} | {t for titles in sources["animal"].values() for t in titles}
    ordered = [(t, "extra") for t in EXTRA_LANDSCAPES] + [
        (t, page) for page, titles in sources["landscape"].items() for t in titles] + [
        (t, "tall") for t in tall_titles]
    for title, page in ordered:
        ii = info.get(title)
        if title in seen or not (usable(ii) if page != "tall" else tall_usable(ii)):
            continue
        text = words(title, ii)
        described = title + " " + plain(ii.get("extmetadata", {}).get("ImageDescription", {}).get("value"))
        if SKIP.search(text) or CITY.search(described):
            continue
        if "/Settlements" in page and (not SCENERY.search(text) or URBAN.search(text)):
            continue
        seen.add(title)
        candidates.append((title, to_entry(title, ii, "l")))
        if page == "extra":
            extra_paths.add(candidates[-1][1]["f"])

    if args.score_colors:
        score_vividness([e for _, e in candidates], vivid, saver("vivid", vivid))
    scored = sorted((vivid[e["f"]][0] for _, e in candidates if e["f"] in vivid))
    if len(scored) < 0.8 * len(candidates):
        if args.score_colors:
            print(f"   only {len(scored)} of {len(candidates)} photos scored so far; run again to finish", file=sys.stderr)
        scored = []
    cut_low = scored[int(len(scored) * DROP_DULLEST)] if scored else 0
    cut_high = scored[int(len(scored) * (1 - BOOST_VIVID))] if scored else 0
    photos = []
    for title, e in candidates:
        c, lum, _contrast = vivid.get(e["f"], (cut_high, 128, 50)) if scored else (0, 128, 50)
        if scored and title not in EXTRA_LANDSCAPES and (c < cut_low or lum < 45):
            continue                           # too dull or too dark
        if (c >= cut_high) if scored else VIVID.search(words(title, info[title])):
            e["b"] = 1                         # "boost": extra vivid
        photos.append(e)

    key = PEXELS_KEY_FILE.read_text().strip() if PEXELS_KEY_FILE.exists() else ""
    if key:
        print("3b/4 Adding Pexels photos...", file=sys.stderr)
        pex_file, score_file = CACHE / "pexels.json", CACHE / "pexels_scores.json"
        pex = json.loads(pex_file.read_text()) if pex_file.exists() else {}
        fetch_pexels(key, pex, lambda: pex_file.write_text(json.dumps(pex)))
        unique = {}
        wanted = {f"{q}|{o}" for q in PEXELS_SEARCHES for o in ("portrait", "landscape")}
        for slot, found in pex.items():
            if slot not in wanted:
                continue
            for ph in found:
                unique.setdefault(ph["id"], ph)
        pool = [ph for ph in unique.values()
                if not PEOPLE.search(ph["t"]) and not NOT_SCENERY.search(ph["t"]) and min(ph["w"], ph["h"]) >= 1800
                and (TALL_ASPECT[0] <= ph["w"] / ph["h"] <= TALL_ASPECT[1] or 1.2 <= ph["w"] / ph["h"] <= ASPECT[1])]
        scores = json.loads(score_file.read_text()) if score_file.exists() else {}
        score_pexels(pool, scores, lambda: score_file.write_text(json.dumps(scores)))
        colors = sorted(scores[str(ph["id"])][0] for ph in pool if str(ph["id"]) in scores)
        floor = colors[int(len(colors) * PEXELS_DROP_DULLEST)] if colors else 0
        vivid_cut = colors[int(len(colors) * 0.8)] if colors else 0     # the most colorful fifth comes up first
        pexels_photos = []
        for ph in pool:
            c, lum, _contrast = scores.get(str(ph["id"]), (floor, 128, 50))
            if c < floor or not 45 <= lum <= 215:
                continue                       # dull, too dark, or washed out
            entry = {"f": f"pexels/{ph['id']}", "u": ph["u"], "w": ph["w"], "h": ph["h"],
                     "t": pexels_caption(ph["t"]), "a": ph["a"] or "Pexels photographer", "l": "Pexels", "k": "l"}
            if c >= vivid_cut:
                entry["b"] = 1
            pexels_photos.append(entry)
        print(f"   {len(pexels_photos)} Pexels photos kept of {len(unique)} found", file=sys.stderr)
        # With Pexels in the mix, keep only Wikimedia's most colorful shots (and her mountain).
        photos = [e for e in photos if e.get("b") or e["f"] in extra_paths] + pexels_photos

    rejects_file = HERE / "rejects.txt"          # photos weeded out by eye (see tools/review_sheet.py)
    if rejects_file.exists():
        rejects = {ln.split("#")[0].strip() for ln in rejects_file.read_text().splitlines()} - {""}
        photos = [e for e in photos if e["f"] not in rejects]

    print("4/4  Adding the hand-picked animals...", file=sys.stderr)
    landscape_titles = {t for t, _ in candidates}
    for title in picks:
        ii = info.get(title)
        if not usable(ii, min_width=1280) or title in landscape_titles:
            print(f"   skipping animal pick (not usable): {title}", file=sys.stderr)
            continue
        seen.add(title)
        photos.append(to_entry(title, ii, "a"))

    if args.animals:
        pool, shown = [], set(picks) | landscape_titles
        for page, titles in sources["animal"].items():
            for title in titles:
                ii = info.get(title)
                fits = FUNNY_BIRDS if "/Birds" in page else CHARACTER
                if title not in shown and usable(ii, min_width=1280) and fits.search(words(title, ii)):
                    shown.add(title)
                    pool.append((title, to_entry(title, ii, "a")))
        print(f"   contact sheet: {write_animal_sheet(pool).relative_to(ROOT)} ({len(pool)} candidates)", file=sys.stderr)

    first = to_entry(FIRST_PHOTO, info[FIRST_PHOTO], "l")
    first["t"] = FIRST_TITLE
    OUT.write_text(json.dumps({"built": date.today().isoformat(), "first": first, "photos": photos},
                              ensure_ascii=False, separators=(",", ":")))
    n_animals = sum(p["k"] == "a" for p in photos)
    print(f"Done: {len(photos) - n_animals} landscapes ({sum('b' in p for p in photos)} extra vivid), "
          f"{n_animals} animals -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
