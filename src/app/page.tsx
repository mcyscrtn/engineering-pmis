"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, FolderKanban, ClipboardList, Users, FileText, CalendarDays,
  BarChart3, Settings, Plus, Search, LogOut, RefreshCw, Pencil, Trash2,
  Activity as ActivityIcon, History, UsersRound, RotateCcw, Eye, UserPlus, UserCheck, UserX
} from "lucide-react";

type Profile = { id:string; full_name:string; position:string|null; role:string; is_active:boolean };
type Deliverable = {
  id:string; project_id:string; description:string; discipline:string;
  assigned_to:string|null; date_assigned:string|null; target_date:string|null;
  actual_submission_date:string|null; status:string; progress:number;
  remarks:string|null; created_at:string; updated_at:string
};
type Project = {
  id:string; project_code:string; name:string; client:string|null; location:string|null;
  status:string; progress:number; priority:string; target_date:string|null; updated_at:string;
};
type ActivityRecord = {
  id:string; project_id:string; user_id:string|null; previous_status:string|null;
  new_status:string|null; previous_progress:number|null; new_progress:number|null;
  remarks:string|null; created_at:string; activity_type:string|null; entity_type:string|null;
  entity_id:string|null; description:string|null; metadata:Record<string,unknown>|null
};
type Revision = {
  id:string; project_id:string; deliverable_id:string; revision_number:number;
  revision_reason:string; revision_remarks:string|null; snapshot:Record<string,unknown>;
  created_by:string|null; created_at:string
};
type ProjectMember = { project_id:string; user_id:string; assignment_type:string };

const disciplines = ["Architectural","Structural","Civil","Electrical","Mechanical","Plumbing","Fire Protection","Instrumentation & Controls","Costing","Other"];
const deliverableStatuses = ["Not Yet Started","Ongoing","For Internal Review","For Submission","For Client Review","For Revision","Completed","On Hold"];
const statuses = ["Not Yet Started","Ongoing","For Internal Design Review","For Submission to Client","For Client Review / Approval","For Revision / Incorporation of Comments","For AFC","Completed","On Hold","Cancelled"];
const nav = [
  {label:"Dashboard",icon:LayoutDashboard},{label:"Projects",icon:FolderKanban},
  {label:"Deliverables",icon:ClipboardList},{label:"Activity",icon:ActivityIcon},
  {label:"Revisions",icon:History},{label:"Project Members",icon:UsersRound},
  {label:"Personnel",icon:Users},{label:"Documents",icon:FileText},
  {label:"Timeline",icon:CalendarDays},{label:"Reports",icon:BarChart3},
  {label:"Administration",icon:Settings}
];

