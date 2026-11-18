# GelasTinta design history

A record of each look the site has had, so an earlier style can be looked up, compared or brought back.
Each style lists what it looked like, where its files live, and a prompt that would rebuild it.

## Style 1 · Classic sheets (Oct to 18 Nov 2026)

**Where it lives**
- Git branch `design/classic-2026-11` (commit 6ff828d, `main` after PR #11). Check it out to see every page exactly as it was.
- `tools/home/classic-main.dc.html` keeps the classic Home page file (the new Home is built from parts of it).
- Screenshots: `docs/design-history/classic-*.jpg` (Home, Talks, Products, Author, Projects, one talk, one project page).

**The look**
- Engineering drawing sheets. Paper backgrounds (#EDEFF2 on Home, Products and Author, #F3EFE6 on talks), thin ink rules (`rule-t`, `rule-b`), grid paper heroes (`grid-bg`), white and dark bands.
- Type: Titillium Web for everything (headings weight 800, tight tracking), Ubuntu Mono for kickers, labels and numbers. Kickers like "Sheet 05 · Talk & reviews", "01 · The story".
- Header: sticky paper strip with the beaker logo (also the dark mode switch), brand name and a plain nav.
- Footer: dark sheet with "Get in touch", email, social chips, the site map and a drawing title block (DRAWN BY · SHEET · SCALE 1 : IDEA · REV.), plus the Wada palette credit.
- Home: dark hero with a photo slideshow, "Ideas as in Ink" headline and the ink flask as a labelled anatomy figure. Then About (Feynman quote), Take it apart (three looping 3D teardown clips and a slide projector of study pack teardowns), Featured works and Talks bookshelves, Explore cards.
- Palettes: site Wada No. 360 (Olympic Blue #5A82B3, Vandar Poel's Blue #064F6E, Taupe Brown #7A4456, Violet #4F4086). Each talk has its own Wada combination.
- Motion: anime.js reveals, bookshelves, hover states. Pixel characters (v2) as story beats and v3 scenes beside headings.
- Document previews (BEng, MSc, Gesture Music handbook) scroll inside a framed box.

**Prompt to rebuild it**
> Style the GelasTinta site as a set of engineering drawing sheets: paper backgrounds with thin ink rules and grid paper heroes, Titillium Web headings at weight 800 with tight tracking, Ubuntu Mono kickers numbered like drawing sheets ("Sheet 05 · Talk & reviews", "01 · The story"), a sticky paper header with the beaker logo, and a dark footer with a drawing title block (Drawn by, Sheet, Scale 1 : Idea, Rev.). Keep the Wada No. 360 site palette and each talk's own Wada palette. Home opens on a dark photo slideshow with the labelled ink flask figure.

## Style 2 · Home v2 prototype (18 Nov 2026, PR #12, superseded by #13)

**Where it lives**
- Git branch `home-v2` (commits f0d0b4a, cfb167d).
- The canvas board "Home v2 (prototype, scroll story)", until it is removed.

**The look**
- One page told as eight full screen colour scenes in the site palette (Hello, Hi, Take apart, Builds, Talks, Beliefs, Packs, Contact).
- Anton display headings with slightly turned letters, Instrument Serif lines under them, a film grain over everything, small four point stars.
- The v4 pixel character scenes (late night cram, deadline rush, reading, music, exam, tea and rain, portraits).
- A chapter ruler fixed along the bottom, with ticks and the current chapter lit.
- Inspired by the presentation style of nesilnoble.com, with the site's own content and colours.

**Prompt to rebuild it**
> Make a one page prototype of the GelasTinta Home as a scroll story: eight full screen scenes, each in one site palette colour, giant Anton headings whose letters tilt a little and settle as you scroll, Instrument Serif lines under them, a soft film grain, little four point stars, the owner's pixel character scenes as the visuals, a chapter ruler along the bottom of the screen and the background colour fading from scene to scene.

## Style 3 · Scroll story, whole site (from 18 Nov 2026, PR #13)

**Where it lives**
- Branch `story-v2`. The shared layer is `tools/story.py`, and the Home page comes from `tools/home/make_home.py`.

**The look**
- Every page (not the study pack library) is a stack of cards inside a coloured frame. Each section pins when its end reaches the screen and the next slides over it.
- The frame colour follows the page's palette chapter by chapter (talks use their own Wada colours). Header text and rail switch between ink and paper to stay readable.
- A chapter rail on the left under the title, with ticks, progress and the pixel character walking down it. He waves at each new chapter. On phones it becomes a chip at the bottom left.
- Anton headings (tilting letters on the live site), Instrument Serif accents, body text unchanged.
- Ink wipe between pages in the next page's colour.
- Mouse wheels glide smoothly. Trackpads keep their own native scrolling.
- Index heroes are scenes on the frame colour, with v3 rooms and v2 characters walking in (workshop on Projects, study room on Products).
- Index pages (Talks, Projects, Products, Author) read like Home: each chapter opens on a full colour scene with a giant Anton heading and an Instrument Serif kicker. Sections that hold objects (shelves, posters, polaroids, the services menu, the workshop) sit wholly on the colour. Text heavy ones (quote builder, FAQ, education, the kit) open on a colour band and continue on paper.
- Bookshelves (talks, projects, study packs) feel like choosing a book: books rise onto the shelf as it comes into view, lean away from the pointer and lift on hover, and the chosen book is pulled out with a tilt while its cover swings open.
- Home: the ink flask as the centrepiece of "Ideas in Ink", teardown previews as plain title bars, Featured works and Latest talks rows moving sideways as you scroll.
- Every page ends on the same "Get in touch" scene (tea and rain pixel scene, email to copy, socials, site map, palette credit).
- Document previews are books: two page spreads with the cover alone on the right, page turn animation, arrows, keys and swipe.

**Prompt to rebuild it**
> Restyle every GelasTinta page (not the study pack library) as a scroll story: sections are rounded cards that pin and get covered by the next one, inside a frame whose colour follows the page's palette chapter by chapter. Index pages open each chapter on a full colour scene like Home, and bookshelves rise into view, lean towards the pointer and pull a book out with its cover swinging open. Add a chapter rail on the left under the title with the pixel character walking down it, Anton headings with gently tilting letters, an ink wipe between pages, smooth wheel scrolling, a shared "Get in touch" closing scene, and document previews as page turning books. Keep every word of content and every palette.
