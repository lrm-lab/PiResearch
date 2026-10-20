import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const home = readFileSync(new URL("./home.html", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const navigation = home.slice(home.indexOf("let zooming = false;"), home.lastIndexOf("</script>"));
const entryScript = index.match(/<script>([\s\S]*?)<\/script>/)[1];
const tick = () => new Promise(resolve => setImmediate(resolve));
const camera = {scale:.5,panX:80,panY:60,left:0,top:68,width:1440,height:832};
const payload = {ok:true,version:7,nodes:[{id:"goal"},{id:"t1"}],edges:[]};

function setup({storageFails=false, animationFails=false, cached=null}={}){
  const listeners=new Map(), timers=new Map(), animations=[], visits=[], saved=new Map(), frames=[];
  class Element {
    constructor(name,rect={left:100,top:200,width:280,height:190}){
      this.name=name;this.rect=rect;this.style={};this.children=[];this.className="";this.events=new Map();this.dataset={};
    }
    setAttribute(){}
    append(...nodes){this.children.push(...nodes);}
    remove(){this.removed=true;}
    querySelector(selector){return this.children.find(node => selector==="svg" && node.name==="svg") || null;}
    querySelectorAll(selector){
      if(selector==="circle[data-id]") return this.children.filter(node => node.name==="circle");
      if(selector===".node-content,.node-tab,.node-id") return this.children;
      return [];
    }
    getBoundingClientRect(){return this.rect;}
    getScreenCTM(){return {a:.1,d:.1,e:100,f:200};}
    cloneNode(){return new Element(this.name,this.rect);}
    addEventListener(type,fn){this.events.set(type,fn);}
    animate(keys,timing){
      if(animationFails) throw new Error("unsupported");
      let finish,reject;
      const animation={node:this,keys,timing,finished:new Promise((resolve,no) => {finish=resolve;reject=no;}),
        finish:() => finish(),cancel:() => reject(new Error("cancelled"))};
      animations.push(animation);
      return animation;
    }
  }
  const svg=new Element("svg",{left:100,top:200,width:280,height:120});
  const source=new Element("circle",{left:120,top:220,width:20,height:20});
  source.dataset.id="goal";
  svg.append(source);
  const thumb=new Element("thumb");thumb.append(svg);
  const target=new Element("node",{left:500,top:300,width:120,height:120});
  target.dataset.id="goal";
  target.append(new Element("title"),new Element("badge"));
  const edges=new Element("edges"),chrome=new Element("chrome");
  const targetDocument={querySelectorAll:selector => selector===".node" ? [target] : [chrome],querySelector:() => edges};
  let scene;
  const body=new Element("body"), classes=new Set();
  body.classList={add:name => classes.add(name),remove:name => classes.delete(name)};
  const link={href:"http://127.0.0.1:8765/study/sessions/test/1",querySelector:() => thumb};
  const document={body,createElement:name => {
    const node=new Element(name);
    if(name==="iframe"){
      scene=node;
      node.contentDocument=targetDocument;
      node.contentWindow={studyEntry:{prepare:async () => ({payload,camera})}};
    }
    return node;
  },addEventListener:(name,fn) => listeners.set(name,fn)};
  const window={matchMedia:() => ({matches:false}),addEventListener:(name,fn) => listeners.set(name,fn),removeEventListener:name => listeners.delete(name)};
  const context=vm.createContext({document,window,URL,
    watches:new Map(cached ? [["study",{url:"/api/studies/sessions/test/1/snapshot",view:cached}]] : []),
    location:{assign:href => visits.push(href)},
    sessionStorage:{setItem:(key,value) => {if(storageFails) throw new Error("quota");saved.set(key,value);},removeItem:key => saved.delete(key)},
    requestAnimationFrame:fn => frames.push(fn),
    setTimeout:fn => {const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id => timers.delete(id),
  });
  vm.runInContext(navigation,context);
  const event=(overrides={}) => ({button:0,preventDefault(){this.prevented=true;},target:{closest:selector => selector==="a.card-link" ? link : null},...overrides});
  return {listeners,timers,animations,visits,saved,thumb,body,classes,window,event,frames,target,edges,
    get scene(){return scene;},
    nodeTransform:vm.runInContext("sharedNodeTransform",context),
    edgeTransform:vm.runInContext("sharedEdgeTransform",context),
    click:input => listeners.get("click")(input || event()),
    load:async () => {scene.events.get("load")();await tick();},
    paint:async () => {frames.splice(0).forEach(fn => fn());await tick();},
  };
}

async function complete(run){
  run.animations.forEach(animation => animation.finish());
  await tick();
  await run.paint();
  await run.paint();
}

test("the destination must be ready before the real nodes animate; repeat clicks cannot race",async () => {
  const run=setup(), event=run.event(), flying=run.click(event);
  assert.equal(event.prevented,true);
  assert.equal(run.animations.length,0);
  assert.match(run.scene.src,/entry-preview=1/);
  const repeat=run.event();await run.click(repeat);
  assert.equal(repeat.prevented,true);
  await run.load();
  assert.ok(run.animations.some(animation => animation.node===run.target));
  assert.equal(run.visits.length,0);
  await complete(run);await flying;
  assert.equal(run.visits.length,1);
});

test("shared nodes start at the thumbnail's exact centers and diameters in world coordinates",() => {
  const run=setup();
  for(const scale of [.12,.5,1.15]){
    const source={left:120,top:220,width:20,height:20};
    const target={left:500,top:300,width:120,height:120};
    const transform=run.nodeTransform(source,target,scale);
    const [,dx,dy,ratio]=/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform).map(Number);
    assert.ok(Math.abs(target.left+target.width/2+dx*scale-source.left-source.width/2)<.00001);
    assert.ok(Math.abs(target.top+target.height/2+dy*scale-source.top-source.height/2)<.00001);
    assert.ok(Math.abs(target.width*ratio-source.width)<.00001);
  }
});

test("edge transform maps the same world point back to its source SVG pixel position",() => {
  const run=setup(), matrix={a:.08,e:120,f:230};
  const [,dx,dy,ratio]=/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(run.edgeTransform(matrix,camera)).map(Number);
  for(const [x,y] of [[0,0],[300,800],[-100,200]]){
    assert.ok(Math.abs(camera.left+camera.panX+(x*ratio+dx)*camera.scale-(x*matrix.a+matrix.e))<.00001);
    assert.ok(Math.abs(camera.top+camera.panY+(y*ratio+dy)*camera.scale-(y*matrix.a+matrix.f))<.00001);
  }
});

test("navigation waits for the coincident frame to paint and transfers that exact view and camera",async () => {
  const run=setup(),flying=run.click();await run.load();
  const nodeAnimation=run.animations.find(animation => animation.node===run.target);
  assert.equal(nodeAnimation.keys.at(-1).transform,"translate(0px, 0px) scale(1)");
  run.animations.forEach(animation => animation.finish());await tick();
  assert.equal(run.visits.length,0);
  await run.paint();assert.equal(run.visits.length,0);
  await run.paint();await flying;
  const entry=JSON.parse(run.saved.get("piresearch-zoom"));
  assert.deepEqual(entry.view.payload,payload);
  assert.deepEqual(entry.camera,camera);
  assert.equal(entry.svg,undefined);
  assert.equal(run.timers.size,0);
});

test("unavailable or slow preview falls back once without trapping navigation",async () => {
  const run=setup(),flying=run.click();
  [...run.timers.values()][0]();
  assert.equal(run.visits.length,1);
  await run.load();await flying;
  assert.equal(run.visits.length,1);
  assert.equal(run.animations.length,0);
});

test("returning through history cancels a waiting preview and restores source state",async () => {
  const run=setup(),flying=run.click();
  run.listeners.get("pageshow")({persisted:true});await flying;
  assert.equal(run.visits.length,0);
  assert.equal(run.classes.has("is-zooming"),false);
  assert.equal(run.timers.size,0);
  assert.ok(run.body.children.every(element => element.removed));
});

test("a viewport change interrupts the obsolete geometry and navigates once",async () => {
  const run=setup(),flying=run.click();await run.load();
  run.listeners.get("resize")();await flying;
  assert.equal(run.visits.length,1);
  assert.equal(run.listeners.has("resize"),false);
});

test("native modified clicks and reduced motion remain native",async () => {
  const run=setup();
  for(const modifier of [{metaKey:true},{ctrlKey:true},{button:1}]){
    const event=run.event(modifier);await run.click(event);assert.equal(event.prevented,undefined);
  }
  run.window.matchMedia=() => ({matches:true});
  const event=run.event();await run.click(event);assert.equal(event.prevented,undefined);
  assert.equal(run.body.children.length,0);
});

test("storage or animation failure still navigates normally",async () => {
  const run=setup({storageFails:true,animationFails:true}),flying=run.click();
  await run.load();await flying;
  assert.equal(run.visits.length,1);
});

test("entry accepts only recent real graph data for the matching destination",() => {
  const context=vm.createContext({sessionStorage:{getItem:() => null,removeItem(){}},window:{matchMedia:() => ({matches:false})},location:{pathname:"/study/test"}});
  const read=vm.runInContext(`${entryScript}\nreadThumbEntry`,context);
  const valid={href:"/study/test",at:10000,view:{at:10000,payload:{ok:true,nodes:[],edges:[]}}};
  assert.ok(read(JSON.stringify(valid),"/study/test",10100));
  for(const bad of [null,"1","bad json",JSON.stringify({...valid,href:"/study/other"}),JSON.stringify({...valid,at:0}),JSON.stringify({...valid,view:null}),JSON.stringify({...valid,at:11000})]){
    assert.equal(read(bad,"/study/test",10100),null);
  }
});

test("preview preparation freezes the exact data while the graph morphs",async () => {
  const block=index.slice(index.indexOf("if(entryPreview){\n  window.studyEntry"),index.lastIndexOf("</script>"));
  const frames=[],next=async () => {frames.splice(0).forEach(fn => fn());await tick();};
  const context=vm.createContext({entryPreview:true,entryLocked:false,firstView:Promise.resolve(),view:null,scale:camera.scale,panX:camera.panX,panY:camera.panY,
    window:{},document:{fonts:{ready:Promise.resolve()}},canvasEl:{clientWidth:camera.width,clientHeight:camera.height,getBoundingClientRect:() => ({left:0,top:68})},
    requestAnimationFrame:fn => frames.push(fn),Date,
  });
  context.applyView=view => {context.view=view;};
  vm.runInContext(block,context);
  const prepared=context.window.studyEntry.prepare({payload,at:Date.now()});
  assert.equal(context.entryLocked,true);
  await tick();await next();await next();
  const result=await prepared;
  assert.equal(result.payload,payload);
  assert.deepEqual(JSON.parse(JSON.stringify(result.camera)),camera);
});
