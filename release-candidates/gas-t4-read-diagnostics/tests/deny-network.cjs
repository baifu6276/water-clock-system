// Test runner only: injected in-memory fetch mocks continue to work.
const deny=()=>{throw Error('OFFLINE_NETWORK_DENIED');};
globalThis.fetch=deny;
for(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny;}
for(const name of ['node:net','node:tls']){const m=require(name);m.connect=deny;m.createConnection=deny;}
require('node:dgram').createSocket=deny;
