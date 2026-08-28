import { HistoryStack } from './history'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const h = new HistoryStack(3)
h.seed('A')
h.begin()
assert(!h.commit('A'), 'unchanged commit is no-op')
h.begin()
assert(h.commit('B'), 'B should commit')
h.begin()
h.commit('C')
assert(h.undo() === 'B', 'undo to B')
assert(h.undo() === 'A', 'undo to A')
assert(h.undo() === null, 'no more undo')
assert(h.redo() === 'B', 'redo to B')
assert(h.redo() === 'C', 'redo to C')
h.begin()
h.commit('D')
assert(h.canRedo === false, 'commit clears redo')
h.commit('E')
h.commit('F')
h.commit('G')
assert(h.undo() === 'F', 'max depth still works')
console.log('history.test ok')
