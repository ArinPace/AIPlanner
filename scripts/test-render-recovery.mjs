import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174')
 await page.evaluate(async()=>{
  const reactModule=await import('/node_modules/.vite/deps/react.js');const React=reactModule.default??reactModule
  const domModule=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=domModule.createRoot??domModule.default.createRoot
  const {AppErrorBoundary}=await import('/src/components/AppErrorBoundary.tsx')
  document.getElementById('root').style.display='none'
  const target=document.createElement('div');document.body.append(target)
  function BrokenView(){throw new Error('Deliberate render failure for recovery test')}
  createRoot(target).render(React.createElement(AppErrorBoundary,null,React.createElement(BrokenView)))
 })
 const reload=page.getByRole('button',{name:'Reload Planner',exact:true});await reload.waitFor()
 assert.equal(await page.getByText('Your saved calendar and files are still in your account.',{exact:true}).isVisible(),true)
 await reload.click()
 await page.getByRole('textbox',{name:'Username or email',exact:true}).waitFor()
 console.log('Render recovery passed: a thrown React view displays recovery UI and reload restores Planner.')
}finally{await browser.close()}
