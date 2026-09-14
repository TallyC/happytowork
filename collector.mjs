import { chromium } from 'playwright';
import { readFile,writeFile,rename,mkdir } from 'node:fs/promises';
const FILE=new URL('./dist/data.json',import.meta.url),now=new Date();
const dateOf=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const dates=[dateOf(now),dateOf(new Date(+now+86400000))];
let data;try{data=JSON.parse(await readFile(FILE,'utf8'))}catch{data={days:{},weather:{}}}
data.attemptedAt=now.toISOString();data.errors=[];
const configs=[{no:'4514',type:'區間',from:'吉安',to:'瑞穗',direction:'outbound'},{no:'306',type:'自強3000',from:'吉安',to:'瑞穗',direction:'outbound'},{no:'4537',type:'區間',from:'瑞穗',to:'吉安',direction:'inbound'},{no:'431',type:'自強3000',from:'瑞穗',to:'花蓮',direction:'inbound'},{no:'4543',type:'區間',from:'瑞穗',to:'吉安',direction:'inbound'}];
const routeQueries=[
 {id:'hualien-taipei',label:'花蓮 ⇄ 臺北',from:'7000-花蓮',to:'1000-臺北',weather:['花蓮市'],outboundWindow:['00:00','23:59'],inboundWindow:['00:00','23:59']},
 {id:'hualien-luodong',label:'花蓮 ⇄ 羅東',from:'7000-花蓮',to:'7160-羅東',weather:['花蓮市'],outboundWindow:['00:00','23:59'],inboundWindow:['00:00','23:59']}
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'zh-TW',timezoneId:'Asia/Taipei'});
let stopped=new Set();
async function visit(url,fn){const host=new URL(url).hostname;if(stopped.has(host))throw Error('來源暫停：先前遭阻擋');const page=await context.newPage();try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if([403,429].includes(response?.status())){stopped.add(host);throw Error('來源拒絕存取，停止本輪擷取')}if(!response?.ok())throw Error('來源連線失敗');const text=await page.locator('body').innerText();if(/verify you are human|access denied|驗證您是人類|too many requests/i.test(text)){stopped.add(host);throw Error('來源要求驗證，停止本輪擷取')}return await fn(page)}finally{await page.close();await new Promise(r=>setTimeout(r,2000))}}
async function queryRoute(date,q,direction){const start=direction==='outbound'?q.from:q.to,end=direction==='outbound'?q.to:q.from;const window=direction==='outbound'?q.outboundWindow:q.inboundWindow;return visit('https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip112/gobytime',async page=>{
 await page.locator('#startStation').fill(start);await page.locator('#endStation').fill(end);await page.locator('#rideDate').fill(date.replaceAll('-','/'));await page.locator('#startTime').selectOption(window[0]);await page.locator('#endTime').selectOption(window[1]);await page.getByRole('button',{name:'查詢',exact:true}).click();await page.locator('table').filter({hasText:'建議搭乘車次'}).first().waitFor({timeout:30000});
 const rows=await page.locator('table').filter({hasText:'建議搭乘車次'}).first().locator('tr').evaluateAll(rs=>rs.slice(1).map(row=>{const cells=Array.from(row.querySelectorAll('td')).map(c=>c.innerText.replace(/\s+/g,' ').trim());const link=row.querySelector('a[href*="querybytrainno"]');const title=link?.innerText?.trim()||'';const no=title.match(/(\d{3,4})\s*$/)?.[1];const type=title.replace(/\s*\d{3,4}\s*$/,'').trim();return {title,no,type,departure:cells[1]||null,arrival:cells[2]||null,summary:cells[0]||null}}).filter(x=>x.no&&/^\d{2}:\d{2}$/.test(x.departure)&&/^\d{2}:\d{2}$/.test(x.arrival)));
 if(date===dates[0]){for(const train of rows.slice(0,20)){try{const detail=await queryTrainStatus(date,train.no,stationName(end));train.status=detail.status;train.milestones=detail.stations;train.statusCheckedAt=new Date().toISOString()}catch(e){data.errors.push(`${date} ${train.no} 動態：${e.message}`)}}}
 return {id:q.id,label:q.label,from:start,to:end,direction,trains:rows,window,checkedAt:new Date().toISOString(),url:page.url()};
})}
const stationName=s=>String(s??'').replace(/^\d+-/,'');
async function queryTrainStatus(date,no,target){return visit(`https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip112/querybytrainno?rideDate=${date.replaceAll('-','/')}&trainNo=${encodeURIComponent(no)}`,async page=>{await page.locator('table').nth(1).waitFor({timeout:20000});const rows=await page.locator('table').nth(1).locator('tr').evaluateAll(rs=>rs.slice(1).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.innerText.replace(/\s+/g,' ').trim())));const row=rows.find(r=>r[0]===target);if(!row)throw Error(`找不到${target}站`);const stations=rows.filter(r=>r[0]&&/^\d{2}:\d{2}$/.test(r[1]||'')).filter(r=>['臺東','台東','花蓮','羅東','宜蘭','臺北','台北'].includes(r[0])).map(r=>({name:r[0].replace('台北','臺北').replace('台東','臺東'),arrival:r[1]||null,departure:r[2]||null,status:r[3]||null}));return {status:row.slice(3).find(v=>/準點|誤點|停駛|取消|運轉|到站|發車/.test(v))||null,stations}})}
try{
 for(const date of dates){const previous=data.days[date];if(date!==dates[0]&&previous&&Date.now()-Date.parse(previous.checkedAt)<6*3600000)continue;
 const trains=[];let failed=false;
 for(const c of configs){try{const url=`https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip112/querybytrainno?rideDate=${date.replaceAll('-','/')}&trainNo=${c.no}`;
 const result=await visit(url,async page=>{await page.getByRole('columnheader',{name:'狀態',exact:true}).waitFor({timeout:20000});const rows=await page.locator('table tr').evaluateAll(rows=>rows.map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.innerText.trim())));const from=rows.find(r=>r[0]===c.from),to=rows.find(r=>r[0]===c.to);if(!from||!to||!/^\d{2}:\d{2}$/.test(from[2])||!/^\d{2}:\d{2}$/.test(to[1]))throw Error('車站或時刻欄位缺漏');return {...c,departure:from[2],arrival:to[1],status:to[3]||from[3]||null,url}});trains.push(result);
 }catch(e){failed=true;data.errors.push(`${date} ${c.no}：${e.message}`);console.warn(`${date} ${c.no}: ${e.message}`)}}
 const routes=[];for(const q of routeQueries){for(const direction of ['outbound','inbound']){try{routes.push(await queryRoute(date,q,direction))}catch(e){data.errors.push(`${date} ${q.id} ${direction}：${e.message}`);console.warn(`${date} ${q.id} ${direction}: ${e.message}`)}}}
 if(!failed)data.days[date]={checkedAt:new Date().toISOString(),trains,routes};else if(previous)data.days[date]={...previous,error:true};
 }
 try{data.rail=await visit('https://www.railway.gov.tw/tra-tip-web/tip',async page=>{const text=await page.locator('dl').filter({hasText:'路線運行狀態'}).innerText();return {text:text.replace('路線運行狀態','').replace('詳細資訊','').trim(),checkedAt:new Date().toISOString()}})}catch(e){data.errors.push('台鐵公告：'+e.message)}
 for(const [name,id] of [['吉安鄉','1001505'],['瑞穗鄉','1001509'],['花蓮市','1001501']]){const old=data.weather[name];if(old&&Date.now()-Date.parse(old.checkedAt)<3600000)continue;
 try{const url=`https://www.cwa.gov.tw/V8/C/W/Town/Town.html?TID=${id}`;data.weather[name]=await visit(url,async page=>{await page.locator('#TableId3hr td .tem-C').first().waitFor({timeout:30000});const hours=await page.locator('#TableId3hr').evaluate((table,baseDate)=>{
 const norm=s=>s?.replace(/\s+/g,' ').trim()||'';
 const rows=Array.from(table.rows),times=Array.from(table.querySelectorAll('tr.time th')).slice(1);
 const dayMap=Object.fromEntries(Array.from(table.querySelectorAll('thead th[id]')).map(th=>[th.id,norm(th.innerText).match(/\d{2}\/\d{2}/)?.[0]]));
 const fields={};for(const row of rows){const label=norm(row.cells[0]?.innerText);if(!['溫度','降雨機率','天氣狀況','蒲福風級'].includes(label))continue;const vals=[];for(const cell of Array.from(row.cells).slice(1)){const value=label==='溫度'?norm(cell.querySelector('.tem-C')?.textContent):label==='天氣狀況'?cell.querySelector('img')?.alt||norm(cell.innerText):norm(cell.innerText);for(let i=0;i<(cell.colSpan||1);i++)vals.push(value)}fields[label]=vals}
 return times.map((th,i)=>{const md=th.headers.split(' ').map(id=>dayMap[id]).find(Boolean);if(!md)return null;let year=Number(baseDate.slice(0,4));const month=Number(md.slice(0,2)),baseMonth=Number(baseDate.slice(5,7));if(baseMonth===12&&month===1)year++;if(baseMonth===1&&month===12)year--;return {date:`${year}-${md.replace('/','-')}`,time:norm(th.innerText),temperature:fields['溫度']?.[i]||null,rain:fields['降雨機率']?.[i]||null,description:fields['天氣狀況']?.[i]||null,wind:fields['蒲福風級']?.[i]?fields['蒲福風級'][i]+' 級':null}}).filter(Boolean)
 },dates[0]);if(!hours.length||hours.some(h=>h.temperature===null))throw Error('預報表格不完整');return {url,checkedAt:new Date().toISOString(),hours}})
 }catch(e){data.errors.push(name+'：'+e.message);console.warn(name+': '+e.message)} }
}finally{await browser.close()}
data.days=Object.fromEntries(Object.entries(data.days).filter(([date])=>date>=dates[0]));
await mkdir(new URL('./dist/',import.meta.url),{recursive:true});await writeFile(new URL('./dist/data.tmp',import.meta.url),JSON.stringify(data,null,2));await rename(new URL('./dist/data.tmp',import.meta.url),FILE);
console.log(JSON.stringify({days:Object.keys(data.days),weather:Object.keys(data.weather),errors:data.errors},null,2));
if(!Object.keys(data.days).length&&!Object.keys(data.weather).length)process.exitCode=1;
