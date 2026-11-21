import {test} from 'node:test';import assert from 'node:assert/strict';
import {readBackupReceipt,saveBackupReceipt,backupReceiptKey} from '../backup-receipt.mjs';
test('download receipt isolates API, user and family and never claims a future or malformed download',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},scope=['api','user','family'];
 assert.equal(saveBackupReceipt(storage,scope,1000),true);assert.equal(readBackupReceipt(storage,scope,1001),1000);
 for(const other of [['other','user','family'],['api','other','family'],['api','user','other']])assert.equal(readBackupReceipt(storage,other,1001),null);
 values.set(backupReceiptKey(scope),'9000');assert.equal(readBackupReceipt(storage,scope,1001),null);
 values.set(backupReceiptKey(scope),'{');assert.equal(readBackupReceipt(storage,scope,1001),null);
});
test('storage denial never reports a recorded download',()=>{assert.equal(saveBackupReceipt({setItem(){throw Error();}},['x']),false);});
