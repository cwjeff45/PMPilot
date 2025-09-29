// Tiny client-side PM tool with localStorage + JSON import/export
window.pm = (() => {
  const KEY = "pm_data_v1";

  /** -------------------- Model -------------------- **/
  const blank = () => ({ agents: [], projects: [] });
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? blank(); }
    catch { return blank(); }
  };
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));
  const uid = (p="id") => `${p}_${Math.random().toString(36).slice(2,9)}`;

  let state = load();

  // Agents
  function addAgent(name){ state.agents.push({ id: uid("a"), name }); save(state); }
  function removeAgent(id){
    state.agents = state.agents.filter(a => a.id !== id);
    // also unassign tasks
    state.projects.forEach(p => p.tasks.forEach(t => { if(t.agentId === id) t.agentId = null; }));
    save(state);
  }

  // Projects
  function addProject({title, notes, date, time}){
    state.projects.push({ id: uid("p"), title, notes: notes||"", date: date||"", time: time||"", tasks: [] });
    save(state);
  }
  function updateProject(id, fields){
    const p = state.projects.find(p => p.id === id);
    if(!p) return;
    Object.assign(p, fields);
    save(state);
  }
  function removeProject(id){
    state.projects = state.projects.filter(p => p.id !== id);
    save(state);
  }

  // Tasks
  function addTask(projectId, {title, notes, date, time, agentId}){
    const p = state.projects.find(p => p.id === projectId); if(!p) return;
    p.tasks.push({ id: uid("t"), title, notes: notes||"", date: date||"", time: time||"", agentId: agentId||null, done:false });
    save(state);
  }
  function updateTask(projectId, taskId, fields){
    const p = state.projects.find(p => p.id === projectId); if(!p) return;
    const t = p.tasks.find(t => t.id === taskId); if(!t) return;
    Object.assign(t, fields);
    save(state);
  }
  function removeTask(projectId, taskId){
    const p = state.projects.find(p => p.id === projectId); if(!p) return;
    p.tasks = p.tasks.filter(t => t.id !== taskId);
    save(state);
  }

  /** -------------------- UI -------------------- **/
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const els = {
    agentList: $("#agent-list"),
    agentForm: $("#form-agent"),
    agentName: $("#agent-name"),

    projectList: $("#project-list"),
    projectSearch: $("#project-search"),
    newProject: $("#btn-new-project"),

    projectModal: $("#project-modal"),
    projectForm: $("#form-project"),
    projectId: $("#project-id"),
    projectTitle: $("#project-title"),
    projectNotes: $("#project-notes"),
    projectDate: $("#project-date"),
    projectTime: $("#project-time"),

    taskModal: $("#task-modal"),
    taskForm: $("#form-task"),
    taskId: $("#task-id"),
    taskProjectId: $("#task-project-id"),
    taskTitle: $("#task-title"),
    taskNotes: $("#task-notes"),
    taskDate: $("#task-date"),
    taskTime: $("#task-time"),
    taskAgent: $("#task-agent"),

    exportBtn: $("#btn-export"),
    importFile: $("#file-import"),
    resetBtn: $("#btn-reset"),
  };

  function renderAgents(){
    els.agentList.innerHTML = state.agents.map(a => `
      <li class="card flex items-center justify-between gap-2">
        <span class="text-sm">${a.name}</span>
        <button class="btn-light text-xs" data-remove-agent="${a.id}">Remove</button>
      </li>
    `).join('') || `<div class="text-sm text-slate-500">No agents yet—add some above.</div>`;
    // populate agent select for tasks
    els.taskAgent.innerHTML = `<option value="">Unassigned</option>` + state.agents
      .map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  function projectCard(p){
    const tasksOpen = p.tasks.filter(t=>!t.done).length;
    const tasksTotal = p.tasks.length;
    const when = (p.date || p.time) ? `<span class="badge border-slate-300">${[p.date,p.time].filter(Boolean).join(' ')}</span>` : '';
    return `
      <article class="card">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="project-title">${p.title}</div>
            ${p.notes ? `<div class="text-sm text-slate-600 whitespace-pre-wrap">${p.notes}</div>`:''}
            <div class="flex gap-2 mt-1">
              ${when}
              <span class="badge border-slate-300">${tasksOpen}/${tasksTotal} open</span>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn-light text-xs" data-edit-project="${p.id}">Edit</button>
            <button class="btn-light text-xs" data-delete-project="${p.id}">Delete</button>
            <button class="btn text-xs" data-new-task="${p.id}">New Task</button>
          </div>
        </div>

        <div class="mt-4 divide-y">
          ${p.tasks.map(t => taskRow(p.id, t)).join('') || `<div class="py-2 text-sm text-slate-500">No tasks yet.</div>`}
        </div>
      </article>`;
  }

  function taskRow(projectId, t){
    const when = (t.date || t.time) ? `<span class="badge border-slate-300">${[t.date,t.time].filter(Boolean).join(' ')}</span>` : '';
    const agent = t.agentId ? state.agents.find(a=>a.id===t.agentId)?.name : "—";
    return `
      <div class="task-row" data-task-id="${t.id}" data-project-id="${projectId}">
        <label class="inline-flex items-center gap-2">
          <input type="checkbox" ${t.done?'checked':''} data-toggle-done />
          <span class="task-title ${t.done?'line-through text-slate-400':''}">${t.title}</span>
        </label>
        <div class="text-xs text-slate-600">
          ${t.notes ? `<span class="mr-2">${t.notes}</span>`:''}
          ${when}
          <span class="badge border-slate-300 ml-2">Agent: ${agent}</span>
        </div>
        <div class="justify-self-end flex gap-2">
          <button class="btn-light text-xs" data-edit-task> Edit</button>
          <button class="btn-light text-xs" data-delete-task>Delete</button>
        </div>
      </div>`;
  }

  function renderProjects(){
    const q = els.projectSearch.value.trim().toLowerCase();
    const items = state.projects
      .filter(p => !q || p.title.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q))
      .sort((a,b) => (a.date||"").localeCompare(b.date||"") || a.title.localeCompare(b.title));
    els.projectList.innerHTML = items.map(projectCard).join('') || `<div class="text-sm text-slate-500">No projects yet—create one.</div>`;
  }

  /** ----------- Modal helpers ----------- **/
  function openProjectModal(p){
    $("#project-modal-title").textContent = p ? "Edit Project" : "New Project";
    els.projectId.value = p?.id || "";
    els.projectTitle.value = p?.title || "";
    els.projectNotes.value = p?.notes || "";
    els.projectDate.value = p?.date || "";
    els.projectTime.value = p?.time || "";
    els.projectModal.showModal();
  }
  function closeProject(){ els.projectModal.close(); }

  function openTaskModal(projectId, t){
    $("#task-modal-title").textContent = t ? "Edit Task" : "New Task";
    els.taskProjectId.value = projectId;
    els.taskId.value = t?.id || "";
    els.taskTitle.value = t?.title || "";
    els.taskNotes.value = t?.notes || "";
    els.taskDate.value = t?.date || "";
    els.taskTime.value = t?.time || "";
    els.taskAgent.value = t?.agentId || "";
    els.taskModal.showModal();
  }
  function closeTask(){ els.taskModal.close(); }

  /** -------------------- Events -------------------- **/
  // Agents
  els.agentForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    const name = els.agentName.value.trim();
    if(!name) return;
    addAgent(name); els.agentName.value = "";
    renderAgents(); renderProjects();
  });
  els.agentList.addEventListener("click", (e)=>{
    const id = e.target?.dataset?.removeAgent;
    if(!id) return;
    if(confirm("Remove agent? This will unassign their tasks.")){
      removeAgent(id); renderAgents(); renderProjects();
    }
  });

  // Projects
  els.newProject.addEventListener("click", ()=> openProjectModal(null));
  els.projectSearch.addEventListener("input", renderProjects);

  els.projectList.addEventListener("click",(e)=>{
    const t = e.target;
    if(t.dataset.editProject){ 
      const p = state.projects.find(p=>p.id===t.dataset.editProject);
      openProjectModal(p);
    } else if(t.dataset.deleteProject){
      const id = t.dataset.deleteProject;
      if(confirm("Delete project and all its tasks?")){
        removeProject(id); renderProjects();
      }
    } else if(t.dataset.newTask){
      openTaskModal(t.dataset.newTask, null);
    } else if(t.closest("[data-toggle-done]")){
      // noop
    }
  });

  // Toggle done
  els.projectList.addEventListener("change", (e)=>{
    if(e.target?.dataset?.toggleDone !== undefined){
      const row = e.target.closest("[data-task-id]");
      const pid = row.dataset.projectId, tid = row.dataset.taskId;
      updateTask(pid, tid, { done: e.target.checked });
      renderProjects();
    }
  });

  // Edit/Delete task buttons
  els.projectList.addEventListener("click", (e)=>{
    if(e.target?.dataset?.editTask !== undefined){
      const row = e.target.closest("[data-task-id]");
      const pid = row.dataset.projectId, tid = row.dataset.taskId;
      const p = state.projects.find(p=>p.id===pid);
      const t = p?.tasks.find(t=>t.id===tid);
      openTaskModal(pid, t);
    }
    if(e.target?.dataset?.deleteTask !== undefined){
      const row = e.target.closest("[data-task-id]");
      const pid = row.dataset.projectId, tid = row.dataset.taskId;
      if(confirm("Delete task?")){ removeTask(pid, tid); renderProjects(); }
    }
  });

  // Project modal submit
  els.projectForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    const id = els.projectId.value;
    const payload = {
      title: els.projectTitle.value.trim(),
      notes: els.projectNotes.value.trim(),
      date: els.projectDate.value,
      time: els.projectTime.value,
    };
    if(!payload.title) return;
    if(id) updateProject(id, payload); else addProject(payload);
    closeProject(); renderProjects();
  });

  // Task modal submit
  els.taskForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    const pid = els.taskProjectId.value;
    const tid = els.taskId.value;
    const payload = {
      title: els.taskTitle.value.trim(),
      notes: els.taskNotes.value.trim(),
      date: els.taskDate.value,
      time: els.taskTime.value,
      agentId: els.taskAgent.value || null
    };
    if(!payload.title) return;
    if(tid) updateTask(pid, tid, payload); else addTask(pid, payload);
    closeTask(); renderProjects();
  });

  // Export / Import / Reset
  els.exportBtn.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "projects-tasks.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  els.importFile.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if(!data.projects || !data.agents) throw new Error("Invalid file");
      state = data; save(state);
      renderAgents(); renderProjects();
      alert("Import successful.");
    } catch {
      alert("Import failed: invalid JSON structure.");
    } finally {
      e.target.value = "";
    }
  });
  els.resetBtn.addEventListener("click", ()=>{
    if(confirm("Clear local data? This only affects this browser.")){
      state = blank(); save(state); renderAgents(); renderProjects();
    }
  });

  // Initial render
  renderAgents(); renderProjects();

  // Expose minimal UI control for modals
  return {
    ui: {
      closeProject, closeTask
    }
  };
})();
