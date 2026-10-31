// Utilidades puras compartidas por la aplicación.
(function(){
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function parseTimes(txt){
  const out=[];
  for(const t of txt.split(/[,;]+/)){
    const m=t.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
    if(!m)return null;
    const h=+m[1],mi=+(m[2]||0);
    if(h>23||mi>59)return null;
    out.push(String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0'));
  }
  return [...new Set(out)].sort();
}

const pos=v=>{const n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:NaN};
const num=n=>String(n).replace('.',',');
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);

window.AcompanaUtils=Object.freeze({esc,parseTimes,pos,num,money});
})();
