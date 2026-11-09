# SKILL: Frontend Aesthetic — Neo-Brutalism (Mechanical & Tactile)

## 1. Core Philosophy
You are building a Neo-Brutalist interface. Reject standard modern web defaults (no blurred drop-shadows, no gradients, no subtle gray borders, no fully rounded pills). The interface must feel like a physical, tactile, slightly rebellious print poster combined with mechanical buttons. Every element must have a clear, bold boundary.

## 2. Color Palette & Surface
- **Backgrounds:** Never use pure white (#FFFFFF) or dark mode slate. Use a warm off-white/cream base (e.g., `#F4F0EA`, `#FFFDF8`, or Tailwind `bg-amber-50/40`).
- **Accents:** High-contrast, solid, punchy colors used as block fills for cards, badges, and buttons (e.g., `#FF5E5B` Coral Red, `#FFBE0B` Marigold, `#8338EC` Electric Purple, `#00F5D4` Mint, `#3A86FF` Cobalt).
- **Text & Borders:** Pure pitch black (`#000000` or `border-black` / `text-black`). No washed-out grays for primary text.

## 3. Borders, Shadows & Geometry (CRITICAL)
- **Borders:** Every container, card, input, and button MUST have an exposed, thick solid black border (`border-2 border-black` or `border-4 border-black` for hero elements).
- **Hard Shadows:** NEVER use blurred shadows (`shadow-md`, `shadow-lg`, etc. are strictly forbidden). Exclusively use solid, zero-blur offset shadows:
  - Small elements (buttons/badges): `shadow-[4px_4px_0px_0px_#000000]`
  - Large containers (cards/modals): `shadow-[8px_8px_0px_0px_#000000]`
- **Border Radius:** Keep corners sharp (`rounded-none`) or tightly structured (`rounded-sm` / `rounded-md` max). Never use `rounded-2xl` or `rounded-full` (except for tiny status dots).

## 4. Typography
- **Headings:** Bold, heavy, geometric Sans-Serif or Display fonts (e.g., *Space Grotesk*, *Syne*, *Cabinet Grotesk*, or *Plus Jakarta Sans* at 800/900 weight). Use tight tracking (`tracking-tight`) and tight leading (`leading-none` or `leading-tight`), often in ALL CAPS for section headers.
- **Body & Labels:** Clean Sans-Serif for readability, paired with **Monospace** (*JetBrains Mono*, *Space Mono*) for tags, dates, metrics, and buttons.

## 5. Rich Non-Distracting Transitions (Mechanical Physics)
Animations must never feel "floaty" or "ethereal." They must feel mechanical, crisp, and responsive to user cursor physics.
- **Timing Function:** Use snappy cubic-bezier curves (`cubic-bezier(0.22, 1, 0.36, 1)` or `duration-150 ease-out`). Avoid slow durations (>300ms) for micro-interactions.
- **Button & Interactive Card Press Physics (The "Push" Effect):**
  - *Default state:* `translate-x-0 translate-y-0 shadow-[4px_4px_0px_0px_#000]`
  - *Hover state:* Slight lift to anticipate click: `-translate-x-[2px] -translate-y-[2px] shadow-[6px_6px_0px_0px_#000]`
  - *Active/Click state:* Element physically depresses into the shadow: `translate-x-[4px] translate-y-[4px] shadow-none`
- **Container & Tab Transitions:** When switching tabs or expanding accordions, do not use simple opacity fades. Use layout-driven height/width transitions combined with crisp sliding (`translate-y-2` to `translate-y-0` in `150ms`).
- **Hover Fill Sweeps:** For secondary buttons or nav links, use a hard-edge background color fill that slides in from the bottom or left on hover (using pseudo-elements or `bg-gradient` hard stops), instantly inverting text color if needed.

## 6. Layout & Decorative Rules
- **Exposed Grid:** Feel free to let containers share borders (like a newspaper or bento box with `border-collapse` logic) rather than floating everything in isolated space.
- **Stickers/Badges:** Place small overlapping pill/box tags on card corners (e.g., `-top-3 -right-3 rotate-3 border-2 border-black bg-yellow-300 px-2 py-0.5 font-mono text-xs font-bold`).
- **Strict Anti-Patterns:** NO glassmorphism (`backdrop-blur`), NO glowing neon gradients, NO sparkles icons, NO floating 3D abstract blobs.