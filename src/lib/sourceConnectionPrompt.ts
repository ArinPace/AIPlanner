import {gmailAccountPrompt} from './chatAppAccounts.js'
import {VM_SOURCES,type VmSource} from './vm.js'
export function sourceConnectionPrompt(source:VmSource){
 if(source==='gmail')return gmailAccountPrompt()
 return `Open ${VM_SOURCES[source].url} in your cloud browser and help me sign in. Use the private secure sign-in form for credentials and approvals. Verify that you can read the relevant inbox or messages afterward. Use messages only as information for calendar planning; do not send messages, post, or change anything in the connected app. After verifying access, use Planner tools to enable this source for planning while preserving the other enabled sources, and save its verified access details in planning memory. Do not claim it is connected if reading was not verified.`
}
