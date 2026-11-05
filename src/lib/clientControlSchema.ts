import {z} from 'zod'
const action=<T extends string>(name:T)=>z.literal(name)
const expected=z.string().regex(/^[a-f0-9]{64}$/)
const iso=z.string().datetime({offset:true})
const task=z.object({id:z.string().min(1).max(500).optional(),sourceEventId:z.string().min(1).max(200),title:z.string().min(1).max(300),start:iso,end:iso}).strict()
export const clientControlSchema=z.discriminatedUnion('action',[
 z.object({action:action('ui_read')}).strict(),
 z.object({action:action('ui_navigate'),tab:z.enum(['calendar','files','todo','work','agent','chat','screentime']),view:z.enum(['day','week','month','year']).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).strict(),
 z.object({action:action('ui_settings'),open:z.boolean()}).strict(),
 z.object({action:action('ui_preferences'),expected:z.object({theme:z.enum(['light','dark']),zoom:z.number(),hiddenTypes:z.array(z.enum(['fixed','planned']))}).strict(),theme:z.enum(['light','dark']).optional(),zoom:z.number().min(0.6).max(2).optional(),hiddenTypes:z.array(z.enum(['fixed','planned'])).max(2).optional()}).strict(),
 z.object({action:action('screen_time_read')}).strict(),
 z.object({action:action('screen_time_authorize')}).strict(),
 z.object({action:action('screen_time_pick_apps')}).strict(),
 z.object({action:action('screen_time_start'),expected,end:iso}).strict(),
 z.object({action:action('screen_time_stop'),expected}).strict(),
 z.object({action:action('screen_time_task_save'),expected,task}).strict(),
 z.object({action:action('screen_time_task_remove'),expected,taskId:z.string().min(1).max(500)}).strict(),
 z.object({action:action('screen_time_location'),expected,enabled:z.boolean().optional(),rule:z.enum(['allowInside','blockInside']).optional(),preciseTracking:z.boolean().optional(),checkInterval:z.union([z.literal(120),z.literal(180),z.literal(300),z.literal(600)]).optional(),place:z.object({name:z.string().min(1).max(200),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),radius:z.number().min(50).max(1000)}).strict().optional()}).strict(),
 z.object({action:action('screen_time_dns_read')}).strict(),
 z.object({action:action('screen_time_dns_domain'),expected,domain:z.string().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),blocked:z.boolean()}).strict(),
])
export type ClientControl=z.infer<typeof clientControlSchema>
