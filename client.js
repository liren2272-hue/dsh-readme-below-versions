;(function () {
  /* Wrapped in an IIFE on purpose (2026-11-11 fix). DSH concatenates
   * every installed client.js into ONE module scope; a top-level
   * const/let/class here collides with identically-named declarations in
   * other plugins (e.g. SCAN_INTERVAL_MS in @local/dsh-context-recom-hider)
   * -> SyntaxError: Identifier already been declared -> web boot aborts ->
   * host sanitizes the profile. Keep ALL declarations in this function scope.
   * Leading ';' and trailing ';' guard ASI across concatenated files. */
  /**
   * dsh-readme-below-versions — client half.
   *
   * The DSH plugin page (`@deepseek-ai/dsh-client-ui-plugin-manager`) renders a
   * package's detail document — its README — as the FIRST child of the page's
   * `detailSections` column, while the 更新 / 版本 block
   * (`section[data-plugin-versions]`, client.js:4733) is the fourth:
   *
   *   [README][bundle config][rows][versions][source][plugins.detail.section]
   *
   * Both live inside that React tree and are not slot occupants, so no plugin can
   * move the README through `ctx.slots`.
   *
   * So this half only decorates the DOM: it writes a flex `order` on the README
   * and on the blocks that follow the versions block, which paints the README
   * immediately under 更新 / 版本 without moving a single node — React's
   * reconciliation never sees an unexpected child position. `.detailSections` is
   * `display:flex; flex-direction:column`, so `order` alone decides paint order.
   *
   * A MutationObserver (plus a slow interval as a safety net) re-asserts the
   * styles whenever React re-creates the page, and the cleanup returned from
   * `apply` removes every inline style it wrote, so switching the bundle off
   * restores the original order without a reinstall.
   */

  const FLAG = 'data-dsh-readme-below-versions'
  const SCAN_INTERVAL_MS = 3000
  const PAGE_SELECTOR = '[data-plugin-detail]'
  const VERSION_SELECTOR = '[data-plugin-versions]'
  /**
   * Every `detailSections` child the plugin manager renders itself. The README is
   * the one that carries none of them, so this set is also the README's absence
   * test: a page whose first child is marked has no document to move.
   */
  const SECTION_MARKERS = [
    'data-plugin-config',
    'data-plugin-rows',
    'data-plugin-versions',
    'data-plugin-source',
  ]
  /** The README paints right below the versions block; what followed it moves one slot down. */
  const README_ORDER = '1'
  const TAIL_ORDER = '2'

  /** Whether a `detailSections` child is one of the page's own sections rather than the README. */
  function isSection(el) {
    return SECTION_MARKERS.some((marker) => el.hasAttribute(marker))
  }

  /**
   * Which flex children need which `order`, given a page's `detailSections`
   * children and its versions block. Pure: it reads elements, never writes them.
   *
   * @param children - the container's element children, in DOM order.
   * @param version - the `[data-plugin-versions]` block on the same page.
   * @returns the pairs to apply; empty when the page has no README, no versions
   *   block, or already shows the README below it.
   */
  function planReorder(children, version) {
    if (children.length === 0) return []
    const readme = children[0]
    // No document on this page: the first child is one of the page's own blocks.
    if (readme === version || isSection(readme)) return []
    const readmeAt = children.indexOf(readme)
    const versionAt = children.indexOf(version)
    // Not the same container, or already below the versions block.
    if (readmeAt < 0 || versionAt < 0 || readmeAt > versionAt) return []
    const plan = [{ el: readme, order: README_ORDER }]
    for (let i = versionAt + 1; i < children.length; i += 1) {
      plan.push({ el: children[i], order: TAIL_ORDER })
    }
    return plan
  }

  /** Write one `order`, remembering on the element that we did, for teardown. */
  function applyOrder(el, order) {
    if (el.getAttribute(FLAG) === order) return
    el.setAttribute(FLAG, order)
    if (el.style && typeof el.style.setProperty === 'function') el.style.setProperty('order', order)
  }

  window.__ModuleLoader__.load({
    id: '@local/dsh-readme-below-versions',
    factory() {
      /** @type {MutationObserver | null} */
      let observer = null
      let scanTimer = null
      let disposed = false
      let pending = false

      /** Re-assert the order on every package page currently open. */
      function sweep() {
        if (disposed || typeof document === 'undefined') return
        for (const page of document.querySelectorAll(PAGE_SELECTOR)) {
          const version = page.querySelector(VERSION_SELECTOR)
          const container = version === null ? null : version.parentElement
          if (container === null) continue
          for (const { el, order } of planReorder(Array.from(container.children), version)) {
            applyOrder(el, order)
          }
        }
      }

      let scheduled = false
      function scheduleSweep() {
        if (disposed || scheduled) return
        scheduled = true
        const run = () => {
          scheduled = false
          sweep()
        }
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
        else setTimeout(run, 0)
        void pending
      }

      /** Undo every inline override we made, so disabling the bundle restores the page. */
      function restore() {
        if (typeof document === 'undefined') return
        for (const el of document.querySelectorAll(`[${FLAG}]`)) {
          el.removeAttribute(FLAG)
          if (el.style && typeof el.style.removeProperty === 'function') el.style.removeProperty('order')
        }
      }

      function apply(ctx) {
        if (typeof document === 'undefined') return
        sweep()
        if (typeof MutationObserver === 'function') {
          observer = new MutationObserver(scheduleSweep)
          observer.observe(document.documentElement, { childList: true, subtree: true })
        }
        // Safety net for a re-render that swaps a page's blocks without a childList
        // change we can observe, or for a document restored from the bfcache.
        scanTimer = setInterval(sweep, SCAN_INTERVAL_MS)

        return () => {
          disposed = true
          if (observer !== null) {
            observer.disconnect()
            observer = null
          }
          if (scanTimer !== null) {
            clearInterval(scanTimer)
            scanTimer = null
          }
          restore()
          void ctx
        }
      }

      return {
        // Pure DOM decoration: no service reads at all, so nothing can trip the
        // Cordis "cannot get property … without inject" trap.
        inject: [],
        apply,
        /** Exposed for the offline test harness only; nothing in DSH reads this. */
        internals: {
          FLAG,
          PAGE_SELECTOR,
          VERSION_SELECTOR,
          SECTION_MARKERS,
          README_ORDER,
          TAIL_ORDER,
          isSection,
          planReorder,
          applyOrder,
          restore,
          sweep,
        },
      }
    },
  })

})();
