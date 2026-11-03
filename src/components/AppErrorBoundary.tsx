import {Component,type ErrorInfo,type ReactNode} from 'react'
export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Planner render failed',error,info.componentStack)}
 render(){
  if(this.state.failed)return <main className="login-screen"><section className="login-card" role="alert"><h1>Planner needs to reload</h1><p>Your saved calendar and files are still in your account.</p><button className="primary-btn" onClick={()=>window.location.reload()}>Reload Planner</button></section></main>
  return this.props.children
 }
}
