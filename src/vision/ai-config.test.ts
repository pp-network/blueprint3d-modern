import assert from 'node:assert/strict'
import { toCursorModelId } from '../../app/lib/ai-config'

assert.equal(toCursorModelId('global.anthropic.claude-sonnet-4-6'), 'claude-sonnet-4-6')
assert.equal(toCursorModelId('claude-sonnet-4-6'), 'claude-sonnet-4-6')
assert.equal(toCursorModelId('gemini-2.5-flash'), 'gemini-2.5-flash')
assert.equal(toCursorModelId(''), 'claude-sonnet-4-6')
console.log('ai-config.test ok')
