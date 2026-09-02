import assert from 'node:assert/strict'
import { catalogItemForKind, catalogKindFromLabel } from './catalog-pick'

assert.equal(catalogKindFromLabel('bed'), 'bed')
assert.equal(catalogKindFromLabel('双人床'), 'bed')
assert.equal(catalogKindFromLabel('圆桌'), 'table')
assert.equal(catalogKindFromLabel('门'), 'door')
assert.equal(catalogKindFromLabel('窗户'), 'window')
assert.equal(catalogKindFromLabel('马桶'), null)

const bed = catalogItemForKind('bed')
assert.ok(bed, 'bed exists in catalog')
assert.equal(bed!.category, 'bed')
assert.ok(bed!.model.endsWith('.glb'), 'uses catalog url')

const door = catalogItemForKind('door', '入户门')
assert.ok(door, 'door exists')
assert.equal(door!.type, '7')

assert.equal(catalogItemForKind('toilet', '马桶'), null, 'do not invent missing kinds')

console.log('catalog-pick.test ok')
