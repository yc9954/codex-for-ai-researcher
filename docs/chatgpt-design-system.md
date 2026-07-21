# ChatGPT Interface CSS Audit

Unofficial implementation study captured from the signed-out Korean `chatgpt.com` interface with Playwright on 2026-07-18. This repository does not copy OpenAI source stylesheets. It records browser-resolved custom properties and computed styles, then maps the measured values into local semantic CSS.

## Capture evidence

| Artifact | Contents |
| --- | --- |
| `artifacts/chatgpt-live-styles-desktop.json` | 1512x900 viewport, 1,139 root custom properties, 9 stylesheet asset URLs, 18 media queries, 43 measured semantic/structural elements |
| `artifacts/chatgpt-live-styles-mobile.json` | 390x844 viewport, the same root token set, 25 visible responsive elements |
| `artifacts/chatgpt-live-styles-dark-desktop.json` | 1512x900 dark-mode computed styles after Playwright media emulation |
| `artifacts/chatgpt-live-reference-desktop.png` | Cookie-free desktop reference screenshot |
| `artifacts/chatgpt-live-reference-mobile.png` | Cookie-free mobile reference screenshot |
| `artifacts/chatgpt-live-reference-dark-desktop.png` | Cookie-free dark reference screenshot |

The JSON includes each element's rect, layout, padding, margin, gap, flex/grid values, colors, border, radius, shadow, font, type metrics, z-index, transitions, and `::before`/`::after` computed styles.

## Measured geometry

| Component | Desktop | Mobile |
| --- | ---: | ---: |
| Sidebar | 260px | Off-canvas |
| Collapsed rail variable | 52px | N/A |
| Header | 52px | 52px |
| Navigation row | 248x36px, 6px side margin | N/A when closed |
| Navigation padding | 6px 10px | Same in sheet |
| Navigation radius | 10px | 10px |
| Icon/header target | 36x36px | 36x36px |
| Composer | 768x52px | 366x86px |
| Composer padding | 5px 8px | 5px 8px |
| Composer radius | 28px | 28px |
| Main breakpoint | `max-width: 767px` | Active |

At desktop, the composer grid resolves to `36px 601.508px 114.492px`. The final column contains a 36px dictation target, an 8px gap, and a 70.492px voice pill. On mobile the prompt occupies the first row; plus, dictation, and submit controls occupy the 36px second row.

## Live light tokens

```css
--main-surface-primary: #fcfcfc;
--main-surface-secondary: #f9f9f9;
--main-surface-tertiary: #ececec;
--sidebar-surface-primary: #fcfcfc;
--sidebar-surface-secondary: #ececec;
--sidebar-surface-tertiary: #e3e3e3;
--composer-surface-primary: #fff;
--message-surface: #e9e9e980;
--surface-hover: #00000012;
--text-primary: #0d0d0d;
--text-secondary: #5d5d5d;
--text-tertiary: #8f8f8f;
--border-light: #0000000d;
--border-default: #0000001a;
--border-heavy: #00000026;
--sidebar-width: 260px;
--sidebar-rail-width: 52px;
--header-height: 52px;
--menu-item-height: 36px;
```

The exact local mapping lives in `src/styles/tokens.css`.

## Live dark tokens

```css
--main-surface-primary: #000;
--main-surface-secondary: #212121;
--main-surface-tertiary: #2f2f2f;
--sidebar-surface-primary: #000;
--sidebar-surface-secondary: #303030;
--sidebar-surface-tertiary: #414141;
--composer-surface-primary: #212121;
--message-surface: #323232d9;
--surface-hover: #ffffff26;
--text-primary: #fff;
--text-secondary: #cdcdcd;
--text-tertiary: #afafaf;
--border-light: #ffffff0d;
--border-default: #ffffff26;
--border-heavy: #ffffff33;
```

The dark composer resolves to an inset `0 0 1px rgba(255, 255, 255, 0.2)` shadow. The login pill reverses to `#f9f9f9` with `#0d0d0d` text, while the signup control uses the `#212121` surface and a 15% white border.

## Typography

The resolved default stack is:

```css
font-family: -apple-system-body, ui-sans-serif, -apple-system,
  system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial,
  sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
```

| Role | Size / line | Weight |
| --- | ---: | ---: |
| Empty-state heading | 24px / 28px | 400 |
| Model selector | 18px / 28px | inner label emphasized |
| Composer prompt | 16px / 26px | 400 |
| Navigation/buttons | 14px / 20px | 400-500 |
| Disclaimer | 12px / 16px | 400 |

`OpenAI Sans` font faces are declared by the production page, but the measured Korean shell resolves primarily to the platform system stack. The local product therefore uses that measured stack instead of pretending the proprietary font is bundled.

## Composer CSS

```css
.composer {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  min-height: 52px;
  padding: 5px 8px;
  border-radius: 28px;
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.04),
    0 2px 8px rgba(0, 0, 0, 0.04),
    0 4px 80px 8px rgba(0, 0, 0, 0.024);
}

@media (max-width: 767px) {
  .composer {
    grid-template-rows: 40px 36px;
    min-height: 86px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  }
}
```

## Implementation notes

- Desktop heading begins around 31% into the post-header canvas; mobile shifts to 35%.
- Desktop signup is hidden on mobile, while login remains a 36px black pill.
- Desktop sidebar, canvas, and document all resolve to `#fcfcfc`; hierarchy comes from active/hover alpha fills rather than distinct large-area colors.
- Icon-only controls use stable 36px hit areas and 8px or full-pill radii.
- The app keeps search, sidebar, attachments, voice state, sending, and conversation transitions functional while using the measured shell.
