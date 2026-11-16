 "use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, FolderKanban, ClipboardList, Users, FileText, CalendarDays, BarChart3, Settings, Plus, Search, LogOut, RefreshCw, Pencil, Trash2 } from "lucide-react";

type Profile = { id:string; full_name:string; position:string|null; role:string; is_active:boolean };
type Deliverable = { id:string; project_id:string; description:string; discipline:string; assigned_to:string|null; date_assigned:string|null; target_date:string|null; actual_submission_date:string|null; status:string; progress:number; remarks:string|null; created_at:string; updated_at:string };
type Project = {
 id:string; project_code:string; name:string; client:string|null; location:string|null;
 status:string; progress:number; priority:string; target_date:string|null; updated_at:string;
};
const disciplines = ["Architectural","Structural","Civil","Electrical","Mechanical","Plumbing","Fire Protection","Instrumentation & Controls","Costing","Other"];
const deliverableStatuses = ["Not Yet Started","Ongoing","For Internal Review","For Submission","For Client Review","For Revision","Completed","On Hold"];
const statuses = ["Not Yet Started","Ongoing","For Internal Design Review","For Submission to Client","For Client Review / Approval","For Revision / Incorporation of Comments","For AFC","Completed","On Hold","Cancelled"];
const nav = [{label:"Dashboard",icon:LayoutDashboard},{label:"Projects",icon:FolderKanban},{label:"Deliverables",icon:ClipboardList},{label:"Personnel",icon:Users},{label:"Documents",icon:FileText},{label:"Timeline",icon:CalendarDays},{label:"Reports",icon:BarChart3},{label:"Administration",icon:Settings}];

