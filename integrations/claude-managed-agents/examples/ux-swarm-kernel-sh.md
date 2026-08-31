# Example output: `ux-swarm` on kernel.sh

Real output from the [`ux-swarm`](../src/ux-swarm.ts) recipe, run against
<https://www.kernel.sh> on 2026-06-04.

A single managed-agent **coordinator** did a quick recon pass, then spun up **7
browser-operator subagents in parallel** — one per area of the site — each driving its
own Kernel cloud browser to audit that area, before synthesizing the prioritized report
below. The live run also streamed each operator's progress to the terminal and saved
screenshots + a full evidence file to the session's `/mnt/session/outputs/`.

The coordinator's final synthesized report is reproduced verbatim:

---

# Kernel.sh — Prioritized UX Report

**How it was run:** 7 browser-operators in parallel, each driving its own Kernel cloud browser — one per area: Landing/Hero · Navigation/Search · Pricing · Docs · Sign-up & Demo · Mobile · Content Hub. Evidence is from Playwright DOM/render + screenshots.

### ⚠️ Read first — a screenshot artifact, not a site bug

The "dithered/halftone noise" in early captures is a **headless no-GPU framebuffer artifact**, not what humans see (Playwright renders clean; DOM has no filters/canvas). Human legibility is fine. _Mildly notable for Kernel:_ their own site renders as noise under computer-use screenshotting — an edge case worth knowing given they sell agent browser infra.

---

## 🔴 CRITICAL

- **C1 — Hover-only "developers" dropdown is keyboard/screen-reader inaccessible.** `<button>` opens only on mouse hover (Enter/Space do nothing; `aria-expanded`=null); its 6 links (docs, security, status, changelog, benchmarks, careers) never enter tab order **and aren't in the footer either** → keyboard users have **no path to docs at all.** _(Navigation — WCAG 2.1.1)_
- **C2 — No visible focus indicator on nav.** Focused items compute `outline:none`, no box-shadow/decoration. _(Navigation — WCAG 2.4.7)_

## 🟠 HIGH

- **H1 — No distinct primary CTA anywhere.** Programmatic check: zero buttons/links have a fill or border; hero has no button; "sign in/up" & "book demo" look identical to info nav links. _(Landing/Nav — conversion)_
- **H2 — Pricing isn't estimable.** Tiers say "plus usage costs*" explained only by a 14px footnote ("$0.0000166667 per gb-second"). No calculator, examples, or GB-per-browser figure → buyers can't answer "what will I pay?" _(Pricing)_
- **H3 — Hero word "agents" is clipped on mobile** (100px text in a 326px `overflow:hidden` box; final "s" cut). _(Mobile)_

## 🟡 MEDIUM (11)

- **M1** Sign-in/up: invalid email gives **no visible error** — `type=text`, silent dead-end. **M2** "Book demo" forces a **required budget question** before showing any calendar. **M3** No demo duration/host/timezone shown before the form. **M4** Feature cards are a horizontal carousel **hiding 2 of 5** value props on desktop with no arrows. **M5** Docs floating **AI bar overlaps content/code** (covered a code block + headings). **M6** **No link back to kernel.sh** from docs. **M7** "Command palette" is **dead UI** — invisible `↑↓ k` hint, no search on the marketing site. **M8** Benchmarks: **thin methodology** — "5.8x cold starts" & "50%+ cost" claims unsubstantiated; source is a GitHub PR. **M9** Customers hero shows **tofu boxes** (unrenderable U+23F7 chevron). **M10** Content hub **theme is inconsistent** (dark blog posts vs light everywhere else). **M11** Pricing **credits-vs-usage ambiguity** + card-required trial contradicts "no card" FAQ. **M12** Mobile bottom-bar tap targets **24px (<44px)**. **M13** Docs buried under the hover menu. **M14** Two-column justified long-form hurts readability.

## 🟢 LOW (12)

Rotating hero customer names fail AA contrast · jargon-heavy hero ("cloud browsers" never said) · weak 404 (skeleton bars, no recovery) · missing-space typos on /customers/benny · changelog unversioned + dates omit year · blog cards lack author/excerpt · small mobile footer links · Discord opens same tab · non-semantic benchmark table / missing `aria-expanded` · pricing language-label motif reads as glitch · mobile FCP ~2.3s · cookie banner overlays Calendly.

## ✅ What's working (don't regress)

Fast stable homepage (FCP≈784ms, **CLS 0**, AAA text contrast, zero dead links) · **excellent docs** (Ctrl+K search + AI, copy buttons, multi-language tabs, prev/next, `llms.txt`) · clear comparable pricing tiers with working CTAs · genuinely good responsive behavior (no horizontal scroll, stacked pricing cards, usable docs drawer) · external links open new tabs with `rel=noopener` on-brand · honest benchmark latency table.

---

## Top recommendations (priority order)

1. **Make the "developers" menu keyboard-operable + add a visible focus ring** (C1/C2); also list docs/changelog/benchmarks in the footer as a non-hover path.
2. **Add one prominent filled primary CTA** ("Start building") in hero + header (H1).
3. **Make pricing estimable** — usage calculator/worked examples + clarify credits/overages; expand FAQ (H2/M11).
4. **Fix mobile hero clipping + enlarge tap targets to ≥44px** (H3/M12).
5. **Reduce demo friction** — show context, make budget optional, offer a self-serve path (M2/M3).
6. **Move the docs AI bar off content + add a kernel.sh link from docs** (M5/M6).
7. **Substantiate the Benchmarks page** (methodology, n/date/config; semantic table) (M8).
8. **Polish content hub** — fix tofu chevrons, unify theme, reconsider 2-col justified, fix typos (M9/M10/M14/L4).
9. **Resolve the dead command palette** — ship real search or remove the hint (M7).
10. **Reveal the 2 hidden feature cards + raise rotating-name contrast to AA** (M4/L1).
