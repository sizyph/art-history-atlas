// A compact how-to reference for *this* experience, handed to the docent so it
// can answer questions about the interface itself ("how do I walk?", "how do I
// change the language?"). The full human guide is docs/USER_GUIDE.md — keep this
// in sync with it.
export const INTERFACE_GUIDE = `
CONSTELLATION (home): a zoomable night sky of art movements, each holding its artists.
- Zoom with the mouse wheel or pinch; drag to pan; double-click/double-tap to zoom toward a point (hold Shift or Alt to zoom out).
- Click a movement or artist star to open it. The "Explore" button (top-left) opens a search panel with Movements and Artists tabs.
- The artist card shows a portrait, dates and a biography. The bio scrolls inside the card (mouse wheel over the text). Press "Listen" to hear it read aloud. Choose a museum, then press "Enter" to step into that artist's 3D gallery.

WALKING A GALLERY (first-person 3D room):
- Desktop: walk with W A S D or the arrow keys; click-and-drag to look around.
- Touch: use the on-screen joystick to walk; drag elsewhere to look.
- Movement keys are disabled while you are typing (e.g. a question).
- Walk up to a work and face it and the room dims while that painting's soundscape rises. Click a painting to open its story, facts and links; click the image to deep-zoom.
- Influence doorways: glowing arches on the far wall lead to galleries of related artists; walk up and click to travel there.

GUIDED TOUR: press "Guided tour" (bottom centre). It starts from the work you are nearest to and walks you stop to stop with narration. The tour bar shows progress (n / total) and has a list icon ("Jump to a work") to go to any work, plus Next and End tour. During the tour you can click the discussed painting to open deep-zoom while narration continues; that view shows a progress bar of the speech and a pause/play button so you can linger; closing it or pressing Next continues, and the zoom closes automatically when the guide moves on.

DEEP-ZOOM (studying a canvas up close): scroll to zoom, drag to pan, double-click to zoom in. The bottom bar holds a full-screen toggle, colour presets (Original, Vivid, Warm, Crisp), Fit, and the "?" docent. Close with the × at top-right.

ASK THE DOCENT ("?" button, on the right while roaming and in the deep-zoom bar): open it, then speak or type. Speaking shows a live transcript and sends after ~4 seconds of silence or when you press Stop (the browser asks for microphone permission the first time). Typing: write and press Enter. Answers know the museum, artist and the work you are viewing. When sound is on, a spoken question is answered aloud; a typed one answers in text with a "Listen" button.

SOUND & MUTE: a generative soundscape plays throughout. The speaker icon (bottom-right) is the master mute. Muting silences everything, including narration and the docent's voice; while muted the docent becomes a text-only chat and the "Listen" buttons are hidden (the text is still shown). Un-mute to bring voice back.

LANGUAGE: the EN · FR · 日本語 switcher at the top centre changes everything — the interface, artwork titles, stories, biographies, and the docent's replies.

FULL SCREEN: the full-screen button (bottom-left, and in the deep-zoom bottom bar) makes the experience fill the screen; press again to exit.
`.trim();
