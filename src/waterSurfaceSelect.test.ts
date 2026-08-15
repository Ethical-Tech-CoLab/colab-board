/**
 * Regression tests for the Water Surface settings `<select>` contrast fix.
 *
 * Root cause (pre-fix): the `.water-surface-settings select` rule used
 * `background: var(--brand-control)` which resolves to rgba(255,255,255,0.055)
 * on dark themes — essentially transparent.  On Windows with a light system
 * colour scheme, Chromium/Edge cannot infer the dark/light mode for the
 * OS-native select popup from a transparent background and falls back to
 * system colours (white background, black text), producing unreadable
 * "black letters on white background" dropdowns.
 *
 * Fix: switch to `background: var(--brand-panel)` (opaque for all themes) and
 * add `color-scheme: inherit` explicitly to the compact sub-panel select rule
 * so the UA-stylesheet default of `color-scheme: light dark` cannot override
 * the page's colour scheme.
 *
 * These tests statically analyse App.css to prevent future regressions to the
 * exact CSS rules that guard this behaviour.  Browser-level computed-style and
 * native-popup tests are not supported in the Vitest/jsdom environment.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(resolve(__dirname, 'App.css'), 'utf8').replace(/\r\n/g, '\n')

const SUB_PANEL_SELECTOR = '.replay-studio-settings select,\n.water-surface-settings select'

/**
 * Return ALL declaration blocks for rules whose selector includes `needle`.
 * Handles multi-line selector lists correctly.
 */
function getAllRuleBodies(css: string, needle: string): string[] {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`, 'g')
  const bodies: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) bodies.push(m[1])
  return bodies
}

describe('water-surface-settings select — primary rule properties', () => {
  // The primary rule is the first/earliest occurrence in the stylesheet.
  const bodies = getAllRuleBodies(CSS, SUB_PANEL_SELECTOR)

  it('at least one CSS rule matches the sub-panel select selector', () => {
    expect(bodies.length).toBeGreaterThan(0)
  })

  it('primary rule declares color-scheme: inherit to override the UA-stylesheet default', () => {
    expect(bodies[0]).toContain('color-scheme: inherit')
  })

  it('primary rule uses var(--brand-foreground) for text colour', () => {
    expect(bodies[0]).toContain('color: var(--brand-foreground)')
  })

  it('primary rule requests an opaque background via var(--brand-panel)', () => {
    // --brand-panel is opaque for every built-in theme (unlike --brand-control
    // which is rgba(255,255,255,0.055) on dark themes).  An opaque background
    // lets the browser signal the correct OS dark/light mode to the native
    // select popup.
    expect(bodies[0]).toContain('background: var(--brand-panel)')
  })
})

describe('water-surface-settings select — cascade-position override', () => {
  it('a second rule after .settings-panel select re-pins var(--brand-panel) in cascade', () => {
    // The .settings-panel select theme-override block (later in App.css, same
    // specificity) would otherwise reassign background: var(--brand-control).
    // A second .replay-studio-settings / .water-surface-settings rule placed
    // immediately after that block wins the cascade and pins the opaque value.
    const bodies = getAllRuleBodies(CSS, SUB_PANEL_SELECTOR)
    // At least two occurrences: the primary rule and the cascade-position fix.
    expect(bodies.length).toBeGreaterThanOrEqual(2)
    // The LAST occurrence (cascade winner) must include var(--brand-panel).
    expect(bodies.at(-1)).toContain('var(--brand-panel)')
  })
})

describe('water-surface-settings select — forced-colours coverage', () => {
  it('forced-colors block includes .water-surface-settings select', () => {
    // Verifies that Windows High-Contrast / Accessibility themes restore system
    // palette colours on the water-surface-settings selects.
    const fcIndex = CSS.indexOf('@media (forced-colors: active)')
    expect(fcIndex).toBeGreaterThan(-1)
    const fcBlock = CSS.slice(fcIndex)
    expect(fcBlock).toContain('.water-surface-settings select')
  })
})
