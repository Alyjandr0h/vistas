# Paradise

A gift for Mom: breathtaking photos of the world, a few funny animals, and her songs from jw.org.
It's a web app she adds to her phone's Home screen, so it opens full screen like any other app.

## What's where

| File | What it does |
| --- | --- |
| `js/app.js` | Your letter and greeting (`FROM_YOU`), the screens, settings, keeping the screen on |
| `js/photos.js` | The slideshow: Back, Save, Share, screen saver, and `shouldShowAnimal()` |
| `js/music.js` | The jw.org player: shuffle, Back, favorites, lock screen and car buttons |
| `photos.json` | The photo list (built by `tools/build_photos.py`, don't edit by hand) |
| `tools/animal_picks.txt` | The hand-picked funny animals |
| `sw.js` | Makes it installable and lets it open without internet |

## Changing things

- **The letter, her name, your signature:** `FROM_YOU` at the top of `js/app.js`.
- **How often animals show up:** `shouldShowAnimal()` at the top of `js/photos.js`.
- **Song language:** `LANGUAGE` in `js/music.js` (`E` English, `S` Spanish, ...).
- **Refresh the photos** (new featured pictures appear on Commons every week):

  ```bash
  python3 tools/build_photos.py
  ```

  With a Pexels key in `tools/.pexels-key` (one line, never uploaded), it also pulls jaw-dropping
  landscapes from Pexels, skipping photos with people in them and the least colorful ones.
  Searches are in `PEXELS_SEARCHES`. Pexels allows 200 searches an hour; a cut-short run resumes.
- **Weed out photos by eye:** `python3 tools/review_sheet.py pexels` makes a numbered contact sheet
  (`tools/.cache/review.html`); put the ids of ones to drop in `tools/rejects.txt` and rebuild.
- **Pick more animals:** `python3 tools/build_photos.py --animals`, open
  `tools/.cache/animal_candidates.html`, and copy the `File:...` names you like into `tools/animal_picks.txt`.
- **App icon and the day/night paintings:** `python3 tools/make_icons.py` redraws them.
  `python3 tools/icon_options.py` renders the other icon ideas side by side.
- **Playlists:** `PLAYLISTS` in `js/music.js` (which jw.org collections each one draws from).

After changing files, bump `VERSION` in `sw.js` so her phone picks up the new version.

## Trying it on your computer

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Where the content comes from

- **Photos:** [Pexels](https://www.pexels.com/license/) (free to use) and
  [Wikimedia Commons Featured Pictures](https://commons.wikimedia.org/wiki/Commons:Featured_pictures)
  (freely licensed). The photographer shows under each photo, and in the text that goes along when
  she shares one.
- **Music:** played straight from jw.org's public song lists and MP3 files. Nothing is copied or stored
  elsewhere, which is what jw.org's terms allow for free, non-commercial apps.
