# SKILL: Frontend Aesthetic — 1960s Occult Archival & Art Deco ("Reverse: 1999" Style)

## 1. Core Philosophy
You are building a vintage, enigmatic, aristocratic interface inspired by *Reverse: 1999*, 1960s British editorial clippings, classified occult dossiers, and 1920s Art Deco brass geometry. The UI must feel like an antique leather-bound archive or a luxury mid-century broadsheet newspaper infused with subtle alchemical mystery. Reject all modern sterile SaaS patterns.

## 2. Color Palette & Surface (Muted & Desaturated)
Never use pure saturated RGB colors. Every color must look aged, oil-painted, or printed on vintage stock.
- **Dark Mode (Primary — "The Velvet Study"):** Deep espresso/charcoal base (`#141311`, `#1C1A17`), secondary panels in warm dark umber (`#25221E`).
- **Light Mode (Alternative — "The Aged Broadsheet"):** Warm parchment/newsprint (`#EAE3D2`, `#DFD7C4`), secondary panels in bone (`#F4EFE6`).
- **Typography Ink:** Warm ivory (`#E6DEC8`) on dark surfaces; faded carbon ink (`#23201C`) on parchment surfaces.
- **Metallic & Retro Accents (CRITICAL):**
  - **Antique Brass / Muted Gold:** `#C5A059` or `#B38F48` (used for fine borders, geometric nodes, and active indicators).
  - **Alchemical Rust / Vintage Vermilion:** `#A8422B` or `#C85A32` (used for primary action seals, wax-stamp buttons, and warnings).
  - **Muted Olive / Patina Green:** `#4A5D4E` (used for secondary tags or status badges).

## 3. Pure-CSS Art Deco Framing & Texture (ZERO EXTERNAL ASSETS)
Simulate rich game-UI artistry using ONLY pure CSS, inline SVG, and Unicode:
- **Mandatory Paper/Film Grain Overlay:** Always include a global fixed non-interactive `<svg>` overlay (`pointer-events-none fixed inset-0 z-50 opacity-[0.04] mix-blend-overlay`) using `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3"/>` so the entire interface has a tactile, dusty vintage film/paper texture.
- **Double & Inset Borders:** Frame cards and modals like vintage bookplates or tarot cards. Use outer thin brass borders (`border border-[#C5A059]/40`) paired with an inner inset border (`p-1` wrapper with an inner `border border-[#C5A059]/20`).
- **Diamond Nodes & Celestial Glyphs:** Anchor border corners, dividers, and button edges with tiny 45-degree rotated square divs (`w-1.5 h-1.5 rotate-45 border border-[#C5A059] bg-[#141311]`) or inline Unicode glyphs (`✦`, `✧`, `◆`, `❖`, `—`).

## 4. Typography (Editorial & Dossier Mix)
- **Display / Headings:** High-contrast Editorial Serif (*Cormorant Garamond*, *Playfair Display*, *Instrument Serif*, or *Cinzel*). Mix regular and *italic* words within the same headline for dramatic flair. Use generous tracking on uppercase subheaders (`tracking-[0.25em]`).
- **Dossier Metadata / Labels:** Typewriter / Monospace (*Courier Prime*, *Space Mono*, *IBM Plex Mono*) for dates, case numbers, coordinates, and timestamps (e.g., `1966.05.14 // CASE NO. 09`, `[ ARCHIVE_REF ]`).
- **Editorial Layout Details:** Use classic newspaper *Drop Caps* (`first-letter:text-5xl first-letter:font-serif first-letter:float-left first-letter:mr-3 first-letter:text-[#C5A059]`) for lead paragraphs, and multi-column newspaper text splits where appropriate.

## 5. Rich Non-Distracting Transitions (Clockwork & Horology Physics)
Animations must feel like antique brass clockwork, sliding archive drawers, and ink settling on paper—deliberate, poised, and aristocratic.
- **Timing Function:** Long, velvety, heavily damped easing (`cubic-bezier(0.22, 1, 0.36, 1)` over `400ms` to `600ms`). Never use fast, jerky bounces.
- **Alchemical Diamond Rotation (Hover):** When hovering over any button, card, or nav link, rotate its decorative corner/inline diamond node (`rotate-45 group-hover:rotate-[135deg] group-hover:bg-[#C5A059] transition-all duration-500`) while gently brightening the outer brass border (`border-[#C5A059]/30 group-hover:border-[#C5A059]`).
- **Brass Line Unfurling:** Underneath navigation links, section headers, or active tabs, animate a 1px brass rule that expands from the center outward (`scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-500`) flanked by tiny `✦` glyphs that fade in.
- **Dossier Card Shift & Ink Wash:** On card hover, smoothly slide the inner content upward by `2px` (`group-hover:-translate-y-0.5 duration-500`) while a subtle warm radial spotlight or ink-wash background tint (`bg-[#C5A059]/[0.03]`) softly reveals itself.

## 6. Layout & Decorative Rules
- **Newspaper & Case-File Structure:** Organize dashboards and landing pages like an asymmetric broadsheet newspaper or an open investigator's desk—combining narrow metadata sidebars, vertical brass dividing lines, and stamped classification badges (e.g., a slightly rotated `-rotate-2` bordered stamp reading `VERIFIED // 1999`).
- **Strict Anti-Patterns:** NO neon purple/blue gradients, NO modern rounded SaaS pills (`rounded-2xl` or `rounded-full` buttons), NO Lucide/Heroicons sparkles, NO sterile white backgrounds, NO modern drop-shadows.