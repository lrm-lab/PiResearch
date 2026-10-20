import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const classifier = page.slice(page.indexOf("function goalActivity("), page.indexOf("function goalIsWorking("));
const activityKey = page.slice(page.indexOf("function liveKey("), page.indexOf("function sizeKey("));
const { goalActivity, liveKey } = vm.runInNewContext(`${classifier}\n${activityKey}\n({goalActivity,liveKey})`);
const completed = {
  ok:true, version:6, running:true,
  nodes:[{id:"goal",goal:true},{id:"t1",status:"resolved",live:[]},{id:"t2",status:"resolved",live:[]}],
};

test("the goal stays active while all completed tasks wait for the final report phase", () => {
  const activity = goalActivity(completed);
  assert.equal(activity.phase, "finalizing");
  assert.equal(activity.label, "整理报告中");
});

test("finished or failed runs never animate even when graph version is unchanged", () => {
  const finished = {...completed,running:false};
  assert.equal(goalActivity(finished), null);
  assert.notEqual(liveKey(completed), liveKey(finished));
  assert.equal(finished.version, completed.version);
});

test("unfinished or still active children do not trigger report finalization", () => {
  for(const status of ["open","in_progress"]){
    const source = {...completed,nodes:[completed.nodes[0],{id:"t1",status,live:[]}]};
    assert.equal(goalActivity(source), null);
    assert.notEqual(liveKey(completed), liveKey(source));
  }
  const active = {...completed,nodes:[completed.nodes[0],{id:"t1",status:"resolved",live:[{label:"【检查】报告"}]}]};
  assert.equal(goalActivity(active), null);
});

test("cancelled tasks use a neutral summary label and startup retains planning", () => {
  const cancelled = {...completed,nodes:[completed.nodes[0],{id:"t1",status:"cancelled",live:[]}]};
  assert.equal(goalActivity(cancelled).label, "汇总结果中");
  assert.equal(goalActivity({...completed,nodes:[completed.nodes[0]]}).phase, "planning");
  assert.equal(goalActivity({...completed,running:undefined}), null);
  assert.equal(goalActivity({...completed,ok:false}), null);
});
