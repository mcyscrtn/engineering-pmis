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
