import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const functions=page.slice(page.indexOf('function selectionHeading('),page.indexOf('function select(id,'));
function setup(){
  const elements=new Map();
  for(const id of ['#title','#question-details','#question-content','#question-label','#question-length','.drawer-body']){
    elements.set(id,{textContent:'',dataset:{},open:false,hidden:false,scrollTop:0,setAttribute(){}});
  }
  const context=vm.createContext({document:{querySelector:id=>elements.get(id)},activeStep:null});
  vm.runInContext(functions,context);
  return {elements,render:(node,step=null)=>context.renderSelectionHeading(node,step),heading:(text,goal)=>context.selectionHeading(text,goal)};
}

test('a long question has a concise heading and retains the complete original text',()=>{
  const ui=setup();
  const original='分析市场波动。\n\n'+('**要求**：保留每项数据与来源。\n'.repeat(300))+'<script>原文</script>';
  ui.render({id:'goal',goal:true,title:original});
  assert.equal(ui.elements.get('#title').textContent,'分析市场波动');
  assert.equal(ui.elements.get('#question-content').textContent,original);
  assert.equal(ui.elements.get('#question-details').hidden,false);
  assert.equal(ui.elements.get('#question-details').open,false);
});

test('polling the same node preserves expansion and both reading positions',()=>{
  const ui=setup(),node={id:'goal',goal:true,title:'问题。\n'+('调研细节'.repeat(1000))};
  ui.render(node);
  const details=ui.elements.get('#question-details'),content=ui.elements.get('#question-content'),body=ui.elements.get('.drawer-body');
  details.open=true;content.scrollTop=700;body.scrollTop=120;
  ui.render({...node});
  assert.equal(details.open,true);
  assert.equal(content.scrollTop,700);
  assert.equal(body.scrollTop,120);
  ui.render({id:'t1',goal:false,title:'子任务'});
  assert.equal(details.open,false);
  assert.equal(details.hidden,true);
  assert.equal(content.scrollTop,0);
  assert.equal(body.scrollTop,0);
});

test('long node titles can be read in full and step details do not reuse the goal prompt',()=>{
  const ui=setup(),node={id:'t1',title:'X'.repeat(150)};
  ui.render(node);
  assert.equal(ui.elements.get('#question-details').hidden,false);
  assert.equal(ui.elements.get('#question-label').textContent,'完整内容');
  assert.equal(ui.elements.get('#question-content').textContent,node.title);
  ui.render({id:'goal',goal:true,title:'主问题'}, {label:'打开来源',tool:'web_fetch'});
  assert.equal(ui.elements.get('#title').textContent,'打开来源');
  assert.equal(ui.elements.get('#question-content').textContent,'打开来源');
});

test('headings handle English sentences and emoji without splitting surrogate pairs',()=>{
  const ui=setup();
  assert.equal(ui.heading('First sentence. More requirements.',true),'First sentence');
  assert.equal(ui.heading('🚀'.repeat(120),true),'🚀'.repeat(100)+'…');
  assert.equal(ui.heading('普通子任务。保留全部标题。',false),'普通子任务。保留全部标题。');
});
