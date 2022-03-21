/**
 * Checks that setClusterParameter command only run once
 *
 * @tags: [
 *   # Requires all nodes to be running the latest binary.
 *   requires_fcv_60,
 *   featureFlagClusterWideConfig,
 *   does_not_support_stepdowns
 *  ]
 */
(function() {
'use strict';

load('jstests/libs/fail_point_util.js');

const st = new ShardingTest({shards: 1});

let fp =
    configureFailPoint(st.configRS.getPrimary(), 'hangBeforeRunningConfigsvrCoordinatorInstance');

let setClusterParameterSuccessThread = new Thread((mongosConnString) => {
    let mongos = new Mongo(mongosConnString);
    assert.commandWorked(mongos.adminCommand({setClusterParameter: {param: true}}));
}, st.s.host);

setClusterParameterSuccessThread.start();
fp.wait();

jsTestLog(
    'Check that 2 requests for the same cluster parameter and same value generates only one coordinator.');

let setClusterParameterJoinSuccessThread = new Thread((mongosConnString) => {
    let mongos = new Mongo(mongosConnString);
    assert.commandWorked(mongos.adminCommand({setClusterParameter: {param: true}}));
}, st.s.host);

setClusterParameterJoinSuccessThread.start();

let currOp =
    st.configRS.getPrimary()
        .getDB('admin')
        .aggregate(
            [{$currentOp: {allUsers: true}}, {$match: {desc: 'SetClusterParameterCoordinator'}}])
        .toArray();
assert.eq(1, currOp.length);
assert(currOp[0].hasOwnProperty('command'));
assert(currOp[0].command.hasOwnProperty('param'));
assert.eq(true, currOp[0].command.param);

jsTestLog('Check that a second request will fail with ConflictingOperationInProgress.');

assert.commandFailedWithCode(st.s.adminCommand({setClusterParameter: {otherParam: true}}),
                             ErrorCodes.ConflictingOperationInProgress);

fp.off();
setClusterParameterSuccessThread.join();
setClusterParameterJoinSuccessThread.join();

st.stop();
})();