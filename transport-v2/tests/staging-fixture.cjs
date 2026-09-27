// Offline test constants and immutable Git sources. Never network.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..');
const reviewed='53c60bdb2e0bc89d49ab02fd2221725e76f38adf',base='b9ad9f57f435e6780d465f5480b71dc24354d991';
const blob=(ref,file)=>execFileSync('git',['show',ref+':'+file],{cwd:repo,maxBuffer:8*1024*1024});
const rollback=()=>blob('6f3921f2bbea6d175c8bcac3888b09e231f44774','transport-v2/worker/relay.mjs');
const payload={action:'employeeLifecycleBaselineMigrate',idToken:'PRIVATE_TOKEN',employeeId:'EMP001',requestId:'c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab',expectedSnapshotVersion:'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd',reason:'建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。',confirmed:true};
const identity={success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'離線測試',permission:'ADMIN'}};
const preview={success:true,dryRun:true,employeeId:'EMP001',name:'離線測試',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2200,systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:true,warnings:['HIRE_DATE_UNKNOWN'],snapshotVersion:payload.expectedSnapshotVersion};
const success={success:true,employeeId:'EMP001',requestId:payload.requestId,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED'};
const status=(kind='COMPLETED')=>({success:true,employeeId:'EMP001',requestId:payload.requestId,action:payload.action,requestStatus:kind,historicalCompletion:kind==='COMPLETED'?true:kind==='UNKNOWN'||kind==='RECOVERY_REQUIRED'?null:false,currentConsistency:({COMPLETED:'MATCHED',STARTED:'PARTIAL',NOT_OBSERVED:'UNKNOWN',UNKNOWN:'UNKNOWN',RECOVERY_REQUIRED:'CONFLICT'})[kind],recoveryAllowed:false,newRequestAllowed:false});
const version='t4-safety-2-gas-read-diag',origin='https://baifu6276.github.io';
const env={GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:JSON.stringify([origin])};
const rng=seed=>()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
module.exports={repo,reviewed,base,blob,rollback,payload,identity,preview,success,status,version,origin,env,rng};
