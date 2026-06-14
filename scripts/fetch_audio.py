#!/usr/bin/env python3
"""Find licence-clean (CC0 / public-domain / CC-BY) audio on Wikimedia Commons.
Search a term, keep only audio files, report URL + license + duration so we can
pick the best, then optionally download + convert to a looping mp3 in public/.
"""
import json
import sys
import urllib.parse
import urllib.request

UA = "ArtHistoryAtlas/0.1 (steepening@gmail.com)"
AUDIO_EXT = (".ogg", ".oga", ".wav", ".flac", ".mp3", ".opus", ".m4a")
OK_LICENSES = ("cc0", "public domain", "pd-", "cc-by", "cc by", "attribution")


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=30))


def search(term, limit=20):
    d = api({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": limit, "srsearch": term,
    })
    titles = [r["title"] for r in d.get("query", {}).get("search", [])]
    return [t for t in titles if t.lower().endswith(AUDIO_EXT)]


def info(title):
    d = api({
        "action": "query", "format": "json", "prop": "imageinfo",
        "titles": title, "iiprop": "url|size|extmetadata|mediatype",
    })
    pages = d.get("query", {}).get("pages", {})
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        lic = (meta.get("LicenseShortName", {}) or {}).get("value", "?")
        artist = (meta.get("Artist", {}) or {}).get("value", "")
        return {
            "title": title,
            "url": ii.get("url"),
            "license": lic,
            "size": ii.get("size"),
            "artist": artist[:60],
        }
    return None


def ok(lic):
    l = (lic or "").lower()
    return any(k in l for k in OK_LICENSES)


if __name__ == "__main__":
    terms = sys.argv[1:] or ["crowd ambience"]
    for term in terms:
        print(f"\n### {term}")
        for t in search(term):
            i = info(t)
            if not i or not i["url"]:
                continue
            flag = "OK " if ok(i["license"]) else "no "
            kb = (i["size"] or 0) // 1024
            print(f"  {flag}[{i['license']}] {kb}KB  {i['url']}")
