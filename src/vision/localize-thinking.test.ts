import { hasMostlyChinese, localizeThinkingZh } from './localize-thinking'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(hasMostlyChinese('外墙先沿立面走一圈，再认隔墙。') === true, 'chinese kept')
assert(hasMostlyChinese('prepare for calling the submit_walls tool') === false, 'english detected')
const localized = localizeThinkingZh('My immediate task is to prepare for calling the submit_walls tool')
assert(!localized.includes('submit_walls'), 'hide tool english')
assert(/外墙|图纸|隔墙/.test(localized), `rewritten in zh: ${localized}`)
assert(localizeThinkingZh('先沿外墙拐角走一圈，衣帽间柜体不是墙。').includes('衣帽间'), 'keep chinese')
console.log('localize-thinking.test ok')
