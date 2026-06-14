<div align="center">

# ars gratia artis

### *A fancy night walk under the shining masters that illuminate the world's art galleries.*

**[✦ Enter the museum →](https://nuit-etoilee.vercel.app)**

<br>

<img alt="Caravaggio · Medusa" src="https://commons.wikimedia.org/wiki/Special:FilePath/Caravaggio%20-%20Medusa%20-%20Google%20Art%20Project.jpg?width=520" height="210">
<img alt="Vermeer · Young Woman with a Pearl Necklace" src="https://commons.wikimedia.org/wiki/Special:FilePath/Jan%20Vermeer%20van%20Delft%20-%20Young%20Woman%20with%20a%20Pearl%20Necklace%20-%20Google%20Art%20Project.jpg?width=520" height="210">
<img alt="Munch · Evening on Karl Johan" src="https://commons.wikimedia.org/wiki/Special:FilePath/Edvard%20Munch%20-%20Evening%20on%20Karl%20Johan%20Street%20%281892%29.jpg?width=520" height="210">
<img alt="Turner · Interior of a Romanesque Church" src="https://commons.wikimedia.org/wiki/Special:FilePath/Joseph%20Mallord%20William%20Turner%20%281775-1851%29%20-%20Interior%20of%20a%20Romanesque%20Church%20-%20N05529%20-%20Tate.jpg?width=520" height="210">

<br><br>

**Sixty-nine masters · six hundred paintings · five museums to wander.**
Every face below is a star you can fly to.

<br>

<img alt="Leonardo da Vinci" src="https://commons.wikimedia.org/wiki/Special:FilePath/Francesco%20Melzi%20-%20Portrait%20of%20Leonardo.png?width=200" height="76">
<img alt="Sandro Botticelli" src="https://commons.wikimedia.org/wiki/Special:FilePath/Sandro%20Botticelli%20Self-portrait%20ca%201475.jpg?width=200" height="76">
<img alt="Caravaggio" src="https://commons.wikimedia.org/wiki/Special:FilePath/Bild-Ottavio%20Leoni%2C%20Caravaggio.jpg?width=200" height="76">
<img alt="Rembrandt" src="https://commons.wikimedia.org/wiki/Special:FilePath/Rembrandt%20van%20Rijn%20-%20Self-Portrait%20-%20Google%20Art%20Project.jpg?width=200" height="76">
<img alt="J. M. W. Turner" src="https://commons.wikimedia.org/wiki/Special:FilePath/Joseph%20Mallord%20William%20Turner%20auto-retrato.jpg?width=200" height="76">
<img alt="Claude Monet" src="https://commons.wikimedia.org/wiki/Special:FilePath/Claude%20Monet%201899%20Nadar%20crop.jpg?width=200" height="76">
<img alt="Pierre-Auguste Renoir" src="https://commons.wikimedia.org/wiki/Special:FilePath/Pierre%20Auguste%20Renoir%2C%20uncropped%20image.jpg?width=200" height="76">
<img alt="Vincent van Gogh" src="https://commons.wikimedia.org/wiki/Special:FilePath/Self-portrait%20-%20Vincent%20van%20Gogh.jpg?width=200" height="76">
<img alt="Edvard Munch" src="https://commons.wikimedia.org/wiki/Special:FilePath/Edvard%20Munch%201933-2.jpg?width=200" height="76">

</div>

<br>

> **Two ways to look.** Drift back and the whole of art history is a night sky —
> each movement a glowing galaxy, each painter a star, threads of influence
> drawn between the ones who knew one another. Lean in, pick a star, and you
> walk through the doors of a museum built for that artist alone: their real
> paintings on the walls under warm light, a hush of voices behind you,
> footsteps on stone, the world softening at the edges of your gaze.

Choose your hall while you enter — the dark **Constellation Gallery**, the
daylit nave of the **Musée d'Orsay**, the timber calm of an **eco-museum in
Chiba**, the white-cube **HongKun**, or the paper-and-shadow **Nezu** — and the
framing, the light and the way in all change to match.

Every biography, date, painting, story and fact is drawn from **Wikipedia and
Wikimedia Commons**. Nothing here is an AI's invention — if it isn't on
Wikipedia, it isn't here.

*Inspired by [Pat Simmons' talk](https://www.youtube.com/watch?v=TzJCly4YgDQ).*

<br>

---

<details>
<summary><b>Under the hood</b> — stack, data, and how to run it</summary>

<br>

### What's inside

- **The Constellation** — a zoomable, infinite-canvas timeline; each movement a
  galaxy placed by date, its artists rising as portrait-stars linked by
  influence lines you can hover for the story. Double-click to zoom; scroll and
  drag to roam.
- **Five museums** — pick one from the artist card. Each is a first-person space
  (drag to look, WASD to walk) with its own architecture, light and curatorial
  framing, hung with the artist's real paintings.
- **An immersive soundscape** — a generative cosmic pad over the stars that
  becomes a crowd at the museum door and hushes as you turn in; footsteps as you
  walk; and, before a single work, the sound of its subject — surf, birdsong, a
  café, rain, a fire.
- **Inspect & full screen** — click a painting for a high-resolution lightbox
  with its story and facts; double-click for full screen with tone presets.
- **Three languages** — English, French, Japanese.

### Scope

12 movements from Medieval & Gothic through Expressionism are covered in depth
(3+ artists each, 8+ paintings per gallery). Later movements (Cubism →
Contemporary) appear for the full sweep of the timeline, but their artists are
still in copyright — Commons can't host those paintings freely — so those
galleries are sparse or card-only by design.

### Stack

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4
- react-three-fiber · drei · @react-three/postprocessing (the galleries)
- Web Audio API (the soundscape) · GSAP (the filter)
- Neon Postgres · Drizzle ORM
- Data: Wikidata SPARQL · Wikipedia REST · Wikimedia Commons (`Special:FilePath`)

### Run it locally

```bash
cp .env.example .env.local      # add your Neon DATABASE_URL
npm install
npm run db:push                 # create the tables
npm run ingest                  # populate from Wikipedia/Wikidata/Commons (~5 min)
npm run dev                     # http://localhost:3000
```

`npm run ingest:dry` reports per-artist painting counts without writing.
Deploys on Vercel; set `DATABASE_URL` in the project's environment (never
committed).

### Attribution & licence

Artwork images are public-domain works from Wikimedia Commons, served through a
same-origin proxy (`/api/img`) restricted to Wikimedia hosts. Text is from
Wikipedia under CC BY-SA; non-English painting stories without a native-language
article are machine-translated from the English. The entrance-crowd sound is a
[public-domain recording](public/audio/CREDITS.txt) from Commons; the rest of
the audio is synthesised. Code is [MIT](./LICENSE) © 2026 Sizyph.

</details>
