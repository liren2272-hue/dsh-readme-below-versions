/**
 * Offline self-test for @local/dsh-readme-below-versions.
 *
 * A fake DOM only — it proves the reorder plan, the style writes and the
 * teardown, plus the negative controls (no README / no versions block / README
 * already below it) leave the page untouched. Run with the DSH node:
 *
 *   "$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe" selftest.mjs
 */
import assert from 'node:assert/strict'

const loaded = []
globalThis.window = { __ModuleLoader__: { load: (def) => loaded.push(def) } }

await import('./client.js')

assert.equal(loaded.length, 1, 'the client half must register exactly one module')
assert.equal(loaded[0].id, '@local/dsh-readme-below-versions')

const internals = loaded[0].factory().internals
const { FLAG, PAGE_SELECTOR, VERSION_SELECTOR, planReorder, applyOrder, restore, sweep } = internals

/** A minimal element: attributes, style.setProperty/removeProperty, children. */
function el(attrs = {}) {
  const bag = { ...attrs }
  const style = {
    order: '',
    setProperty(name, value) {
      this[name] = String(value)
    },
    removeProperty(name) {
      delete this[name]
    },
  }
  return {
    style,
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(bag, name),
    getAttribute: (name) => (name in bag ? String(bag[name]) : null),
    setAttribute: (name, value) => {
      bag[name] = String(value)
    },
    removeAttribute: (name) => {
      delete bag[name]
    },
    bag,
  }
}

const orders = (els) => els.map((e) => e.style.order || '0')

// ---- pure plan ------------------------------------------------------------

// The page's real order: README first, versions fourth.
{
  const readme = el()
  const config = el({ 'data-plugin-config': true })
  const rows = el({ 'data-plugin-rows': true })
  const versions = el({ 'data-plugin-versions': true })
  const source = el({ 'data-plugin-source': true })
  const slot = el()
  const children = [readme, config, rows, versions, source, slot]
  const plan = planReorder(children, versions)
  assert.deepEqual(
    plan.map((p) => [children.indexOf(p.el), p.order]),
    [[0, '1'], [4, '2'], [5, '2']],
    'README moves below versions; source and the slot move one further down',
  )
}
// No README: the first child is already one of the page's own blocks.
{
  const config = el({ 'data-plugin-config': true })
  const versions = el({ 'data-plugin-versions': true })
  assert.deepEqual(planReorder([config, versions], versions), [])
}
// No versions block (a bundle that cannot be updated) -> README stays on top.
{
  const readme = el()
  assert.deepEqual(planReorder([readme], undefined), [])
}
// Already below the versions block -> idempotent, no work.
{
  const versions = el({ 'data-plugin-versions': true })
  const readme = el()
  assert.deepEqual(planReorder([versions, readme], versions), [])
}
// Empty container.
assert.deepEqual(planReorder([], el({ 'data-plugin-versions': true })), [])

// ---- apply + teardown -----------------------------------------------------

const readme = el()
const versions = el({ 'data-plugin-versions': true })
const source = el({ 'data-plugin-source': true })
const children = [readme, versions, source]
const container = { children, parentElement: null }
versions.parentElement = container
const page = { querySelector: (sel) => (sel === VERSION_SELECTOR ? versions : null) }
const everything = [readme, versions, source]

globalThis.document = {
  documentElement: {},
  querySelectorAll: (sel) => {
    if (sel === PAGE_SELECTOR) return [page]
    if (sel === `[${FLAG}]`) return everything.filter((e) => e.hasAttribute(FLAG))
    throw new Error(`unexpected selector ${sel}`)
  },
}

sweep()
assert.deepEqual(orders(children), ['1', '0', '2'], 'README paints below the versions block')
assert.equal(readme.getAttribute(FLAG), '1', 'the touched element is flagged for teardown')

// Re-running is a no-op and must not disturb what is already applied.
sweep()
assert.deepEqual(orders(children), ['1', '0', '2'])

// A page whose first child is the versions block is left alone.
{
  const other = el({ 'data-plugin-versions': true })
  const otherContainer = { children: [other], parentElement: null }
  other.parentElement = otherContainer
  const otherPage = { querySelector: (sel) => (sel === VERSION_SELECTOR ? other : null) }
  const saved = globalThis.document.querySelectorAll
  globalThis.document.querySelectorAll = (sel) => (sel === PAGE_SELECTOR ? [otherPage] : saved(sel))
  sweep()
  globalThis.document.querySelectorAll = saved
  assert.equal(other.style.order, '', 'nothing to move on a page without a README')
}

applyOrder(versions, '2')
assert.equal(versions.style.order, '2')

restore()
assert.deepEqual(orders(children), ['0', '0', '0'], 'teardown removes every inline order')
assert.equal(readme.getAttribute(FLAG), null, 'teardown removes every flag')
assert.equal(versions.getAttribute(FLAG), null)

console.log('selftest: ALL PASS')
