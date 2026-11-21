// Horario civil del lugar del cuidado, independiente de la zona del teléfono.
export function careClock(date=new Date(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone){
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const value=key=>parts.find(p=>p.type===key).value;
 return value('year')+'-'+value('month')+'-'+value('day')+'T'+value('hour')+':'+value('minute');
}