export default function Home() {
 const [session,setSession] = useState<any>(null);
 const [projects,setProjects] = useState<Project[]>([]);
 const [deliverables,setDeliverables] = useState<Deliverable[]>([]);
 const [profiles,setProfiles] = useState<Profile[]>([]);
 const [activities,setActivities] = useState<ActivityRecord[]>([]);
 const [revisions,setRevisions] = useState<Revision[]>([]);
 const [members,setMembers] = useState<ProjectMember[]>([]);
 const [selectedProject,setSelectedProject] = useState("");
 const [showDeliverableForm,setShowDeliverableForm] = useState(false);
 const [editingDeliverable,setEditingDeliverable] = useState<string|null>(null);
 const [deliverableForm,setDeliverableForm] = useState({project_id:"",description:"",discipline:"Structural",assigned_to:"",date_assigned:new Date().toISOString().slice(0,10),target_date:"",actual_submission_date:"",status:"Not Yet Started",progress:0,remarks:""});
 const [section,setSection] = useState("Dashboard");
 const [loading,setLoading] = useState(true);
 const [query,setQuery] = useState("");
 const [showForm,setShowForm] = useState(false);
 const [error,setError] = useState("");
 const [notice,setNotice] = useState("");
 const [form,setForm] = useState({project_code:"",name:"",client:"",location:"",status:"Not Yet Started",priority:"Medium",target_date:""});
 const [email,setEmail] = useState(""); const [password,setPassword] = useState("");
 const [authMode,setAuthMode] = useState<"signin"|"signup">("signin");
 const [revisionDeliverable,setRevisionDeliverable] = useState("");
 const [revisionReason,setRevisionReason] = useState("");
 const [revisionRemarks,setRevisionRemarks] = useState("");
 const [savingRevision,setSavingRevision] = useState(false);
 const [memberProject,setMemberProject] = useState("");
 const [memberUser,setMemberUser] = useState("");
 const [memberType,setMemberType] = useState("Engineer");
 const [savingMember,setSavingMember] = useState(false);
 const [personnelQuery,setPersonnelQuery] = useState("");
 const [showPersonnelForm,setShowPersonnelForm] = useState(false);
 const [editingProfile,setEditingProfile] = useState<string|null>(null);
 const [savingPersonnel,setSavingPersonnel] = useState(false);
 const [personnelForm,setPersonnelForm] = useState({email:"",full_name:"",position:"",role:"engineer",is_active:true});

 const currentProfile = profiles.find(p=>p.id===session?.user?.id && p.is_active);
 const currentRole = currentProfile?.role || "";
 const isAdmin = currentRole==="admin";
 const canEdit = isAdmin || currentRole==="engineer";

 async function loadProjects() {
   const {data,error} = await supabase.from("projects").select("*").is("archived_at",null).order("updated_at",{ascending:false});
   if(error) setError(error.message); else setProjects((data||[]) as Project[]);
   setLoading(false);
 }
 async function loadProfiles() {
   const {data,error}=await supabase.from("profiles").select("id,full_name,position,role,is_active").order("full_name");
   if(error) setError(error.message); else setProfiles((data||[]) as Profile[]);
 }
 async function loadDeliverables() {
   const {data,error}=await supabase.from("deliverables").select("*").order("target_date",{ascending:true});
   if(error) setError(error.message); else setDeliverables((data||[]) as Deliverable[]);
 }
 async function loadActivities() {
   let request=supabase.from("project_activity").select("*").order("created_at",{ascending:false}).limit(300);
   if(selectedProject) request=request.eq("project_id",selectedProject);
   const {data,error}=await request;
   if(error) setError(error.message); else setActivities((data||[]) as ActivityRecord[]);
 }
 async function loadRevisions() {
   let request=supabase.from("deliverable_revisions").select("*").order("created_at",{ascending:false}).limit(300);
   if(selectedProject) request=request.eq("project_id",selectedProject);
   const {data,error}=await request;
   if(error) setError(error.message); else setRevisions((data||[]) as Revision[]);
 }
 async function loadMembers() {
   const {data,error}=await supabase.from("project_members").select("*");
   if(error) setError(error.message); else setMembers((data||[]) as ProjectMember[]);
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>setSession(data.session));
   const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
   return ()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{
   if(session) { loadProjects(); loadProfiles(); loadDeliverables(); loadActivities(); loadRevisions(); loadMembers(); }
 },[session]);
 useEffect(()=>{
   if(!session) return;
   const channel=supabase.channel("pmis-live")
     .on("postgres_changes",{event:"*",schema:"public",table:"projects"},()=>{loadProjects();loadActivities();})
     .on("postgres_changes",{event:"*",schema:"public",table:"deliverables"},()=>{loadDeliverables();loadProjects();loadActivities();})
     .on("postgres_changes",{event:"*",schema:"public",table:"project_activity"},()=>loadActivities())
     .on("postgres_changes",{event:"*",schema:"public",table:"deliverable_revisions"},()=>{loadRevisions();loadActivities();})
     .on("postgres_changes",{event:"*",schema:"public",table:"project_members"},()=>loadMembers())
     .subscribe();
   return ()=>{supabase.removeChannel(channel);};
 },[session,selectedProject]);
 useEffect(()=>{if(session){loadActivities();loadRevisions();loadMembers();}},[selectedProject,session]);

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
   if(result.error) setError(result.error.message); else {setShowDeliverableForm(false); await Promise.all([loadDeliverables(),loadProjects(),loadActivities()]);}
 }
 async function deleteDeliverable(id:string) {
   if(!window.confirm("Delete this deliverable? Project progress will be recalculated.")) return;
   const {error}=await supabase.from("deliverables").delete().eq("id",id);
   if(error) setError(error.message); else {await Promise.all([loadDeliverables(),loadProjects(),loadActivities()]);}
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
   if(error) setError(error.message); else {setShowForm(false);setForm({project_code:"",name:"",client:"",location:"",status:"Not Yet Started",priority:"Medium",target_date:""});loadProjects();loadActivities();}
 }
 async function createRevision(e:React.FormEvent) {
   e.preventDefault(); setError(""); setNotice(""); setSavingRevision(true);
   const {data,error}=await supabase.rpc("create_deliverable_revision",{
     p_deliverable_id:revisionDeliverable,
     p_revision_reason:revisionReason,
     p_revision_remarks:revisionRemarks.trim()||null
   });
   setSavingRevision(false);
   if(error){setError(error.message);return;}
   const created=Array.isArray(data)?data[0]:data;
   setNotice(`Revision Rev. ${String(created?.revision_number??0).padStart(2,"0")} created successfully.`);
   setRevisionReason("");setRevisionRemarks("");
   await Promise.all([loadRevisions(),loadActivities()]);
 }
 async function addProjectMember(e:React.FormEvent) {
   e.preventDefault();setError("");setNotice("");setSavingMember(true);
   const {error}=await supabase.from("project_members").insert({
     project_id:memberProject,user_id:memberUser,assignment_type:memberType
   });
   setSavingMember(false);
   if(error)setError(error.message);
   else {setNotice("Project member assigned successfully.");setMemberUser("");await loadMembers();}
 }
 async function removeProjectMember(m:ProjectMember) {
   if(!window.confirm("Remove this project assignment? The user's access to this project may be revoked."))return;
   const {error}=await supabase.from("project_members").delete().eq("project_id",m.project_id).eq("user_id",m.user_id).eq("assignment_type",m.assignment_type);
   if(error)setError(error.message);else await loadMembers();
 }
 function openNewPersonnel() {
   setEditingProfile(null);
   setPersonnelForm({email:"",full_name:"",position:"",role:"engineer",is_active:true});
   setShowPersonnelForm(true);
 }
 function openEditPersonnel(person:Profile) {
   setEditingProfile(person.id);
   setPersonnelForm({email:"",full_name:person.full_name,position:person.position||"",role:person.role,is_active:person.is_active});
   setShowPersonnelForm(true);
 }
 async function savePersonnel(e:React.FormEvent) {
   e.preventDefault(); setError(""); setNotice(""); setSavingPersonnel(true);
   if(editingProfile) {
     const {error}=await supabase.from("profiles").update({
       full_name:personnelForm.full_name.trim(),
       position:personnelForm.position.trim()||null,
       role:personnelForm.role,
       is_active:personnelForm.is_active
     }).eq("id",editingProfile);
     setSavingPersonnel(false);
     if(error){setError(error.message);return;}
     setNotice("Employee profile updated.");
   } else {
     const {data:{session:activeSession}}=await supabase.auth.getSession();
     const response=await fetch("/api/admin/invite-user",{
       method:"POST",
       headers:{"Content-Type":"application/json","Authorization":`Bearer ${activeSession?.access_token||""}`},
       body:JSON.stringify({
         email:personnelForm.email.trim(),
         full_name:personnelForm.full_name.trim(),
         position:personnelForm.position.trim(),
         role:personnelForm.role
       })
     });
     const result=await response.json().catch(()=>({error:"The invitation service returned an invalid response."}));
     setSavingPersonnel(false);
     if(!response.ok){setError(result.error||"Unable to invite employee.");return;}
     setNotice("Employee invitation sent. The employee must accept the email invitation to set up their account.");
   }
   setShowPersonnelForm(false);
   await loadProfiles();
 }
 async function togglePersonnelStatus(person:Profile) {
   const next=!person.is_active;
   const prompt=next?"Reactivate this employee account?":"Deactivate this employee account? They will lose PMIS access.";
   if(!window.confirm(prompt))return;
   const {error}=await supabase.from("profiles").update({is_active:next}).eq("id",person.id);
   if(error)setError(error.message);
   else {setNotice(next?"Employee account reactivated.":"Employee account deactivated.");await loadProfiles();}
 }
 const filteredPersonnel=profiles.filter(p=>[p.full_name,p.position||"",p.role,p.is_active?"active":"inactive"].join(" ").toLowerCase().includes(personnelQuery.toLowerCase()));
 const filtered=useMemo(()=>projects.filter(p=>[p.project_code,p.name,p.client||"",p.location||"",p.status].join(" ").toLowerCase().includes(query.toLowerCase())),[projects,query]);
 const count=(s:string)=>projects.filter(p=>p.status===s).length;
 const delayed=projects.filter(p=>p.target_date && new Date(p.target_date)<new Date(new Date().toDateString()) && p.status!=="Completed" && p.status!=="Cancelled").length;
 const projectName=(id:string)=>{const p=projects.find(x=>x.id===id);return p?`${p.project_code} · ${p.name}`:"Project";};
 const profileName=(id:string|null)=>id?(profiles.find(p=>p.id===id)?.full_name||"Former / unavailable user"):"System / unavailable user";
 const selectedDeliverables=deliverables.filter(d=>!selectedProject||d.project_id===selectedProject);
 const selectedActivities=activities.filter(a=>!selectedProject||a.project_id===selectedProject);
 const selectedRevisions=revisions.filter(r=>!selectedProject||r.project_id===selectedProject);
 const selectedMembers=members.filter(m=>!selectedProject||m.project_id===selectedProject);
 if(!session) return <main className="auth"><form className="login card" onSubmit={authenticate}><div className="brandmark">EP</div><p className="eyebrow">ENGINEERING & DESIGN DEPARTMENT</p><h1>Engineering PMIS</h1><p className="muted">Sign in to your project control center.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button className="primary full">{authMode==="signin"?"Sign in":"Create account"}</button><button type="button" className="link" onClick={()=>setAuthMode(authMode==="signin"?"signup":"signin")}>{authMode==="signin"?"Need an account? Register":"Back to sign in"}</button></form></main>;

 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brandmark">EP</div><div><b>Engineering PMIS</b><small>PROJECT CONTROL</small></div></div><div className="navtitle">WORKSPACE</div>{nav.map(n=><button key={n.label} className={"navitem "+(section===n.label?"active":"")} onClick={()=>setSection(n.label)}><n.icon size={18}/>{n.label}</button>)}<div className="sidebottom"><small>{session.user.email}</small><button className="navitem" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/>Sign out</button></div></aside>
 <main className="main"><header className="topbar"><div><p className="eyebrow">ENGINEERING DEPARTMENT / {section.toUpperCase()}</p><h1>{section==="Dashboard"?"Project Control Center":section}</h1></div><div className="topactions"><button className="iconbtn" onClick={()=>{loadProjects();loadDeliverables();loadActivities();loadRevisions();loadMembers();}} title="Refresh"><RefreshCw size={17}/></button><span className="userpill">{session.user.email?.slice(0,1).toUpperCase()}</span></div></header>
 {section==="Dashboard"||section==="Projects"? <><div className="welcome"><div><h2>Project overview</h2><p className="muted">Monitor engineering projects, submissions, and deliverables in one place.</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowForm(true)}><Plus size={17}/> New project</button>}</div>
 <div className="stats"><Stat title="Total projects" value={projects.length}/><Stat title="Ongoing" value={count("Ongoing")}/><Stat title="Completed" value={count("Completed")}/><Stat title="On hold" value={count("On Hold")}/><Stat title="Delayed" value={delayed} danger/><Stat title="For client review" value={count("For Client Review / Approval")}/><Stat title="For AFC" value={count("For AFC")}/><Stat title="Upcoming deadlines" value={projects.filter(p=>p.target_date && new Date(p.target_date)>=new Date() && new Date(p.target_date)<=new Date(Date.now()+14*86400000) && p.status!=="Completed").length}/></div>
 <div className="contentgrid"><section className="card"><div className="cardhead"><div><h3>Project status</h3><p className="muted">Current distribution</p></div></div>{statuses.filter(s=>count(s)>0).length===0?<Empty text="No project records yet."/>:statuses.filter(s=>count(s)>0).map(s=><div className="statusrow" key={s}><span>{s}</span><b>{count(s)}</b><div className="bar"><i style={{width:`${projects.length?count(s)/projects.length*100:0}%`}}/></div></div>)}</section><section className="card"><div className="cardhead"><div><h3>Project progress</h3><p className="muted">Average completion</p></div></div><div className="bigmetric">{projects.length?Math.round(projects.reduce((a,p)=>a+(p.progress||0),0)/projects.length):0}<small>%</small></div><p className="muted">Across active project records</p><div className="mini-list">{projects.slice(0,5).map(p=><div key={p.id}><span>{p.name}</span><b>{p.progress||0}%</b></div>)}</div></section></div>
 <section className="card tablecard"><div className="cardhead"><div><h3>Project masterlist</h3><p className="muted">{filtered.length} projects shown</p></div><div className="search"><Search size={16}/><input placeholder="Search projects..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Project ID</th><th>Project name</th><th>Client</th><th>Status</th><th>Progress</th><th>Target date</th><th>Priority</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td className="code">{p.project_code}</td><td><b>{p.name}</b><small>{p.location||"Location not set"}</small></td><td>{p.client||"—"}</td><td><span className={"status "+p.status.toLowerCase().replaceAll(/[^a-z]+/g,"-")}>{p.status}</span></td><td><div className="progresscell"><div className="bar"><i style={{width:`${p.progress||0}%`}}/></div>{p.progress||0}%</div></td><td>{p.target_date||"—"}</td><td>{p.priority}</td></tr>)}{!filtered.length&&<tr><td colSpan={7}><Empty text={loading?"Loading projects...":"No matching projects found."}/></td></tr>}</tbody></table></div></section></>:section==="Deliverables"?<><div className="welcome"><div><h2>Deliverables tracker</h2><p className="muted">Track discipline deliverables, assignments, deadlines and completion. Project progress is the equal-weighted average of its deliverables.</p></div>{canEdit&&<button className="primary" onClick={openNewDeliverable}><Plus size={17}/> New deliverable</button>}</div><div className="stats"><Stat title="Total deliverables" value={deliverables.length}/><Stat title="Ongoing" value={deliverables.filter(d=>d.status==="Ongoing").length}/><Stat title="Completed" value={deliverables.filter(d=>d.status==="Completed").length}/><Stat title="Overdue" value={deliverables.filter(d=>d.target_date && d.target_date<new Date().toISOString().slice(0,10) && d.status!=="Completed" && d.status!=="On Hold").length} danger/></div><section className="card tablecard"><div className="cardhead"><div><h3>Project deliverables</h3><p className="muted">{selectedDeliverables.length} deliverables shown</p></div><select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></div><div className="tablewrap"><table><thead><tr><th>Project</th><th>Deliverable</th><th>Discipline</th><th>Assigned to</th><th>Target date</th><th>Status</th><th>Progress</th><th>Actions</th></tr></thead><tbody>{selectedDeliverables.map(d=>{const p=projects.find(x=>x.id===d.project_id);const person=profiles.find(x=>x.id===d.assigned_to);const overdue=!!d.target_date&&d.target_date<new Date().toISOString().slice(0,10)&&d.status!=="Completed"&&d.status!=="On Hold";return <tr key={d.id}><td className="code">{p?.project_code||"—"}</td><td><b>{d.description}</b><small>{d.remarks||""}</small></td><td>{d.discipline}</td><td>{person?.full_name||"Unassigned"}</td><td className={overdue?"danger":""}>{d.target_date||"—"}{overdue?<small className="danger">Overdue</small>:null}</td><td><span className={"status "+(d.status==="Completed"?"completed":"")}>{d.status}</span></td><td><div className="progresscell"><div className="bar"><i style={{width:`${d.progress||0}%`}}/></div>{d.progress||0}%</div></td><td>{canEdit&&<><button className="iconbtn" title="Edit" onClick={()=>openEditDeliverable(d)}><Pencil size={14}/></button> <button className="iconbtn" title="Delete" onClick={()=>deleteDeliverable(d.id)}><Trash2 size={14}/></button></>}</td></tr>})}{!selectedDeliverables.length&&<tr><td colSpan={8}><Empty text="No deliverables yet. Add the first deliverable for a project."/></td></tr>}</tbody></table></div></section><section className="card tablecard"><div className="cardhead"><div><h3>Project progress summary</h3><p className="muted">Automatically calculated from deliverables using equal weighting.</p></div></div>{projects.map(p=>{const ds=deliverables.filter(d=>d.project_id===p.id);return <div className="statusrow" key={p.id}><span>{p.project_code} · {p.name} ({ds.length} deliverables)</span><b>{p.progress||0}%</b><div className="bar"><i style={{width:`${p.progress||0}%`}}/></div></div>})}</section></>:
 section==="Activity"?<><div className="welcome"><div><h2>Project activity timeline</h2><p className="muted">Automatically recorded project and deliverable changes.</p></div><select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">All accessible projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></div><section className="card tablecard"><div className="cardhead"><div><h3>Activity history</h3><p className="muted">{selectedActivities.length} records · newest first</p></div><button className="iconbtn" onClick={loadActivities}><RefreshCw size={15}/> Refresh</button></div>{selectedActivities.length? <div className="timeline">{selectedActivities.map(a=><article className="timelineitem" key={a.id}><div className="timelineicon"><ActivityIcon size={16}/></div><div className="timelinebody"><div className="timelineheading"><b>{a.description||activityLabel(a.activity_type)}</b><span>{new Date(a.created_at).toLocaleString()}</span></div><p>{projectName(a.project_id)} · {profileName(a.user_id)}</p>{a.previous_status!==null||a.new_status!==null?<p className="timelinechange">Status: {a.previous_status||"—"} → {a.new_status||"—"}</p>:null}{a.previous_progress!==null||a.new_progress!==null?<p className="timelinechange">Progress: {a.previous_progress??"—"}% → {a.new_progress??"—"}%</p>:null}{a.remarks&&<p className="timelinechange">Remarks: {a.remarks}</p>}{a.metadata&&<details><summary>View change details</summary><pre>{JSON.stringify(a.metadata,null,2)}</pre></details>}</div></article>)}</div>:<Empty text="No activity records found for the selected project."/ >}</section></>:
 section==="Revisions"?<><div className="welcome"><div><h2>Deliverable revision history</h2><p className="muted">Create formal revisions with automatically generated numbers and saved deliverable snapshots.</p></div><select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">All accessible projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></div>{canEdit&&<section className="card tablecard"><div className="cardhead"><div><h3><RotateCcw size={17}/> Create formal revision</h3><p className="muted">The first revision is Rev. 00. Each subsequent revision increments automatically.</p></div></div><form onSubmit={createRevision}><div className="formgrid"><label>Deliverable<select required value={revisionDeliverable} onChange={e=>setRevisionDeliverable(e.target.value)}><option value="">Select deliverable</option>{selectedDeliverables.map(d=><option key={d.id} value={d.id}>{projectName(d.project_id)} · {d.description}</option>)}</select></label><label>Revision reason<input required value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} placeholder="e.g. Incorporated client comments"/></label><label className="wide">Revision remarks<textarea rows={3} value={revisionRemarks} onChange={e=>setRevisionRemarks(e.target.value)} placeholder="Describe the changes included in this revision."/></label></div><button className="primary" disabled={savingRevision||!revisionDeliverable||!revisionReason.trim()}>{savingRevision?"Creating revision…":"Create revision"}</button></form></section>}<section className="card tablecard"><div className="cardhead"><div><h3>Revision register</h3><p className="muted">{selectedRevisions.length} formal revisions</p></div></div>{selectedRevisions.length?<div className="tablewrap"><table><thead><tr><th>Revision</th><th>Project</th><th>Deliverable</th><th>Reason</th><th>Created by</th><th>Date created</th><th>Snapshot</th></tr></thead><tbody>{selectedRevisions.map(r=>{const d=deliverables.find(x=>x.id===r.deliverable_id);return <tr key={r.id}><td><b className="code">Rev. {String(r.revision_number).padStart(2,"0")}</b></td><td>{projectName(r.project_id)}</td><td>{d?.description||String(r.snapshot?.description||"Deleted deliverable")}</td><td>{r.revision_reason}<small>{r.revision_remarks||""}</small></td><td>{profileName(r.created_by)}</td><td>{new Date(r.created_at).toLocaleString()}</td><td><details><summary><Eye size={14}/> View</summary><pre>{JSON.stringify(r.snapshot,null,2)}</pre></details></td></tr>})}</tbody></table></div>:<Empty text="No formal revisions have been created yet."/ >}</section></>:
 section==="Project Members"?<><div className="welcome"><div><h2>Project membership and access</h2><p className="muted">Assign Engineers and Management Viewers to individual projects. Viewers receive read-only access to assigned projects.</p></div><select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">All accessible projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></div>{isAdmin&&<section className="card tablecard"><div className="cardhead"><div><h3>Assign project member</h3><p className="muted">Only administrators can manage project assignments.</p></div></div><form onSubmit={addProjectMember}><div className="formgrid"><label>Project<select required value={memberProject} onChange={e=>setMemberProject(e.target.value)}><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></label><label>Employee<select required value={memberUser} onChange={e=>setMemberUser(e.target.value)}><option value="">Select employee</option>{profiles.filter(p=>p.is_active && p.role===(memberType==="Viewer"?"viewer":"engineer")).map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.role}</option>)}</select></label><label>Project assignment<select value={memberType} onChange={e=>{setMemberType(e.target.value);setMemberUser("");}}><option value="Engineer">Engineer</option><option value="Viewer">Management Viewer</option></select></label></div><button className="primary" disabled={savingMember||!memberProject||!memberUser}>{savingMember?"Assigning…":"Add project member"}</button></form></section>}<section className="card tablecard"><div className="cardhead"><div><h3>Project member register</h3><p className="muted">{selectedMembers.length} assignments</p></div></div>{selectedMembers.length?<div className="tablewrap"><table><thead><tr><th>Project</th><th>Employee</th><th>Position</th><th>Account role</th><th>Project assignment</th><th>Action</th></tr></thead><tbody>{selectedMembers.map(m=>{const person=profiles.find(p=>p.id===m.user_id);return <tr key={`${m.project_id}-${m.user_id}-${m.assignment_type}`}><td>{projectName(m.project_id)}</td><td><b>{person?.full_name||m.user_id}</b></td><td>{person?.position||"—"}</td><td>{person?.role||"—"}</td><td><span className="status">{m.assignment_type==="Viewer"?"Management Viewer":m.assignment_type}</span></td><td>{isAdmin&&<button className="iconbtn" onClick={()=>removeProjectMember(m)} title="Remove assignment"><Trash2 size={14}/></button>}</td></tr>})}</tbody></table></div>:<Empty text="No project assignments found. Administrators can add Engineers and Management Viewers."/ >}</section></>:
 section==="Personnel"?<><div className="welcome"><div><h2>Personnel directory</h2><p className="muted">Manage employee profiles, account roles, and access status. New employees receive an email invitation to activate their account.</p></div>{isAdmin&&<button className="primary" onClick={openNewPersonnel}><UserPlus size={17}/> Add employee</button>}</div><div className="stats"><Stat title="Total personnel" value={profiles.length}/><Stat title="Active accounts" value={profiles.filter(p=>p.is_active).length}/><Stat title="Engineers" value={profiles.filter(p=>p.role==="engineer"&&p.is_active).length}/><Stat title="Management viewers" value={profiles.filter(p=>p.role==="viewer"&&p.is_active).length}/></div><section className="card tablecard"><div className="cardhead"><div><h3>Employee register</h3><p className="muted">{filteredPersonnel.length} employees shown</p></div><div className="search"><Search size={16}/><input placeholder="Search name, position or role..." value={personnelQuery} onChange={e=>setPersonnelQuery(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Employee name</th><th>Position</th><th>Account role</th><th>Assigned projects</th><th>Account status</th>{isAdmin&&<th>Actions</th>}</tr></thead><tbody>{filteredPersonnel.map(person=>{const assigned=members.filter(m=>m.user_id===person.id);return <tr key={person.id}><td><b>{person.full_name||"Unnamed employee"}</b></td><td>{person.position||"—"}</td><td><span className="status">{person.role}</span></td><td>{assigned.length?assigned.map(m=>projectName(m.project_id)).join("; "):"Not assigned"}</td><td><span className={"status "+(person.is_active?"completed":"")}>{person.is_active?"Active":"Inactive"}</span></td>{isAdmin&&<td><button className="iconbtn" title="Edit employee" onClick={()=>openEditPersonnel(person)}><Pencil size={14}/></button> <button className="iconbtn" title={person.is_active?"Deactivate account":"Reactivate account"} onClick={()=>togglePersonnelStatus(person)}>{person.is_active?<UserX size={14}/>:<UserCheck size={14}/>}</button></td>}</tr>})}{!filteredPersonnel.length&&<tr><td colSpan={isAdmin?6:5}><Empty text="No employee profiles found."/></td></tr>}</tbody></table></div></section>{!isAdmin&&<p className="muted">Only administrators can add employees or change account roles.</p>}</>:<section className="card placeholder"><h2>{section}</h2><p className="muted">This module is included in the system architecture and will be enabled as its workflow is configured.</p></section>}
 {error&&<p className="error toast">{error}</p>}{notice&&<p className="notice toast">{notice}</p>}
 {showPersonnelForm&&<div className="overlay"><form className="modal card" onSubmit={savePersonnel}><div className="cardhead"><div><h2>{editingProfile?"Edit employee":"Add employee"}</h2><p className="muted">{editingProfile?"Update employee profile and access.":"An invitation email will be sent so the employee can activate their account."}</p></div><button type="button" className="link" onClick={()=>setShowPersonnelForm(false)}>Close</button></div><div className="formgrid">{!editingProfile&&<label>Email address<input type="email" required value={personnelForm.email} onChange={e=>setPersonnelForm({...personnelForm,email:e.target.value})} placeholder="employee@company.com"/></label>}<label>Full name<input required value={personnelForm.full_name} onChange={e=>setPersonnelForm({...personnelForm,full_name:e.target.value})} placeholder="Employee full name"/></label><label>Position<input value={personnelForm.position} onChange={e=>setPersonnelForm({...personnelForm,position:e.target.value})} placeholder="e.g. Structural Engineer"/></label><label>Account role<select value={personnelForm.role} onChange={e=>setPersonnelForm({...personnelForm,role:e.target.value})}><option value="engineer">Engineer / Designer</option><option value="viewer">Management Viewer</option><option value="admin">Administrator</option></select></label>{editingProfile&&<label>Account status<select value={personnelForm.is_active?"true":"false"} onChange={e=>setPersonnelForm({...personnelForm,is_active:e.target.value==="true"})}><option value="true">Active</option><option value="false">Inactive</option></select></label>}</div>{!editingProfile&&<p className="muted">The employee will receive an account invitation. Project access must be assigned separately under Project Members.</p>}<div className="topactions"><button type="button" className="secondary" onClick={()=>setShowPersonnelForm(false)}>Cancel</button><button className="primary" disabled={savingPersonnel}>{savingPersonnel?"Saving…":editingProfile?"Save changes":"Send invitation"}</button></div></form></div>}
 {showDeliverableForm&&<div className="overlay"><form className="modal card" onSubmit={saveDeliverable}><div className="cardhead"><h2>{editingDeliverable?"Edit deliverable":"New deliverable"}</h2><button type="button" className="link" onClick={()=>setShowDeliverableForm(false)}>Close</button></div><div className="formgrid"><label>Project<select required value={deliverableForm.project_id} onChange={e=>setDeliverableForm({...deliverableForm,project_id:e.target.value})}><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}</select></label><label>Discipline<select value={deliverableForm.discipline} onChange={e=>setDeliverableForm({...deliverableForm,discipline:e.target.value})}>{disciplines.map(d=><option key={d}>{d}</option>)}</select></label><label className="wide">Task / deliverable description<input required value={deliverableForm.description} onChange={e=>setDeliverableForm({...deliverableForm,description:e.target.value})} placeholder="e.g. Structural Plans and Calculations"/></label><label>Assigned personnel<select value={deliverableForm.assigned_to} onChange={e=>setDeliverableForm({...deliverableForm,assigned_to:e.target.value})}><option value="">Unassigned</option>{profiles.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.full_name||p.id} · {p.role}</option>)}</select></label><label>Date assigned<input type="date" value={deliverableForm.date_assigned} onChange={e=>setDeliverableForm({...deliverableForm,date_assigned:e.target.value})}/></label><label>Target submission date<input type="date" value={deliverableForm.target_date} onChange={e=>setDeliverableForm({...deliverableForm,target_date:e.target.value})}/></label><label>Actual submission date<input type="date" value={deliverableForm.actual_submission_date} onChange={e=>setDeliverableForm({...deliverableForm,actual_submission_date:e.target.value})}/></label><label>Status<select value={deliverableForm.status} onChange={e=>setDeliverableForm({...deliverableForm,status:e.target.value,progress:e.target.value==="Completed"?100:deliverableForm.progress})}>{deliverableStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Completion (%)<input type="number" min="0" max="100" value={deliverableForm.progress} disabled={deliverableForm.status==="Completed"} onChange={e=>setDeliverableForm({...deliverableForm,progress:Number(e.target.value)})}/></label><label className="wide">Remarks<textarea rows={3} value={deliverableForm.remarks} onChange={e=>setDeliverableForm({...deliverableForm,remarks:e.target.value})}/></label></div><p className="muted">Project progress is recalculated automatically as the arithmetic average of all deliverable percentages. Completed deliverables are set to 100%.</p>{error&&<p className="error">{error}</p>}<button className="primary full">{editingDeliverable?"Save changes":"Save deliverable"}</button></form></div>}
 {showForm&&<div className="overlay"><form className="modal card" onSubmit={addProject}><div className="cardhead"><h2>New project</h2><button type="button" className="link" onClick={()=>setShowForm(false)}>Close</button></div><div className="formgrid"><label>Project ID<input required value={form.project_code} onChange={e=>setForm({...form,project_code:e.target.value})}/></label><label>Project name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Client<input value={form.client} onChange={e=>setForm({...form,client:e.target.value})}/></label><label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select></label><label>Target completion<input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/></label></div>{error&&<p className="error">{error}</p>}<button className="primary full">Save project</button></form></div>}
 </main></div>;
}
function activityLabel(type:string|null){return (type||"Activity").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function Stat({title,value,danger=false}:{title:string,value:number,danger?:boolean}){return <div className="stat card"><span>{title}</span><b className={danger?"danger":""}>{value}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