export default function Home() {
 const [session,setSession] = useState<any>(null);
 const [projects,setProjects] = useState<Project[]>([]);
 const [deliverables,setDeliverables] = useState<Deliverable[]>([]);
 const [profiles,setProfiles] = useState<Profile[]>([]);
 const [selectedProject,setSelectedProject] = useState("");
 const [showDeliverableForm,setShowDeliverableForm] = useState(false);
 const [editingDeliverable,setEditingDeliverable] = useState<string|null>(null);
 const [deliverableForm,setDeliverableForm] = useState({project_id:"",description:"",discipline:"Structural",assigned_to:"",date_assigned:new Date().toISOString().slice(0,10),target_date:"",actual_submission_date:"",status:"Not Yet Started",progress:0,remarks:""});
 const [section,setSection] = useState("Dashboard");
 const [loading,setLoading] = useState(true);
 const [query,setQuery] = useState("");
 const [showForm,setShowForm] = useState(false);
 const [error,setError] = useState("");
 const [form,setForm] = useState({project_code:"",name:"",client:"",location:"",status:"Not Yet Started",priority:"Medium",target_date:""});
 const [email,setEmail] = useState(""); const [password,setPassword] = useState("");
 const [authMode,setAuthMode] = useState<"signin"|"signup">("signin");

 async function loadProjects() {
   const {data,error} = await supabase.from("projects").select("*").is("archived_at",null).order("updated_at",{ascending:false});
   if(error) setError(error.message); else setProjects((data||[]) as Project[]);
   setLoading(false);
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>setSession(data.session));
   const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
   return ()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(session) { loadProjects(); loadProfiles(); loadDeliverables(); }},[session]);
 useEffect(()=>{
   if(!session) return;
   const channel=supabase.channel("pmis-live").on("postgres_changes",{event:"*",schema:"public",table:"projects"},()=>loadProjects()).on("postgres_changes",{event:"*",schema:"public",table:"deliverables"},()=>loadDeliverables()).subscribe();
   return ()=>{supabase.removeChannel(channel);};
 },[session]);

 async function loadProfiles() {
   const {data,error}=await supabase.from("profiles").select("id,full_name,position,role,is_active").eq("is_active",true).order("full_name");
   if(error) setError(error.message); else setProfiles((data||[]) as Profile[]);
 }
 async function loadDeliverables() {
   const {data,error}=await supabase.from("deliverables").select("*").order("target_date",{ascending:true});
   if(error) setError(error.message); else setDeliverables((data||[]) as Deliverable[]);
 }
 function openNewDeliverable() {
   const pid=selectedProject || projects[0]?.id || "";
   setEditingDeliverable(null); setDeliverableForm({project_id:pid,description:"",discipline:"Structural",assigned_to:"",date_assigned:new Date().toISOString().slice(0,10),target_date:"",actual_submission_date:"",status:"Not Yet Started",progress:0,remarks:""}); setShowDeliverableForm(true);
 }
 function openEditDeliverable(d:Deliverable) {
   setEditingDeliverable(d.id); setDeliverableForm({project_id:d.project_id,description:d.description,discipline:d.discipline,assigned_to:d.assigned_to||"",date_assigned:d.date_assigned||"",target_date:d.target_date||"",actual_submission_date:d.actual_submission_date||"",status:d.status,progress:d.progress||0,remarks:d.remarks||""}); setShowDeliverableForm(true);
 }
 async function saveDeliverable(e:React.FormEvent) {
   e.preventDefault(); setError("");
   const payload={...deliverableForm,assigned_to:deliverableForm.assigned_to||null,date_assigned:deliverableForm.date_assigned||null,target_date:deliverableForm.target_date||null,actual_submission_date:deliverableForm.actual_submission_date||null,progress:deliverableForm.status==="Completed"?100:Number(deliverableForm.progress)};
   const result=editingDeliverable ? await supabase.from("deliverables").update(payload).eq("id",editingDeliverable) : await supabase.from("deliverables").insert(payload);
   if(result.error) setError(result.error.message); else {setShowDeliverableForm(false); await Promise.all([loadDeliverables(),loadProjects()]);}
 }
 async function deleteDeliverable(id:string) {
   if(!window.confirm("Delete this deliverable? Project progress will be recalculated.")) return;
   const {error}=await supabase.from("deliverables").delete().eq("id",id);
   if(error) setError(error.message); else {await Promise.all([loadDeliverables(),loadProjects()]);}
 }
 async function authenticate(e:React.FormEvent) {
   e.preventDefault(); setError("");
   const result=authMode==="signin"
     ? await supabase.auth.signInWithPassword({email,password})
     : await supabase.auth.signUp({email,password});
   if(result.error) setError(result.error.message);
   else if(authMode==="signup") setError("Account created. Ask an administrator to assign your role before accessing project records.");
 }
 async function addProject(e:React.FormEvent) {
   e.preventDefault(); setError("");
   const {error}=await supabase.from("projects").insert({...form,progress:0});
   if(error) setError(error.message); else {setShowForm(false);setForm({project_code:"",name:"",client:"",location:"",status:"Not Yet Started",priority:"Medium",target_date:""});loadProjects();}
 }
 const filtered=useMemo(()=>projects.filter(p=>[p.project_code,p.name,p.client||"",p.location||"",p.status].join(" ").toLowerCase().includes(query.toLowerCase())),[projects,query]);
 const count=(s:string)=>projects.filter(p=>p.status===s).length;
 const delayed=projects.filter(p=>p.target_date && new Date(p.target_date)<new Date(new Date().toDateString()) && p.status!=="Completed" && p.status!=="Cancelled").length;
 if(!session) return <main className="auth"><form className="login card" onSubmit={authenticate}><div className="brandmark">EP</div><p className="eyebrow">ENGINEERING & DESIGN DEPARTMENT</p><h1>Engineering PMIS</h1><p className="muted">Sign in to your project control center.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button className="primary full">{authMode==="signin"?"Sign in":"Create account"}</button><button type="button" className="link" onClick={()=>setAuthMode(authMode==="signin"?"signup":"signin")}>{authMode==="signin"?"Need an account? Register":"Back to sign in"}</button></form></main>;

 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brandmark">EP</div><div><b>Engineering PMIS</b><small>PROJECT CONTROL</small></div></div><div className="navtitle">WORKSPACE</div>{nav.map(n=><button key={n.label} className={"navitem "+(section===n.label?"active":"")} onClick={()=>setSection(n.label)}><n.icon size={18}/>{n.label}</button>)}<div className="sidebottom"><small>{session.user.email}</small><button className="navitem" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/>Sign out</button></div></aside>
 <main className="main"><header className="topbar"><div><p className="eyebrow">ENGINEERING DEPARTMENT / {section.toUpperCase()}</p><h1>{section==="Dashboard"?"Project Control Center":section}</h1></div><div className="topactions"><button className="iconbtn" onClick={loadProjects} title="Refresh"><RefreshCw size={17}/></button><span className="userpill">{session.user.email?.slice(0,1).toUpperCase()}</span></div></header>
 {section==="Dashboard"||section==="Projects"? <><div className="welcome"><div><h2>Project overview</h2><p className="muted">Monitor engineering projects, submissions, and deliverables in one place.</p></div><button className="primary" onClick={()=>setShowForm(true)}><Plus size={17}/> New project</button></div>
 <div className="stats"><Stat title="Total projects" value={projects.length}/><Stat title="Ongoing" value={count("Ongoing")}/><Stat title="Completed" value={count("Completed")}/><Stat title="On hold" value={count("On Hold")}/><Stat title="Delayed" value={delayed} danger/><Stat title="For client review" value={count("For Client Review / Approval")}/><Stat title="For AFC" value={count("For AFC")}/><Stat title="Upcoming deadlines" value={projects.filter(p=>p.target_date && new Date(p.target_date)>=new Date() && new Date(p.target_date)<=new Date(Date.now()+14*86400000) && p.status!=="Completed").length}/></div>
 <div className="contentgrid"><section className="card"><div className="cardhead"><div><h3>Project status</h3><p className="muted">Current distribution</p></div></div>{statuses.filter(s=>count(s)>0).length===0?<Empty text="No project records yet."/>:statuses.filter(s=>count(s)>0).map(s=><div className="statusrow" key={s}><span>{s}</span><b>{count(s)}</b><div className="bar"><i style={{width:`${projects.length?count(s)/projects.length*100:0}%`}}/></div></div>)}</section><section className="card"><div className="cardhead"><div><h3>Project progress</h3><p className="muted">Average completion</p></div></div><div className="bigmetric">{projects.length?Math.round(projects.reduce((a,p)=>a+(p.progress||0),0)/projects.length):0}<small>%</small></div><p className="muted">Across active project records</p><div className="mini-list">{projects.slice(0,5).map(p=><div key={p.id}><span>{p.name}</span><b>{p.progress||0}%</b></div>)}</div></section></div>
 <section className="card tablecard"><div className="cardhead"><div><h3>Project masterlist</h3><p className="muted">{filtered.length} projects shown</p></div><div className="search"><Search size={16}/><input placeholder="Search projects..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Project ID</th><th>Project name</th><th>Client</th><th>Status</th><th>Progress</th><th>Target date</th><th>Priority</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td className="code">{p.project_code}</td><td><b>{p.name}</b><small>{p.location||"Location not set"}</small></td><td>{p.client||"—"}</td><td><span className={"status "+p.status.toLowerCase().replaceAll(/[^a-z]+/g,"-")}>{p.status}</span></td><td><div className="progresscell"><div className="bar"><i style={{width:`${p.progress||0}%`}}/></div>{p.progress||0}%</div></td><td>{p.target_date||"—"}</td><td>{p.priority}</td></tr>)}{!filtered.length&&<tr><td colSpan={7}><Empty text={loading?"Loading projects...":"No matching projects found."}/></td></tr>}</tbody></table></div></section></>:section==="Deliverables"?<><div className="welcome"><div><h2>Deliverables tracker</h2><p className="muted">Track discipline deliverables, assignments, deadlines and completion. Project progress is the equal-weighted average of its deliverables.</p></div><button className="primary" onClick={openNewDeliverable}><Plus size={17}/> New deliverable</button></div><div className="stats"><Stat title="Total deliverables" value={deliverables.length}/><Stat title="Ongoing" value={deliverables.filter(d=>d.status==="Ongoing").length}/><Stat title="Completed" value={deliverables.filter(d=>d.status==="Completed").length}/><Stat title="Overdue" value={deliverables.filter(d=>d.target_date && d.target_date<new Date().toISOString().slice(0,10) && d.status!=="Completed" && d.status!=="On Hold").length} danger/></div><section className="card tablecard"><div className="cardhead"><div><h3>Project deliverables</h3><p className="muted">{deliverables.filter(d=>!selectedProject||d.project_id===selectedProject).length} deliverables shown</p></div><select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></div><div className="tablewrap"><table><thead><tr><th>Project</th><th>Deliverable</th><th>Discipline</th><th>Assigned to</th><th>Target date</th><th>Status</th><th>Progress</th><th>Actions</th></tr></thead><tbody>{deliverables.filter(d=>!selectedProject||d.project_id===selectedProject).map(d=>{const p=projects.find(x=>x.id===d.project_id);const person=profiles.find(x=>x.id===d.assigned_to);const overdue=!!d.target_date&&d.target_date<new Date().toISOString().slice(0,10)&&d.status!=="Completed"&&d.status!=="On Hold";return <tr key={d.id}><td className="code">{p?.project_code||"—"}</td><td><b>{d.description}</b><small>{d.remarks||""}</small></td><td>{d.discipline}</td><td>{person?.full_name||"Unassigned"}</td><td className={overdue?"danger":""}>{d.target_date||"—"}{overdue?<small className="danger">Overdue</small>:null}</td><td><span className={"status "+(d.status==="Completed"?"completed":"")}>{d.status}</span></td><td><div className="progresscell"><div className="bar"><i style={{width:`${d.progress||0}%`}}/></div>{d.progress||0}%</div></td><td><button className="iconbtn" title="Edit" onClick={()=>openEditDeliverable(d)}><Pencil size={14}/></button> <button className="iconbtn" title="Delete" onClick={()=>deleteDeliverable(d.id)}><Trash2 size={14}/></button></td></tr>})}{!deliverables.filter(d=>!selectedProject||d.project_id===selectedProject).length&&<tr><td colSpan={8}><Empty text="No deliverables yet. Add the first deliverable for a project."/></td></tr>}</tbody></table></div></section><section className="card tablecard"><div className="cardhead"><div><h3>Project progress summary</h3><p className="muted">Automatically calculated from deliverables using equal weighting.</p></div></div>{projects.map(p=>{const ds=deliverables.filter(d=>d.project_id===p.id);return <div className="statusrow" key={p.id}><span>{p.project_code} · {p.name} ({ds.length} deliverables)</span><b>{p.progress||0}%</b><div className="bar"><i style={{width:`${p.progress||0}%`}}/></div></div>})}</section></>:<section className="card placeholder"><h2>{section}</h2><p className="muted">This module is included in the system architecture and will be enabled as its workflow is configured. Project masterlist and Deliverables tracker are available now.</p></section>}
 {error&&<p className="error toast">{error}</p>}
 {showDeliverableForm&&<div className="overlay"><form className="modal card" onSubmit={saveDeliverable}><div className="cardhead"><h2>{editingDeliverable?"Edit deliverable":"New deliverable"}</h2><button type="button" className="link" onClick={()=>setShowDeliverableForm(false)}>Close</button></div><div className="formgrid"><label>Project<select required value={deliverableForm.project_id} onChange={e=>setDeliverableForm({...deliverableForm,project_id:e.target.value})}><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></label><label>Discipline<select value={deliverableForm.discipline} onChange={e=>setDeliverableForm({...deliverableForm,discipline:e.target.value})}>{disciplines.map(d=><option key={d}>{d}</option>)}</select></label><label className="wide">Task / deliverable description<input required value={deliverableForm.description} onChange={e=>setDeliverableForm({...deliverableForm,description:e.target.value})} placeholder="e.g. Structural Plans and Calculations"/></label><label>Assigned personnel<select value={deliverableForm.assigned_to} onChange={e=>setDeliverableForm({...deliverableForm,assigned_to:e.target.value})}><option value="">Unassigned</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name||p.id} · {p.role}</option>)}</select></label><label>Date assigned<input type="date" value={deliverableForm.date_assigned} onChange={e=>setDeliverableForm({...deliverableForm,date_assigned:e.target.value})}/></label><label>Target submission date<input type="date" value={deliverableForm.target_date} onChange={e=>setDeliverableForm({...deliverableForm,target_date:e.target.value})}/></label><label>Actual submission date<input type="date" value={deliverableForm.actual_submission_date} onChange={e=>setDeliverableForm({...deliverableForm,actual_submission_date:e.target.value})}/></label><label>Status<select value={deliverableForm.status} onChange={e=>setDeliverableForm({...deliverableForm,status:e.target.value,progress:e.target.value==="Completed"?100:deliverableForm.progress})}>{deliverableStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Completion (%)<input type="number" min="0" max="100" value={deliverableForm.progress} disabled={deliverableForm.status==="Completed"} onChange={e=>setDeliverableForm({...deliverableForm,progress:Number(e.target.value)})}/></label><label className="wide">Remarks<textarea rows={3} value={deliverableForm.remarks} onChange={e=>setDeliverableForm({...deliverableForm,remarks:e.target.value})}/></label></div><p className="muted">Project progress is recalculated automatically as the arithmetic average of all deliverable percentages. Completed deliverables are set to 100%.</p>{error&&<p className="error">{error}</p>}<button className="primary full">{editingDeliverable?"Save changes":"Save deliverable"}</button></form></div>}
 {showForm&&<div className="overlay"><form className="modal card" onSubmit={addProject}><div className="cardhead"><h2>New project</h2><button type="button" className="link" onClick={()=>setShowForm(false)}>Close</button></div><div className="formgrid"><label>Project ID<input required value={form.project_code} onChange={e=>setForm({...form,project_code:e.target.value})}/></label><label>Project name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Client<input value={form.client} onChange={e=>setForm({...form,client:e.target.value})}/></label><label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select></label><label>Target completion<input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/></label></div>{error&&<p className="error">{error}</p>}<button className="primary full">Save project</button></form></div>}
 </main></div>;
}
function Stat({title,value,danger=false}:{title:string,value:number,danger?:boolean}){return <div className="stat card"><span>{title}</span><b className={danger?"danger":""}>{value}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}