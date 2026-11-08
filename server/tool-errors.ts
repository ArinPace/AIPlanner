import {ZodError} from 'zod'
import {ApiError} from './cloud.js'

// Return validation paths and schema messages, never input values or raw errors.
export function plannerToolError(error:unknown):string {
 if(error instanceof ApiError)return error.message
 if(error instanceof ZodError)return 'Invalid tool input: '+error.issues.slice(0,8).map(issue=>(issue.path.join('.')||'input')+': '+issue.message).join('; ')+'. Read the tool schema and current state before retrying.'
 return 'Could not complete this planner action. No success is confirmed; read the planner before retrying.'
}
