// Browser checks use real frontend code and synthetic fixtures from the Rust harness.
// IPC is mocked: this does not certify Tauri dialogs, Windows WebView2 or SMTP.
// Install tooling outside the app: npm install --prefix /tmp/lc-guidance-audit-browser playwright @axe-core/playwright
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(`${process.env.AUDIT_BROWSER_TOOLS || '/tmp/lc-guidance-audit-browser'}/package.json`);
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const output = new URL('./', import.meta.url);
const fixtures = JSON.parse(await fs.readFile(new URL('./synthetic-fixtures.json', import.meta.url)));
const results = [];
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({ viewport:{width:1366,height:768}, timezoneId:'Asia/Manila' });
await context.addInitScript(({fixtures}) => {
  window.__auditCalls=[]; window.__auditSavedFiles=[]; window.__auditCases=structuredClone(fixtures.cases);
  window.__auditSetup=true;
  window.__TAURI_INTERNALS__={
    transformCallback:()=>0,
    invoke:async(cmd,args={})=>{
      window.__auditCalls.push({cmd,args});
      if(cmd==='check_setup_complete')return window.__auditSetup;
      if(cmd==='verify_pin')return args.pin==='123456';
      if(cmd==='plugin:app|version')return '0.1.10';
      if(cmd==='plugin:updater|check')return null;
      if(cmd==='get_current_school_year')return '2026-2027';
      if(cmd==='get_all_school_years')return ['2026-2027','2026','2025','2024'];
      if(cmd==='get_active_months')return ['2024-08','2025-03','2026-10'];
      if(cmd==='get_cases'){
        if(window.__auditFailReads)throw 'Synthetic database read failure';
        return window.__auditCases.filter(c=>!args.groupId || c.group_id===args.groupId);
      }
      if(cmd==='get_case')return window.__auditCases.find(c=>c.id===args.id);
      if(cmd==='get_recovery_email')return 'owner@example.test';
      if(cmd==='get_gemini_api_key')return '';
      if(cmd==='get_backups'||cmd==='get_ai_sessions'||cmd==='get_ai_generated_documents')return [];
      if(cmd==='plugin:dialog|open')return ['/synthetic/school.xlsx'];
      if(cmd==='parse_import_file')return structuredClone(fixtures.import);
      if(cmd==='add_case'){
        if(window.__auditFailAdd && window.__auditCalls.filter(c=>c.cmd==='add_case').length>=window.__auditFailAdd)throw 'Synthetic second-student save failure';
        const p=args.payload,s=p.students[0];const id=window.__auditCases.length+1;
        window.__auditCases.push({id,first_name:s.firstName,last_name:s.lastName,middle_initial:s.middleInitial,level:s.level,section:s.section,adviser:s.adviser,date:p.date,date_filed:p.dateFiled,case:p.case,description:p.description,sanction:p.sanction,progress:p.progress,proofs:p.proofs,students:JSON.stringify(p.students),title:p.title,reporting_student:p.reportingStudent||'',group_id:p.groupId||null,school_year:'2026-2027',update_history:'[]'});return id;
      }
      if(cmd==='update_case')return null;
      if(cmd==='save_pdf'||cmd==='save_file'){window.__auditSavedFiles.push(args);return `/synthetic/${args.filename}`;}
      if(cmd==='batch_import_cases')return {success:true,inserted_count:args.rows.length,failed_count:0,errors:[]};
      throw `Unhandled audit IPC command: ${cmd}`;
    }
  };
},{fixtures});
const page=await context.newPage();
page.setDefaultTimeout(8000);
let errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('dialog',async d=>{results.push({name:'browser dialog',message:d.message()});await d.dismiss();});
async function check(name,fn){try{results.push({name,...await fn()});}catch(e){results.push({name,error:String(e)});}}
async function signIn(){await page.goto('http://127.0.0.1:1420');await page.locator('input').first().fill('123456');await page.getByRole('button',{name:/Sign In/}).click();await page.getByRole('link',{name:/Case Catalog/}).waitFor();}
async function route(path){await page.goto(`http://127.0.0.1:1420/#${path}`);await page.reload();await page.waitForTimeout(250);if(await page.getByRole('button',{name:/Sign In/}).isVisible()){await page.locator('input').first().fill('123456');await page.getByRole('button',{name:/Sign In/}).click();}await page.locator('main').waitFor();await page.waitForTimeout(650);}
async function axe(name){let a=await new AxeBuilder({page}).analyze();return {name,violations:a.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,examples:v.nodes.slice(0,3).map(n=>({target:n.target,html:n.html}))}))};}
await check('sign-in invalid PIN and accessibility',async()=>{
  await page.goto('http://127.0.0.1:1420');await page.locator('input').first().fill('654321');await page.getByRole('button',{name:/Sign In/}).click();
  const invalid=await page.getByText('Incorrect PIN. Try again.').isVisible();
  const a=await axe('sign-in');await page.screenshot({path:new URL('sign-in.png',output).pathname});return {invalidPinFeedback:invalid,...a};
});
for(const path of ['/','/catalog','/pending','/reports','/distribution','/case/1','/group-case/audit-group','/account','/account?tab=backup','/ai']){
  await check(`route ${path}`,async()=>{await route(path);const a=await axe(path);const text=await page.locator('main').innerText();await page.screenshot({path:new URL(`${path.replace(/[^a-z0-9]/gi,'_')||'dashboard'}.png`,output).pathname});return {rendered:text.slice(0,160),pageErrors:errors.splice(0),...a};});
}
await check('group edit preserves one shared complainant per record',async()=>{
  await route('/group-case/audit-group');await page.getByRole('button',{name:'edit Edit',exact:true}).click();
  await page.getByRole('button',{name:'save Save',exact:true}).click();await page.waitForTimeout(400);
  const calls=await page.evaluate(()=>window.__auditCalls.filter(c=>c.cmd==='update_case'));
  return {savedRecords:calls.length,complainantsPerRecord:calls.map(c=>c.args.payload.students.filter(s=>s.role==='Complainant / Subject').length)};
});
await check('summary PDF generation and export',async()=>{
  await route('/reports');await page.getByRole('button',{name:/Export PDF/}).click();
  await page.waitForFunction(()=>window.__auditSavedFiles.length>0,{timeout:15000});
  const files=await page.evaluate(()=>window.__auditSavedFiles);
  for(const f of files)await fs.writeFile(new URL(f.filename,output),Buffer.from(f.base64Data,'base64'));
  return {files:files.map(f=>({filename:f.filename,bytes:Buffer.from(f.base64Data,'base64').length}))};
});
await check('export workbook and modal dismissal',async()=>{
  await route('/catalog');await page.getByRole('button',{name:/Export to Excel/}).click();
  await page.getByRole('button',{name:/Download Excel|Export Excel|Export.*xlsx/i}).last().click();
  await page.waitForFunction(()=>window.__auditSavedFiles.length>0);
  const files=await page.evaluate(()=>window.__auditSavedFiles);
  for(const f of files)await fs.writeFile(new URL(f.filename,output),Buffer.from(f.base64Data,'base64'));
  // Successful save starts a 200ms exit animation; await completed dismissal.
  await page.getByText('Export Cases to Excel',{exact:true}).waitFor({state:'hidden',timeout:5000});
  return {files:files.map(f=>({filename:f.filename,bytes:Buffer.from(f.base64Data,'base64').length})),modalStillVisible:await page.getByText('Export Cases to Excel',{exact:true}).isVisible()};
});
await check('Excel export includes incident time on end date',async()=>{
  await route('/catalog');await page.evaluate(()=>{window.__auditCases=[{...window.__auditCases[0],date:'2026-10-13T17:15'}];window.dispatchEvent(new Event('cases:changed'));});await page.waitForTimeout(300);
  await page.getByRole('button',{name:/Export to Excel/}).click();
  const dates=page.locator('input[type="date"]');await dates.nth(0).fill('2026-10-13');await dates.nth(1).fill('2026-10-13');
  const text=(await page.locator('body').innerText()).slice(-500);return {text,exportDisabled:await page.getByRole('button',{name:'file_download Export Excel File',exact:true}).isDisabled()};
});
await check('Excel import review and commit navigation',async()=>{
  await route('/catalog');await page.getByRole('button',{name:/Import Excel/}).click();
  results.push({name:'import dialog text',text:(await page.locator('body').innerText()).slice(-3000)});
  await page.getByRole('button',{name:/Select.*File|Choose.*File|Browse.*File|Upload.*File|Select Excel/i}).click();
  await page.waitForURL(/import-review/);await page.waitForTimeout(400);
  const a=await axe('import review');await page.screenshot({path:new URL('import-review.png',output).pathname});
  await page.getByRole('button',{name:/Add More Files/}).click();await page.waitForTimeout(400);
  const duplicateText=(await page.locator('main').innerText()).slice(0,900);
  await page.getByRole('button',{name:/Import All Ready Rows/}).click();await page.waitForTimeout(400);
  const commit=await page.evaluate(()=>window.__auditCalls.filter(c=>c.cmd==='batch_import_cases').at(-1));
  return {reviewText:duplicateText,committedRowCount:commit?.args.rows.length,uniqueNames:commit?new Set(commit.args.rows.map(r=>r.full_name)).size:0,...a};
});
await check('new case form labels and keyboard modal',async()=>{
  await route('/catalog');await page.getByRole('button',{name:/File New Case/}).click();
  await page.getByRole('button',{name:'Bullying',exact:true}).click();await page.getByRole('button',{name:/Continue/}).click();
  results.push({name:'new case field inventory',inputs:await page.locator('input').evaluateAll(es=>es.map(e=>({placeholder:e.placeholder,id:e.id,type:e.type}))),text:(await page.locator('body').innerText()).slice(-2300)});
  const a=await axe('new case student form');await page.keyboard.press('Escape');
  return {escapeClosedModal:!(await page.getByText('File New Case',{exact:true}).last().isVisible()),...a};
});
await check('file ordinary case through four steps',async()=>{
  await route('/catalog');await page.getByRole('button',{name:/File New Case/}).click();
  await page.getByRole('button',{name:'Bullying',exact:true}).click();await page.getByRole('button',{name:/Continue/}).click();
  await page.getByPlaceholder('e.g. Dela Cruz',{exact:true}).first().fill('Synthetic');
  await page.getByPlaceholder('e.g. Juan',{exact:true}).first().fill('Auditor');
  await page.getByPlaceholder('e.g. Grade 10',{exact:true}).first().fill('7');
  await page.getByRole('button',{name:/Continue/}).click();await page.getByRole('button',{name:/Continue/}).click();
  await page.getByRole('button',{name:/File case/}).last().click();await page.waitForTimeout(500);
  const call=await page.evaluate(()=>window.__auditCalls.find(c=>c.cmd==='add_case'));
  return {saved:!!call,payload:call?.args.payload};
});
await check('failed second group record leaves a partial group',async()=>{
  await route('/catalog');await page.evaluate(()=>{window.__auditFailAdd=2;});
  await page.getByRole('button',{name:/File New Case/}).click();
  await page.getByRole('button',{name:'Bullying',exact:true}).click();await page.getByRole('button',{name:/Continue/}).click();
  await page.getByPlaceholder('e.g. Dela Cruz',{exact:true}).first().fill('Synthetic');
  await page.getByPlaceholder('e.g. Juan',{exact:true}).first().fill('One');
  await page.getByRole('button',{name:/Add another student/}).click();
  await page.getByPlaceholder('e.g. Dela Cruz',{exact:true}).last().fill('Synthetic');
  await page.getByPlaceholder('e.g. Juan',{exact:true}).last().fill('Two');
  await page.getByRole('button',{name:/Continue/}).click();await page.getByPlaceholder('e.g. Class Incident',{exact:true}).fill('Synthetic group');
  await page.getByRole('button',{name:/Continue/}).click();await page.getByRole('button',{name:/File case/}).last().click();await page.waitForTimeout(400);
  return {createdBeforeFailure:await page.evaluate(n=>window.__auditCases.length-n,fixtures.cases.length),text:(await page.locator('body').innerText()).slice(-800)};
});
await check('database error feedback',async()=>{
  await route('/catalog');await page.evaluate(()=>{window.__auditFailReads=true;window.dispatchEvent(new Event('cases:changed'));});await page.waitForTimeout(300);
  return {text:(await page.locator('main').innerText()).slice(0,600),explicitError:await page.getByText('Synthetic database read failure').isVisible()};
});
await check('first-launch layout at 1024x600',async()=>{
  await page.setViewportSize({width:1024,height:600});await page.goto('http://127.0.0.1:1420');await page.evaluate(()=>{window.__auditSetup=false;});
  // Reload uses default initialized fixture, so set setup via context override for a new page.
  await context.addInitScript(()=>{window.__auditSetup=false;});await page.reload();await page.waitForTimeout(300);
  await page.screenshot({path:new URL('setup-1024x600.png',output).pathname});
  const button=await page.getByRole('button',{name:/Complete Setup/}).boundingBox();return {button,viewportHeight:600,bodyScrollHeight:await page.evaluate(()=>document.body.scrollHeight),...await axe('first launch')};
});
await fs.writeFile(new URL('ui-results.json',output),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({name:r.name,error:r.error,pageErrors:r.pageErrors,violations:r.violations?.map(v=>`${v.id}:${v.count}`),files:r.files,modalStillVisible:r.modalStillVisible,explicitError:r.explicitError,escapeClosedModal:r.escapeClosedModal})),null,2));
await browser.close();
