import {FlowFibres} from './FlowFibres'
export function FlowLoading({label='Opening Flow…'}:{label?:string}){
 return <div className="flow-loading" role="status" aria-live="polite"><div className="flow-loading-art" aria-hidden="true"><FlowFibres/></div><p>{label}</p></div>
}
