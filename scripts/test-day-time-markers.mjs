import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const offset=new Intl.DateTimeFormat('en',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(new Date()).find(part=>part.type==='timeZoneName').value.replace('GMT','')||'+00:00'
const at=time=>date+'T'+time+':00'+offset
const base={description:'',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}
const events=[
 {...base,id:'class',title:'Fixture class',tagIds:['school'],start:at('12:00'),end:at('14:00')},
 {...base,id:'folder',title:'Afternoon folder',eventKind:'folder',color:'#13b8a6',start:at('14:00'),end:at('16:00')},
 {...base,id:'short',title:'Short component',folderId:'folder',start:at('14:00'),end:at('14:30')},
 {...base,id:'long',title:'Long component',folderId:'folder',start:at('14:30'),end:at('16:00')},
 {...base,id:'reminder',title:'Timed reminder',reminder:true,folderId:'folder',start:at('14:45'),end:at('14:46')},
 {...base,id:'all-day',title:'Deadline reminder',allDay:true,reminder:true,start:at('00:00'),end:at('23:59')},
 {...base,id:'later',title:'Later activity',start:at('16:00'),end:at('17:00')},
 {...base,id:'micro',title:'Five-minute activity',start:at('17:00'),end:at('17:05')},
 {...base,id:'outer',title:'Nested group',eventKind:'folder',start:at('17:05'),end:at('18:05')},
 {...base,id:'inner',title:'Inner folder',eventKind:'folder',folderId:'outer',start:at('17:15'),end:at('17:45')},
 {...base,id:'inner-leaf',title:'Inner activity',folderId:'inner',start:at('17:15'),end:at('17:45')},
]
const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace('revision:1,events:[]','revision:1,events:'+JSON.stringify(events))
try{for(const width of [393,1200]){
 const page=await browser.newPage({viewport:{width,height:852},hasTouch:width<600,isMobile:width<600});page.setDefaultTimeout(10000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;if(!localStorage.getItem("fixture-calendar-display"))localStorage.setItem("fixture-calendar-display",JSON.stringify({week:true,month:false,dayTimeMarkers:false}));'+fixture})
 if(width<600)await page.addInitScript(()=>localStorage.setItem('ai-planner-theme','dark'))
 await page.goto(process.env.PLANNER_TEST_URL||'http://127.0.0.1:5173');await page.locator('.app-header').waitFor()
 if(width<700)await page.getByRole('button',{name:'Toggle sidebar'}).click()
 await page.getByRole('group',{name:'Calendar view',exact:true}).getByRole('button',{name:'Day',exact:true}).click()
 if(width<700)await page.getByRole('button',{name:'Toggle sidebar'}).click()
 await page.getByRole('checkbox',{name:'Show Classes events',exact:true}).uncheck()
 const section=page.locator('[data-calendar-day="'+date+'"]')
 assert.equal(await section.locator('.mobile-week-event[title="Fixture class"]').count(),1,'Scaled list keeps time occupancy')
 if(width<700)await page.getByRole('button',{name:'Toggle sidebar'}).click()
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('summary').filter({hasText:/^Display$/}).click()
 await page.getByRole('switch',{name:'Scale day view to duration',exact:true}).uncheck();await page.getByRole('button',{name:'Close settings',exact:true}).click()
 assert.equal(await section.locator('.mobile-week-event[title="Fixture class"]').count(),0,'Unscaled list removes hidden rows instead of blank height')
 const rowHeights=await section.locator('.agenda-grid-row > .mobile-week-event').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert(rowHeights.every(h=>h<80),'No stale duration heights remain')
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('summary').filter({hasText:/^Display$/}).click()
 await page.getByRole('switch',{name:'Show day view time markers'}).check();await page.getByRole('button',{name:'Close settings',exact:true}).click()
 await section.locator('.day-clock').waitFor()
 assert.equal(await section.locator('.day-clock-hour').count(),24)
 const folder=section.locator('[data-timeline-event="folder"]'),short=section.locator('[data-timeline-event="short"]'),long=section.locator('[data-timeline-event="long"]')
 const f=await folder.boundingBox(),s=await short.boundingBox(),l=await long.boundingBox(),parent=await folder.locator(':scope > .day-clock-card-slot').boundingBox()
 assert(Math.abs(f.height-192)<1);assert(Math.abs(s.height-48)<1);assert(Math.abs(l.height-144)<1)
 assert(Math.abs(s.y-f.y)<1);assert(Math.abs(l.y-(f.y+48))<1);assert(s.x>=parent.x+parent.width,'Components occupy the right half')
 assert.equal(await section.locator('[data-timeline-event="class"]').count(),0)
 const micro=await section.locator('[data-timeline-event="micro"]').boundingBox();assert(Math.abs(micro.height-8)<1,'Five-minute activity has exactly five minutes of height');
 const inner=await section.locator('[data-timeline-event="inner"]').boundingBox(),innerLeaf=await section.locator('[data-timeline-event="inner-leaf"]').boundingBox();assert(Math.abs(inner.y-innerLeaf.y)<1&&Math.abs(inner.height-innerLeaf.height)<1,'Nested folders retain their children’s real times');
 const reminder=section.getByRole('button',{name:'2:45pm · Timed reminder',exact:false});assert((await reminder.boundingBox()).height<=1,'Timed reminder has only a one-pixel line, no duration block')
 assert((await section.getByRole('button',{name:'Reminder · Deadline reminder',exact:false}).boundingBox()).height<=1,'All-day reminder is a line')
 await folder.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/flow-day-timeline-'+width+'.png'})
 await folder.getByRole('button',{name:'Collapse folder Afternoon folder'}).click();assert.equal(await section.locator('[data-timeline-event="short"]').count(),0)
 await folder.getByRole('button',{name:'Expand folder Afternoon folder'}).click();assert.equal(await section.locator('[data-timeline-event="short"]').count(),1)
 await short.getByRole('button',{name:/Short component/}).click();await page.locator('.event-modal').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await page.reload();await page.locator('.day-clock').first().waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-calendar-display')).dayTimeMarkers),true,'Time markers persist across reload');
 assert.deepEqual(errors,[]);await page.close();console.log(width+'px: filtering, scaling reset, hourly ruler, parallel folder timing, zero-duration reminders, collapse and event editing passed.')
}}finally{await browser.close()}
