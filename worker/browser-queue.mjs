// MCP callers may request many pages in parallel. Keep heavy browser work
// sequential so one review cannot exhaust its private VM's memory.
export function browserQueue() {
  let tail=Promise.resolve()
  return task=>{
    const result=tail.then(task)
    tail=result.catch(()=>{})
    return result
  }
}
