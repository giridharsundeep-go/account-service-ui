import type { ProjectWorkItem } from '../shared/project-work.service';

/** Snapshot indicators, not historical velocity or cycle-time estimates. */
export function deliveryIndicators(items: ProjectWorkItem[], done: (status:string)=>boolean, now=Date.now()) {
  const open=items.filter(item=>!done(item.status));
  const age=(value:unknown)=>{const date=Date.parse(String(value??''));return Number.isFinite(date)&&date<=now?(now-date)/86400000:null;};
  const ages=open.map(item=>age(item.raw.created_at??item.raw.createdAt)).filter((value):value is number=>value!==null).sort((a,b)=>a-b);
  const stale=open.filter(item=>{const days=age(item.raw.updated_at??item.raw.updatedAt??item.raw.created_at??item.raw.createdAt);return days!==null&&days>=14;});
  const overdue=open.filter(item=>{const due=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(item.due)?item.due+'T23:59:59.999':item.due);return Number.isFinite(due)&&due<now;});
  const storyParents=new Set(items.filter(item=>item.kind==='TASK').map(item=>Number(item.raw.story_id??item.raw.storyId??item.raw.story?.id)));
  const estimatable=open.filter(item=>item.kind==='TASK'||(item.kind==='STORY'&&!storyParents.has(item.id)));
  const estimated=estimatable.filter(item=>item.points>0);
  const assigned=open.filter(item=>item.assigneeId!==null&&item.assigneeId!==0);
  const agents=assigned.filter(item=>Number(item.assigneeId)<0||String(item.raw.assigneeType??item.raw.assignee_type??'').toUpperCase()==='AGENT');
  const highRisk=open.filter(item=>['HIGH','CRITICAL','HIGHEST'].includes(String(item.raw.priority??'').toUpperCase()));
  const percentage=(n:number)=>open.length?Math.round(100*n/open.length):null;
  return {open:open.length,overdue:overdue.length,stale:stale.length,estimated:estimated.length,estimateCoverage:estimatable.length?Math.round(100*estimated.length/estimatable.length):null,assignmentCoverage:percentage(assigned.length),agentOwned:agents.length,humanOwned:assigned.length-agents.length,unassigned:open.length-assigned.length,backlog:open.filter(item=>!item.sprintId||String(item.status).toUpperCase()==='BACKLOG').length,highPriority:highRisk.length,openPoints:estimated.reduce((sum,item)=>sum+item.points,0),medianOpenAge:ages.length?Math.round(ages.length%2?ages[Math.floor(ages.length/2)]:(ages[ages.length/2-1]+ages[ages.length/2])/2):null,datedOpen:ages.length};
}
