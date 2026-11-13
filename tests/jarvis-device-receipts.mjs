import assert from "node:assert/strict";
import {interpretDeviceReceipt,createPendingCommandTracker} from "../modules/device-command-receipts.js";
import {cancelQueuedControlCommand} from "../backend/device-control-v2.js";

for(const status of ["pending","claimed"]) {
  const result=interpretDeviceReceipt({status});
  assert.equal(result.ok,false);
  assert.equal(result.verified,false);
  assert.equal(result.submitted,true);
  assert.equal(result.commandStatus,status);
}
assert.deepEqual(interpretDeviceReceipt({status:"completed"}),{
  ok:true,verified:true,submitted:false,commandStatus:"completed"
});
for(const status of ["failed","expired","cancelled"]) {
  const result=interpretDeviceReceipt({status});
  assert.equal(result.ok,false);
  assert.equal(result.submitted,false);
  assert.equal(result.commandStatus,status);
}
const aborted=interpretDeviceReceipt({status:"claimed"},{aborted:true});
assert.equal(aborted.cancelled,true);
assert.equal(aborted.ok,false);
assert.equal(aborted.commandStatus,"claimed","Cannot claim physical cancellation after claim");

let time=1000;
const tracker=createPendingCommandTracker({now:()=>time,max:2,ttlMs:300_000});
const ta="01234567-aaaa-4abc-9abc-0123456789ab";
const tb="01234567-bbbb-4abc-9abc-0123456789ab";
const tc="01234567-cccc-4abc-9abc-0123456789ab";
assert.equal(tracker.track("not-a-command"),false);
assert.equal(tracker.track(ta),true);
assert.equal(tracker.track(tb),true);
assert.equal(tracker.track(tc),true);
assert.deepEqual(tracker.list(),[tb,tc],"Bounded cache must evict oldest command");
tracker.settle(tb);
assert.deepEqual(tracker.drain(),[tc]);
assert.deepEqual(tracker.drain(),[],"Stop is idempotent");
tracker.track(ta);
time+=300_000;
assert.deepEqual(tracker.list(),[],"Old pending IDs expire without leaking memory");

const owner="user-a",other="user-b";
const a="01234567-aaaa-4abc-9abc-0123456789ab";
const b="01234567-bbbb-4abc-9abc-0123456789ab";
const c="01234567-cccc-4abc-9abc-0123456789ab";
const data=new Map([
  [a,{operator:owner,status:"pending"}],
  [b,{operator:owner,status:"claimed"}],
  [c,{operator:owner,status:"completed"}]
]);
const seen=[];
const env={ULTRON_DB:{prepare(sql){
  seen.push(sql);
  return {bind(...values){
    return {
      async run(){
        if(/UPDATE device_commands/.test(sql)){
          const [id,operator]=values;
          const row=data.get(id);
          if(row && row.operator===operator && row.status==="pending"){
            row.status="cancelled";
            return {meta:{changes:1}};
          }
          return {meta:{changes:0}};
        }
        return {meta:{changes:0}};
      },
      async first(){
        if(/SELECT status FROM device_commands/.test(sql)){
          const [id,operator]=values, row=data.get(id);
          return row?.operator===operator?{status:row.status}:null;
        }
        return null;
      }
    };
  },async run(){return {meta:{changes:0}}}};
}}};
assert.equal((await cancelQueuedControlCommand(env,other,a)).ok,false,"Cannot cancel another user's command");
assert.equal(data.get(a).status,"pending");
const cancelled=await cancelQueuedControlCommand(env,owner,a);
assert.deepEqual(cancelled,{ok:true,status:"cancelled",cancelledBeforeDelivery:true});
assert.equal(data.get(a).status,"cancelled");
assert.equal((await cancelQueuedControlCommand(env,owner,a)).ok,true,"Idempotent cancellation");
const alreadyClaimed=await cancelQueuedControlCommand(env,owner,b);
assert.equal(alreadyClaimed.ok,false,"A claimed command is non-revocable");
assert.equal(alreadyClaimed.status,"claimed");
assert.equal(data.get(b).status,"claimed");
assert.equal((await cancelQueuedControlCommand(env,owner,c)).ok,false,"Completed action cannot be erased");
assert.equal((await cancelQueuedControlCommand(env,owner,"invalid")).ok,false);
assert.ok(seen.some(sql=>sql.includes("operator_id = ? AND status = 'pending'")),"Cancellation must be owner-scoped and pending-only");
console.log("Device execution receipts + scoped pending cancellation: OK");
