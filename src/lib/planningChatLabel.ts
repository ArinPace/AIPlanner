// Keep internal planning instructions out of the visible user message, including older launches.
export function isPlanningLaunch(message:string){return message.startsWith('I clicked the permanent Start planning my calendar button. Run the same review/update workflow as my scheduled task now:')}
export function planningChatLabel(message:string){return isPlanningLaunch(message)?'Begin Planning':message}
