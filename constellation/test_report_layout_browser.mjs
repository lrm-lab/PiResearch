// PIRESEARCH_PUPPETEER_MODULE=/absolute/path/to/puppeteer.js node --test constellation/test_report_layout_browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

const browserModule=process.env.PIRESEARCH_PUPPETEER_MODULE;
test('long question titles and wide tables keep the report centred and readable', {
  skip:browserModule ? false : 'Set PIRESEARCH_PUPPETEER_MODULE to run the Chromium layout regression',
  timeout:60000,
}, async t=>{
  const {default:puppeteer}=await import(pathToFileURL(browserModule).href);
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  let question='';
  const markdown='# 土地财政转型研究报告\n\n摘要：报告正文必须完整显示。\n\n'+
    '| 项目 | 日期 | 数字 | 定义 | 分析 | 来源 | 备注 |\n| --- | --- | --- | --- | --- | --- | --- |\n'+
    '| 土地出让 | 2021年 | 100 | 定义内容 | 分析内容 | 官方来源 | 核验说明 |\n\n'+
    '正文中的长字符串：'+'DataWithoutWhitespace'.repeat(80)+'\n\n'+
    '```text\n'+('long-code-line '.repeat(150))+'\n```\n';
  const server=createServer((req,res)=>{
    if((req.url.endsWith('/view') || req.url.endsWith('/snapshot'))){
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:true,version:1,running:false,goal:{id:'goal',title:question},nodes:[{id:'goal',goal:true,title:question,x:200,y:200,radius:100,children:[],steps:[],live:[],agents:[],tone:'origin',weight:'origin'}],edges:[]}));
    }else if(req.url.endsWith('/report')){
      res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(markdown);
    }else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  t.after(()=>browser.close());
  const cases=[
    {name:'desktop Chinese',width:1440,height:900,title:'请就土地财政模式的转型撰写报告。'+('调研要求与数据来源。'.repeat(180))+'https://example.com/'+('very-long-reference'.repeat(50))},
    {name:'desktop English',width:1024,height:768,title:'Research the social protection gap. '+('RequirementWithoutAnyWhitespace'.repeat(80))},
    {name:'mobile',width:390,height:844,title:'调研问题。'+('详细要求。'.repeat(400))},
  ];
  for(const fixture of cases){
    await t.test(fixture.name,async()=>{
      question=fixture.title;
      const page=await browser.newPage();
      try{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.setViewport({width:fixture.width,height:fixture.height});
        await page.goto(`http://127.0.0.1:${server.address().port}/study/test`,{waitUntil:'domcontentloaded'});
        await page.waitForSelector('.node[data-id="goal"]');
        await page.click('#open-report');
        await page.waitForSelector('#report-body h1');
        await page.waitForFunction(()=>document.querySelector('.report').getBoundingClientRect().width>0);
        // Wait for the authored entrance animation before measuring geometry.
        await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.target?.closest?.('#modal')).map(a=>a.finished.catch(()=>{}))));
        const dimensions=await page.evaluate(()=>{
          const box=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollLeft:e.scrollLeft,height:r.height};};
          return {report:box('.report'),header:box('.report header'),body:box('#report-body'),title:box('#report-title'),close:box('#close-report'),heading:box('#report-body h1'),table:box('.table-wrap'),width:innerWidth};
        });
        const {report,header,body,close,heading,table}=dimensions;
        assert.ok(Math.abs((report.left+report.right)/2-fixture.width/2)<1,JSON.stringify(dimensions));
        assert.equal(report.scrollLeft,0,JSON.stringify(dimensions));
        assert.ok(report.scrollWidth<=report.clientWidth+1,JSON.stringify(dimensions));
        assert.ok(header.width<=report.width+1&&body.width<=report.width+1,JSON.stringify(dimensions));
        assert.ok(heading.left>=report.left&&heading.right<=report.right,JSON.stringify(dimensions));
        assert.ok(close.left>=report.left&&close.right<=report.right,JSON.stringify(dimensions));
        assert.ok(table.width<=body.width&&table.scrollWidth>=table.clientWidth,JSON.stringify(dimensions));
        assert.ok(dimensions.title.height<=45,'modal heading must stay within two lines');
        await page.$eval('.table-wrap',e=>e.scrollLeft=e.scrollWidth);
        assert.equal(await page.$eval('.report',e=>e.scrollLeft),0,'scrolling a table shifted the whole dialog');
        await page.click('#close-report');
        await page.click('#open-report');
        await page.waitForSelector('#report-body h1');
        assert.equal(await page.$eval('.report',e=>e.scrollLeft),0,'reopening retained horizontal displacement');
        assert.deepEqual(errors,[]);
      }finally{await page.close();}
    });
  }
});
