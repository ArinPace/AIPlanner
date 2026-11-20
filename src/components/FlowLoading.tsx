export function FlowLoading({label='Opening Flow…'}:{label?:string}){
 return <div className="flow-loading" role="status" aria-live="polite"><div className="flow-loading-art" aria-hidden="true"><img src="/flow-icon.png" alt=""/><div className="flow-loading-shimmer"/></div><p>{label}</p></div>
}
