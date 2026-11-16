import test from 'node:test'
import assert from 'node:assert/strict'
import {albertWatchSchema} from './albert-watches.js'
import {shouldRunVm} from './vm-power.js'
const base={title:'Class 12345',url:'https://albert.nyu.edu/fixture',rowSelector:'#course',statusSelector:'.status',identityText:'Class 12345',enabled:true}
test('Albert monitors are bounded read-only configs on trusted HTTPS NYU hosts',()=>{
 const parsed=albertWatchSchema.parse(base);assert.equal(parsed.intervalMinutes,5);assert.equal(parsed.notify,'main')
 for(const url of ['https://albert.nyu.edu.evil.test/','http://albert.nyu.edu/','https://albert.nyu.edu/enroll','https://name:password@albert.nyu.edu/'])assert(!albertWatchSchema.safeParse({...base,url}).success)
 assert(!albertWatchSchema.safeParse({...base,intervalMinutes:0}).success)
 assert(!albertWatchSchema.safeParse({...base,steps:[{action:'evaluate',selector:'body',value:'arbitrary code'}]}).success)
 assert(!albertWatchSchema.safeParse({...base,notify:'whatsapp:SomeoneElse'}).success)
 assert(shouldRunVm({hasMonitors:true,scheduled:false,jobs:[]}));assert(!shouldRunVm({scheduled:false,jobs:[]}))
})
