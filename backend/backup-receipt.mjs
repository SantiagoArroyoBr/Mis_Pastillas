const prefix='acompana-backup-receipt-v1:';
export function backupReceiptKey(scope){return prefix+JSON.stringify(scope);}
export function readBackupReceipt(storage,scope,now=Date.now()){
 try{const value=JSON.parse(storage?.getItem(backupReceiptKey(scope))??'null');
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=now?value:null;
 }catch{return null;}
}
export function saveBackupReceipt(storage,scope,now=Date.now()){
 try{storage.setItem(backupReceiptKey(scope),JSON.stringify(now));return readBackupReceipt(storage,scope,now)===now;}catch{return false;}
}
