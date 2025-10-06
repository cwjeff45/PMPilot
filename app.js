// PM Pilot - all behavior
(() => {
  /* ---------- Keys ---------- */
  const AGENTS_KEY = "pm_agents";
  const PROJECTS_KEY = "pm_projects";
  const PASS_KEY = "pm_passhash";

  /* ---------- Agent color helpers ---------- */
  const DEFAULT_AGENT_COLORS = [
    "#3b82f6","#10b981","#f59e0b","#ef4444",
    "#8b5cf6","#06b6d4","#84cc16","#f97316",
    "#ec4899","#22c55e"
  ];
  function hexBrightness(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#888888");
    if(!m) return 136;
    const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
    return Math.round(0.2126*r + 0.7152*g + 0.0722*b);
  }
  const contrastClass = (hex)=> hexBrightness(hex) > 150 ? "light" : "dark";
  function pickColorFromName(name){
    if(!name) return DEFAULT_AGENT_COLORS[0];
    let h=0; for (let i=0;i<name.length;i++) h=(h*31 + name.charCodeAt(i))>>>0;
    return DEFAULT_AGENT_COLORS[h % DEFAULT_AGENT_COLORS.length];
  }
  function normalizeAgents(arr){
    if (!Array.isArray(arr)) return [];
    if (!arr.length) return [];
    if (typeof arr[0] === "string") return arr.map(n => ({ name:n, color:pickColorFromName(n) }));
    return arr.map(a => ({ name:a.name, color:a.color || pickColorFromName(a.name) }));
  }
  function getAgentColor(name){
    const a = readAgents().find(x => x.name === name);
    return a?.color || "#3b82f6";
  }

  /* ---------- General helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const uid = () => "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const read  = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const readProjects = () => read(PROJECTS_KEY, []);
  const writeProjects = (arr) => write(PROJECTS_KEY, arr);
  const readAgents = () => normalizeAgents(read(AGENTS_KEY, []));
  const writeAgents = (arr) => write(AGENTS_KEY, normalizeAgents(arr));

  const parseDate = (d) => (d ? new Date(d + "T00:00:00") : null);
  const daysBetween = (a, b) => Math.max(0, Math.round((parseDate(b) - parseDate(a)) / 86400000));
  const minDate = (a, b) => !a ? b : !b ? a : parseDate(a) <= parseDate(b) ? a : b;
  const maxDate = (a, b) => !a ? b : !b ? a : parseDate(a) >= parseDate(b) ? a : b;

  function toTs(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = timeStr ? timeStr : "23:59";
    return new Date(dateStr + "T" + t).getTime();
  }

  // Hash helpers for passcode
  const encoder = new TextEncoder();
  async function sha256Hex(str){
    const buf = await crypto.subtle.digest("SHA-256", encoder.encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  const getPassHash = () => localStorage.getItem(PASS_KEY) || "";
  const setPassHash = (h) => localStorage.setItem(PASS_KEY, h);
  const clearPassHash = () => localStorage.removeItem(PASS_KEY);

  // Dialog helpers
  function showDialog(dlg) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
  function closeDialog(dlg){ if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); }

  function findProject(id){ return readProjects().find((p) => p.id === id) || null; }
  function saveProject(updated){
    const all = readProjects().map((p) => (p.id === updated.id ? updated : p));
    writeProjects(all);
  }

  /* ---------- DOM refs ---------- */
  const view = $("view");
  const addBar = $("addBar");
  const addProjectBtn = $("addProjectBtn");
  const clockBar = $("clockBar");
  const settingsBtn = $("settingsBtn");
  const brandHome = $("brandHome");

  // Auth / Lock DOM
  const authOverlay = $("authOverlay");
  const authUnlock  = $("authUnlock");
  const authSetup   = $("authSetup");
  const unlockForm  = $("unlockForm");
  const unlockPass  = $("unlockPass");
  const unlockMsg   = $("unlockMsg");
  const setupForm   = $("setupForm");
  const setupPass1  = $("setupPass1");
  const setupPass2  = $("setupPass2");
  const authReset   = $("authReset");
  const lockBtn     = $("lockBtn");

  // Notices
  const noticeToggle = $("noticeToggle");
  const noticePanel  = $("noticePanel");

  // Remove accidental duplicate addBars
  document.querySelectorAll("#addBar").forEach((el, i) => { if (i > 0) el.remove(); });

  // Drawer
  const menuToggle = $("menuToggle");
  const drawer = $("drawer");
  const drawerClose = $("drawerClose");
  const backdrop = $("backdrop");

  const aForm = $("agentForm");
  const aInput = $("agentInput");
  const aList = $("agentList");
  const exportAgents = $("exportAgents");
  const importAgents = $("importAgents");
  const resetAgents = $("resetAgents");

  // Project modal
  const pDlg = $("projectDialog");
  const pForm = $("projectForm");
  const pTitle = $("pTitle");
  const pNotes = $("pNotes");
  const pDate = $("pDate");
  const pTime = $("pTime");
  const cancelProject = $("cancelProject");
  const projectSaveBtn = $("projectSaveBtn");

  // Task modal
  const tDlg = $("taskDialog");
  const tForm = $("taskForm");
  const tTitle = $("tTitle");
  const tNotes = $("tNotes");
  const tStart = $("tStart");
  const tEnd = $("tEnd");
  const tAgent = $("tAgent");
  const cancelTask = $("cancelTask");
  const taskTitleLabel = $("taskTitleLabel");
  const taskSaveBtn = $("taskSaveBtn");

  // Ensure hidden id exists (edit vs create)
  let tId = $("tId");
  if (!tId) {
    tId = document.createElement("input");
    tId.type = "hidden";
    tId.id = "tId";
    tForm?.prepend(tId);
  }

  /* ---------- State ---------- */
  let currentProjectId = null;
  let projectsView = localStorage.getItem("pm_projects_view") || "active"; // "active" | "completed"

  /* ---------- Live clock ---------- */
  function updateClock() {
    if (!clockBar) return;
    const now = new Date();
    const date = now.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" });
    const time = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    clockBar.textContent = `${date} • ${time}`;
  }

  /* ---------- Notices (due within 24h) ---------- */
  function collectDueSoon() {
    const now = Date.now();
    const horizon = now + 24 * 60 * 60 * 1000;
    const out = [];
    const projects = readProjects();

    projects.forEach((pr) => {
      if (pr.dueDate) {
        const dueTs = toTs(pr.dueDate, pr.dueTime || "");
        if (dueTs && dueTs >= now && dueTs <= horizon) {
          out.push({
            type: "project",
            projectId: pr.id,
            title: pr.title,
            dueTs,
            dueText: new Date(dueTs).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: pr.dueTime ? "short" : undefined,
            }),
          });
        }
      }
      (pr.tasks || []).forEach((t) => {
        const d = t.end || t.start;
        const dueTs = toTs(d, "23:59");
        if (dueTs && dueTs >= now && dueTs <= horizon) {
          out.push({
            type: "task",
            projectId: pr.id,
            taskId: t.id,
            title: t.title,
            projectTitle: pr.title,
            dueTs,
            dueText: new Date(dueTs).toLocaleDateString([], { month:"short", day:"numeric" }),
          });
        }
      });
    });

    out.sort((a, b) => a.dueTs - b.dueTs);
    return out;
  }

  function renderNoticePanel() {
    if (!noticePanel || !noticeToggle) return;

    const items = collectDueSoon();
    noticeToggle.classList.toggle("has-alert", items.length > 0);

    noticePanel.innerHTML = "";
    const h = document.createElement("h3"); h.textContent = "Notice Center";
    const sub = document.createElement("div"); sub.className = "small muted"; sub.textContent = "Due in the next 24 hours";
    noticePanel.append(h, sub);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted"; empty.style.marginTop = "8px";
      empty.textContent = "Nothing due in the next 24 hours.";
      noticePanel.appendChild(empty);
      return;
    }

    const list = document.createElement("div"); list.className = "notice-list";
    items.forEach((it) => {
      const card = document.createElement("div"); card.className = "notice-item";
      const title = document.createElement("div");
      title.textContent = it.type === "project" ? it.title : `${it.title} · ${it.projectTitle}`;
      const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = `Due: ${it.dueText}`;
      card.append(title, meta);
      card.addEventListener("click", () => {
        renderProjectDetail(it.projectId);
        if (it.type === "task" && it.taskId) {
          setTimeout(() => {
            const el = document.getElementById("task-" + it.taskId);
            if (el) { el.classList.add("pulse"); el.scrollIntoView({ behavior:"smooth", block:"center" }); setTimeout(() => el.classList.remove("pulse"), 1400); }
          }, 60);
        }
        noticePanel.hidden = true;
        noticeToggle.setAttribute("aria-expanded", "false");
      });
      list.appendChild(card);
    });
    noticePanel.appendChild(list);
  }

  /* ---------- Idle auto-lock (5 minutes) ---------- */
  let idleMs = 5 * 60 * 1000;  // 5 minutes
  let idleTimer = null;
  function resetIdleTimer() {
    // Only run when a passcode exists and the app is not currently locked
    if (!getPassHash()) return;
    if (authOverlay && !authOverlay.hidden) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { showAuth(); }, idleMs);
  }

  /* ---------- Auth overlay ---------- */
  function showAuth(){
    if(!authOverlay) return;
    clearTimeout(idleTimer); // pause idle countdown while locked

    if (authUnlock) authUnlock.hidden = true;
    if (authSetup)  authSetup.hidden  = true;

    const has = !!getPassHash();
    if (has) { if (authUnlock) authUnlock.hidden = false; }
    else     { if (authSetup)  authSetup.hidden  = false; }

    authOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(()=> (has ? unlockPass : setupPass1)?.focus(), 30);
  }
  function hideAuth(){
    if(!authOverlay) return;
    authOverlay.hidden = true;
    document.body.style.overflow = "";
    resetIdleTimer(); // resume countdown when unlocked
  }

  /* ---------- Drawer (Agents) ---------- */
  function openDrawer() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    backdrop.hidden = false; backdrop.classList.add("show");
    setTimeout(() => aInput?.focus(), 120);
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    backdrop.classList.remove("show");
    setTimeout(() => (backdrop.hidden = true), 180);
  }
  drawerClose.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  settingsBtn?.addEventListener("click", openDrawer);

  function renderAgents() {
    const agents = readAgents();
    aList.innerHTML = "";
    if (!agents.length) {
      const li = document.createElement("li");
      li.style.opacity = ".7";
      li.textContent = "No agents yet.";
      aList.appendChild(li);
      return;
    }

    agents.forEach((agent) => {
      const li = document.createElement("li");
      li.className = "agent-row";

      const left = document.createElement("div");
      left.className = "left";

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = agent.color;

      const name = document.createElement("span");
      name.textContent = agent.name;

      left.append(dot, name);

      const colorInp = document.createElement("input");
      colorInp.type = "color";
      colorInp.value = agent.color || pickColorFromName(agent.name);
      colorInp.className = "agent-color";
      colorInp.title = "Agent color";
      colorInp.addEventListener("input", () => {
        const list = readAgents().map(a =>
          a.name === agent.name ? { ...a, color: colorInp.value } : a
        );
        writeAgents(list);
        renderAgents();
        if (currentProjectId) renderProjectDetail(currentProjectId);
      });

      const rm = document.createElement("button");
      rm.className = "rm";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        writeAgents(readAgents().filter((a) => a.name !== agent.name));
        renderAgents();
        if (currentProjectId) renderProjectDetail(currentProjectId);
        renderNoticePanel?.();
      });

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "6px";
      right.append(colorInp, rm);

      li.append(left, right);
      aList.appendChild(li);
    });
  }

  aForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (aInput.value || "").trim();
    if (!v) return;
    let agents = readAgents();
    if (!agents.find(a => a.name === v)) {
      agents.push({ name: v, color: pickColorFromName(v) });
      agents.sort((a,b)=> a.name.localeCompare(b.name));
      writeAgents(agents);
    }
    aInput.value = "";
    renderAgents();
    if (currentProjectId) renderProjectDetail(currentProjectId);
  });

  exportAgents.addEventListener("click", () => {
    const data = { agents: readAgents() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agents.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  importAgents.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const arr = Array.isArray(json) ? json : Array.isArray(json?.agents) ? json.agents : null;
      if (!arr) throw 0;
      const normalized = normalizeAgents(arr);
      const map = new Map();
      normalized.forEach(a => { map.set(a.name, a); });
      writeAgents(Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name)));
      renderAgents();
      if (currentProjectId) renderProjectDetail(currentProjectId);
      renderNoticePanel();
    } catch {
      alert('Invalid JSON. Expect ["Alice"] or {"agents":[...]}');
    } finally {
      e.target.value = "";
    }
  });

  resetAgents.addEventListener("click", () => {
    if (!confirm("Clear local agents?")) return;
    writeAgents([]);
    renderAgents();
    if (currentProjectId) renderProjectDetail(currentProjectId);
    renderNoticePanel();
  });

  /* ---------- Projects ---------- */
  function openProjectModal() {
    pTitle.value = ""; pNotes.value = ""; pDate.value = ""; pTime.value = "";
    showDialog(pDlg);
    setTimeout(() => pTitle.focus(), 50);
  }

  function saveProjectSubmit(e) {
    e.preventDefault();
    const p = {
      id: uid(),
      title: (pTitle.value || "").trim(),
      notes: (pNotes.value || "").trim(),
      dueDate: pDate.value || "",
      dueTime: pTime.value || "",
      status: "active",
      tasks: [],
    };
    if (!p.title) { alert("Please enter a project title."); return; }
    const all = readProjects();
    all.push(p);
    all.sort((a,b)=> (a.dueDate||"") && (b.dueDate||"") && a.dueDate!==b.dueDate
      ? a.dueDate.localeCompare(b.dueDate) : a.title.localeCompare(b.title));
    writeProjects(all);
    closeDialog(pDlg);
    renderProjectsList();
    renderNoticePanel();
  }

  function viewElReset(){ view.innerHTML = ""; addBar.hidden = true; }

  function renderProjectsList(which = projectsView) {
    projectsView = which;
    localStorage.setItem("pm_projects_view", projectsView);

    currentProjectId = null;
    const list = readProjects().map(p => ({ status:"active", ...p }));
    const activeCount    = list.filter(p => p.status !== "complete").length;
    const completedCount = list.filter(p => p.status === "complete").length;

    const filtered = list.filter(p => projectsView === "completed" ? p.status==="complete" : p.status!=="complete");

    viewElReset();

    // Tabbar
    const tabs = document.createElement("div");
    tabs.className = "tabbar";
    const t1 = document.createElement("button");
    t1.className = "tab" + (projectsView === "active" ? " active" : "");
    t1.textContent = `Active (${activeCount})`;
    t1.addEventListener("click", () => renderProjectsList("active"));
    const t2 = document.createElement("button");
    t2.className = "tab" + (projectsView === "completed" ? " active" : "");
    t2.textContent = `Completed (${completedCount})`;
    t2.addEventListener("click", () => renderProjectsList("completed"));
    tabs.append(t1, t2);
    view.appendChild(tabs);

    if (!filtered.length) {
      const empty = document.createElement("div"); empty.className = "projects-empty";
      const wrap = document.createElement("div");
      const p = document.createElement("p"); p.className = "muted";
      p.textContent = projectsView === "completed" ? "No completed projects yet." : "No projects yet.";
      wrap.appendChild(p);
      if (projectsView !== "completed") {
        const btn = document.createElement("button");
        btn.className = "btn"; btn.type = "button"; btn.textContent = "Create Project";
        btn.addEventListener("click", openProjectModal);
        wrap.appendChild(btn);
      }
      empty.appendChild(wrap);
      view.appendChild(empty);
      addBar.hidden = projectsView === "completed";
      return;
    }

    const grid = document.createElement("div");
    grid.className = "projects-grid";

    filtered.forEach((pr) => {
      const card = document.createElement("article");
      card.className = "card proj-card";
      card.style.position = "relative";

      const h3 = document.createElement("h3"); h3.textContent = pr.title;

      const badge = document.createElement("span");
      badge.className = "status-badge " + (pr.status==="complete" ? "status-complete" :
                                           pr.status==="onhold"  ? "status-onhold"  : "status-active");
      badge.textContent = pr.status==="complete" ? "Complete" :
                          pr.status==="onhold"  ? "On Hold"  : "Active";
      h3.appendChild(badge);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = pr.dueDate
        ? "Due: " + new Date(pr.dueDate + (pr.dueTime ? "T"+pr.dueTime : "T00:00"))
            .toLocaleString([], { dateStyle:"medium", timeStyle: pr.dueTime ? "short" : undefined })
        : "No due date";

      const notes = document.createElement("div");
      notes.className = "meta"; notes.textContent = pr.notes || " ";

      const actions = document.createElement("div"); actions.className = "proj-actions";
      const open = document.createElement("button");
      open.className = "btn-light"; open.type="button"; open.textContent = "Open";
      open.addEventListener("click", () => renderProjectDetail(pr.id));

      const del = document.createElement("button");
      del.className = "del"; del.textContent = "×"; del.title = "Delete project";
      del.addEventListener("click", () => {
        if (!confirm(`Delete project "${pr.title}"?`)) return;
        writeProjects(readProjects().filter((x) => x.id !== pr.id));
        renderProjectsList(projectsView);
        renderNoticePanel?.();
      });

      actions.append(open);
      if (projectsView !== "completed") card.append(h3, meta, notes, actions, del);
      else card.append(h3, meta, notes, actions);

      grid.appendChild(card);
    });

    view.appendChild(grid);
    addBar.hidden = projectsView === "completed";
  }

  /* ---------- Project Detail + Gantt ---------- */
  function renderProjectDetail(projectId) {
    const pr = findProject(projectId);
    if (!pr) { renderProjectsList(); return; }
    currentProjectId = pr.id;
    pr.tasks = Array.isArray(pr.tasks) ? pr.tasks : [];

    view.innerHTML = "";
    addBar.hidden = true;

    const head = document.createElement("div");
    head.className = "detail-head";

    const back = document.createElement("button");
    back.className = "btn-light";
    back.textContent = "← Back";
    back.addEventListener("click", () => { renderProjectsList(); renderNoticePanel(); });

    const title = document.createElement("h2");
    title.textContent = pr.title;

    // Project status select
    const statusSel = document.createElement("select");
    ["active","onhold","complete"].forEach(s=>{
      const o = document.createElement("option");
      o.value = s;
      o.textContent = (s==="active"?"Active": s==="onhold"?"On Hold":"Complete");
      statusSel.appendChild(o);
    });
    pr.status = pr.status || "active";
    statusSel.value = pr.status;
    statusSel.className = "input";
    statusSel.style.maxWidth = "140px";
    statusSel.style.marginLeft = "12px";
    statusSel.title = "Project status";
    statusSel.addEventListener("change", ()=>{
      const proj = findProject(pr.id);
      proj.status = statusSel.value;
      saveProject(proj);
      if (proj.status === "complete") renderProjectsList("completed");
    });

    // Export buttons
    const exportWrap = document.createElement("div");
    exportWrap.style.display = "flex";
    exportWrap.style.gap = "6px";
    exportWrap.style.marginLeft = "12px";

    const btnJson = document.createElement("button");
    btnJson.className = "btn-light";
    btnJson.type = "button";
    btnJson.textContent = "Export JSON";
    btnJson.title = "Full project with tasks";
    btnJson.addEventListener("click", ()=> exportProjectJSON(pr));

    const btnCsv = document.createElement("button");
    btnCsv.className = "btn-light";
    btnCsv.type = "button";
    btnCsv.textContent = "Export CSV";
    btnCsv.title = "Tasks table (deadlines, agents, notes)";
    btnCsv.addEventListener("click", ()=> exportProjectCSV(pr));

    const btnIcs = document.createElement("button");
    btnIcs.className = "btn-light";
    btnIcs.type = "button";
    btnIcs.textContent = "Export ICS";
    btnIcs.title = "Calendar events for due date + tasks";
    btnIcs.addEventListener("click", ()=> exportProjectICS(pr));

    const btnPng = document.createElement("button");
    btnPng.className = "btn-light";
    btnPng.type = "button";
    btnPng.textContent = "Export Gantt PNG";
    btnPng.title = "Snapshot of the Gantt";
    btnPng.addEventListener("click", ()=> exportProjectGanttPNG(pr));

    exportWrap.append(btnJson, btnCsv, btnIcs, btnPng);

    // Open full-screen Gantt
    const openGanttBtn = document.createElement("button");
    openGanttBtn.className = "btn-light";
    openGanttBtn.textContent = "Open Gantt";
    openGanttBtn.title = "View Gantt full-screen";
    openGanttBtn.addEventListener("click", () => openGanttModal(pr.id));

    // Add Task button
    const addTaskBtn = document.createElement("button");
    addTaskBtn.className = "btn";
    addTaskBtn.textContent = "Add Task";
    addTaskBtn.style.marginLeft = "auto";
    addTaskBtn.addEventListener("click", () => openTaskModal(pr.id));

    // Build header once
    head.append(back, title, statusSel, exportWrap, openGanttBtn, addTaskBtn);
    view.appendChild(head);

    // Info bar
    if (pr.notes || pr.dueDate) {
      const info = document.createElement("div");
      info.className = "card";
      const bits = [];
      if (pr.dueDate) bits.push(`Due: ${new Date(pr.dueDate + (pr.dueTime ? "T"+pr.dueTime : "T00:00"))
        .toLocaleString([], { dateStyle:"medium", timeStyle: pr.dueTime ? "short" : undefined })}`);
      if (pr.notes) bits.push(pr.notes);
      info.textContent = bits.join(" · ");
      view.appendChild(info);
    }

    // Compact Gantt
    const wrap = document.createElement("div");
    wrap.className = "grid";
    wrap.appendChild(
      buildGantt(pr, {
        maxHeight: "360px",
        rowH: 34,
        labelW: 300,
        minInnerWidth: 720,
        zoom: 1
      })
    );

    // Task list
    const listCard = document.createElement("div");
    listCard.className = "grid";
    const h = document.createElement("h3");
    h.style.margin = "4px 0";
    h.textContent = "Tasks";
    listCard.appendChild(h);

    const taskWrap = document.createElement("div");
    taskWrap.className = "grid task-list";

    if (!pr.tasks.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No tasks yet.";
      taskWrap.appendChild(empty);
    } else {
      pr.tasks.forEach((task) => {
        const row = document.createElement("div");
        row.className = "task";
        row.id = "task-" + task.id;
        row.title = "Double-click to edit";

        const left = document.createElement("div");
        left.className = "left";
        const titleEl = document.createElement("div");
        titleEl.textContent = task.title;

        const meta = document.createElement("div");
        meta.className = "small";
        const agent = task.agent ? ` · ${task.agent}` : "";
        const range = `${task.start}${task.end && task.end !== task.start ? " → " + task.end : ""}`;
        meta.textContent = `${range}${agent}`;

        const note = document.createElement("div");
        note.className = "small note";
        if (task.notes && task.notes.trim()) note.textContent = task.notes;
        else { note.textContent = "No notes yet."; note.classList.add("muted"); }

        left.append(titleEl, meta, note);

        const right = document.createElement("div");
        right.className = "row";
        const edit = document.createElement("button");
        edit.className="btn-light";
        edit.textContent="Edit";
        edit.addEventListener("click", () => openTaskModal(pr.id, task));
        const del = document.createElement("button");
        del.className="btn-light";
        del.textContent="Delete";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const proj = findProject(pr.id);
          proj.tasks = proj.tasks.filter((x) => x.id !== task.id);
          saveProject(proj);
          renderProjectDetail(pr.id);
          renderNoticePanel();
        });
        right.append(edit, del);
        row.append(left, right);
        row.addEventListener("dblclick", () => openTaskModal(pr.id, task));
        taskWrap.appendChild(row);
      });
    }

    listCard.appendChild(taskWrap);
    wrap.appendChild(listCard);
    view.appendChild(wrap);
  }

  /* ---------- Gantt builder (compact + modal) ---------- */
  function buildGantt(pr, opts = {}) {
    const rowH   = opts.rowH   ?? 30;
    const labelW = opts.labelW ?? 240;
    const zoom   = opts.zoom   ?? 1;
    const maxH   = opts.maxHeight ?? null;
    const minInnerWidth = opts.minInnerWidth ?? 700;

    const card = document.createElement("div"); card.className = "card gantt";
    const title = document.createElement("div"); title.className = "small"; title.textContent = "Gantt";
    card.appendChild(title);

    if (!pr.tasks.length) {
      const empty = document.createElement("div"); empty.className = "muted"; empty.textContent = "No tasks to display.";
      card.appendChild(empty); return card;
    }

    // bounds
    let min = null, max = null;
    pr.tasks.forEach((t) => { const s=t.start, e=t.end||t.start; min=minDate(min,s); max=maxDate(max,e); });
    const totalDays = Math.max(1, daysBetween(min, max) + 1);

    // base px/day, then scale with zoom
    const basePx = totalDays > 180 ? 10 : totalDays > 120 ? 12 : totalDays > 60 ? 18 : 28;
    let pxPerDay = Math.max(6, Math.round(basePx * zoom));

    // ensure a minimum inner width so short ranges don't look cramped
    if ((totalDays * pxPerDay) < minInnerWidth) {
      pxPerDay = Math.ceil(minInnerWidth / totalDays);
    }

    const innerWidth = totalDays * pxPerDay;

    // tick step
    let step = 1; if (totalDays > 60) step = 7; if (totalDays > 120) step = 14;

    // scroller
    const scroll = document.createElement("div"); scroll.className = "gantt-scroll";
    if (maxH) scroll.style.maxHeight = maxH;

    // ruler row
    const rulerRow = document.createElement("div");
    rulerRow.style.display = "grid";
    rulerRow.style.gridTemplateColumns = `${labelW}px ${innerWidth}px`;

    const rulerLabel = document.createElement("div"); // spacer
    const ruler = document.createElement("div");
    ruler.className = "ruler";
    ruler.style.width = innerWidth + "px";
    ruler.style.display = "flex";

    for (let d = 0; d < totalDays; d += step) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.width = pxPerDay * step + "px";
      const dt = new Date(parseDate(min)); dt.setDate(dt.getDate() + d);
      tick.textContent = step === 1
        ? dt.toLocaleDateString(undefined, { month:"numeric", day:"numeric" })
        : dt.toLocaleDateString(undefined, { month:"short", day:"numeric" });
      ruler.appendChild(tick);
    }
    const leftover = totalDays % step;
    if (leftover) {
      const last = document.createElement("div");
      last.className = "tick";
      last.style.width = pxPerDay * leftover + "px";
      ruler.appendChild(last);
    }
    rulerRow.append(rulerLabel, ruler);
    scroll.appendChild(rulerRow);

    // rows
    pr.tasks.forEach((task) => {
      const row = document.createElement("div");
      row.className = "gantt-row";
      row.style.gridTemplateColumns = `${labelW}px ${innerWidth}px`;
      row.style.height = rowH + "px";

      const label = document.createElement("div");
      label.className = "gantt-label";
      label.textContent = task.title + (task.agent ? ` · ${task.agent}` : "");

      const track = document.createElement("div");
      track.className = "gantt-track";
      track.style.width = innerWidth + "px";
      track.style.height = (rowH - 6) + "px";

      const start = task.start;
      const end = task.end || task.start;
      const offsetDays = daysBetween(min, start);
      const spanDays = Math.max(1, daysBetween(start, end) + 1);

      const bar = document.createElement("div");
      bar.className = "gantt-bar";
      bar.style.left = offsetDays * pxPerDay + "px";
      bar.style.width = spanDays * pxPerDay + "px";

      const color = task.agent ? getAgentColor(task.agent) : "#3b82f6";
      bar.style.background = color;
      bar.classList.add(contrastClass(color));

      bar.title = `${task.title}\n${start}${end && end !== start ? " → " + end : ""}${task.agent ? "\nAgent: " + task.agent : ""}`;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = spanDays >= Math.ceil(60 / pxPerDay) ? task.title : "";
      bar.appendChild(labelSpan);

      track.appendChild(bar);
      row.append(label, track);
      scroll.appendChild(row);
    });

    // footer
    const foot = document.createElement("div"); foot.className = "small muted";
    const span = daysBetween(min, max) + 1;
    const fmt = (d) => new Date(parseDate(d)).toLocaleDateString(undefined, { month:"short", day:"numeric" });
    foot.textContent = `Timeline: ${fmt(min)} → ${fmt(max)} (${span} day${span>1?"s":""})`;

    card.appendChild(scroll);
    card.appendChild(foot);
    return card;
  }

  /* ---------- Export helpers ---------- */
  function downloadBlob(filename, data, type="text/plain;charset=utf-8"){
    const blob = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csvEscape(v){
    const s = (v==null ? "" : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }

  function formatICSDate(dateStr){
    const d = new Date(dateStr + "T00:00:00");
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    return `${y}${m}${da}`;
  }
  function addDays(dateStr, days){
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate()+days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function exportProjectJSON(pr){
    downloadBlob(`${pr.title || "project"}.json`, JSON.stringify(pr, null, 2), "application/json");
  }

  function exportProjectCSV(pr){
    const rows = [
      ["Project", pr.title || ""],
      ["Due", pr.dueDate || "", pr.dueTime || ""],
      [],
      ["Task Title","Start","End","Agent","Notes"]
    ];
    (pr.tasks || []).forEach(t=>{
      rows.push([t.title||"", t.start||"", t.end||t.start||"", t.agent||"", t.notes||""]);
    });
    const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\n");
    downloadBlob(`${pr.title || "project"}-tasks.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportProjectICS(pr){
    const NL = "\r\n";
    let ics = "BEGIN:VCALENDAR"+NL+
              "VERSION:2.0"+NL+
              "PRODID:-//PM Pilot//EN"+NL;

    const now = new Date();
    const dtstamp = now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");

    if (pr.dueDate){
      const dtstart = formatICSDate(pr.dueDate);
      const dtend   = formatICSDate(addDays(pr.dueDate, 1));
      ics += "BEGIN:VEVENT"+NL+
             `UID:${pr.id}@pmpilot`+NL+
             `DTSTAMP:${dtstamp}`+NL+
             `SUMMARY:${(pr.title||"Project Due").replace(/\r?\n/g," ")}`+NL+
             `DTSTART;VALUE=DATE:${dtstart}`+NL+
             `DTEND;VALUE=DATE:${dtend}`+NL+
             "END:VEVENT"+NL;
    }

    (pr.tasks||[]).forEach((t)=>{
      if (!t.start) return;
      const start = t.start;
      const end   = t.end || t.start;
      const dtstart = formatICSDate(start);
      const dtend   = formatICSDate(addDays(end, 1));
      const summary = `${t.title}${t.agent? " · "+t.agent : ""}`;
      const desc = (t.notes||"").replace(/\r?\n/g," ");
      ics += "BEGIN:VEVENT"+NL+
             `UID:${pr.id}.${t.id}@pmpilot`+NL+
             `DTSTAMP:${dtstamp}`+NL+
             `SUMMARY:${summary}`+NL+
             (desc ? `DESCRIPTION:${desc}`+NL : "")+
             `DTSTART;VALUE=DATE:${dtstart}`+NL+
             `DTEND;VALUE=DATE:${dtend}`+NL+
             "END:VEVENT"+NL;
    });

    ics += "END:VCALENDAR"+NL;
    downloadBlob(`${pr.title || "project"}.ics`, ics, "text/calendar;charset=utf-8");
  }

  async function exportProjectGanttPNG(pr){
    if (!pr.tasks || !pr.tasks.length){
      alert("No tasks to draw.");
      return;
    }
    let min=null, max=null;
    pr.tasks.forEach(t=>{ const s=t.start, e=t.end||t.start; if(!s) return; min = minDate(min, s); max = maxDate(max, e); });
    if(!min || !max){ alert("Tasks need start dates to draw Gantt."); return; }

    const totalDays = Math.max(1, daysBetween(min, max) + 1);
    const pxPerDay  = totalDays > 180 ? 10 : totalDays > 120 ? 12 : totalDays > 60 ? 18 : 28;

    const pad = 24, leftW = 240, rowH = 28, headH = 44, rulerH = 28, footH = 24;
    const innerW = totalDays * pxPerDay;
    const rows   = pr.tasks.length;
    let width  = pad + leftW + innerW + pad;
    let height = pad + headH + rulerH + rows*rowH + footH + pad;

    let scale = 1;
    const maxW = 10000;
    if (width > maxW) { scale = maxW / width; width = maxW; height = Math.round(height * scale); }

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width  = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr*scale, dpr*scale);

    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,width,height);
    ctx.translate(pad, pad);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(pr.title || "Project", 0, 20);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const sub = [];
    if (pr.dueDate) sub.push("Due: " + new Date(pr.dueDate + (pr.dueTime ? "T"+pr.dueTime:"T00:00"))
        .toLocaleString([], { dateStyle:"medium", timeStyle: pr.dueTime ? "short" : undefined }));
    if (pr.status) sub.push("Status: " + (pr.status==="complete"?"Complete":pr.status==="onhold"?"On Hold":"Active"));
    if (sub.length) ctx.fillText(sub.join(" · "), 0, 38);

    const startX = leftW;
    ctx.translate(0, headH);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    let step = 1; if (totalDays > 60) step = 7; if (totalDays > 120) step = 14;
    ctx.beginPath();
    for (let d = 0; d <= totalDays; d += step) {
      const x = startX + d * pxPerDay;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rulerH + rows*rowH);
    }
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    for (let d = 0; d < totalDays; d += step) {
      const dt = new Date(parseDate(min)); dt.setDate(dt.getDate() + d);
      const lbl = step === 1
        ? dt.toLocaleDateString(undefined, { month:"numeric", day:"numeric" })
        : dt.toLocaleDateString(undefined, { month:"short", day:"numeric" });
      const x = startX + d * pxPerDay + 4;
      ctx.fillText(lbl, x, 18);
    }

    const tasks = pr.tasks.slice();
    const rowsToDraw = tasks.filter(t=>t.start);
    ctx.translate(0, rulerH);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";

    rowsToDraw.forEach((t, idx)=>{
      const y = idx*rowH;
      ctx.fillStyle = "#0f172a";
      const label = t.title + (t.agent ? ` · ${t.agent}` : "");
      ctx.fillText(label, 0, y + 18);

      const offsetDays = daysBetween(min, t.start);
      const spanDays   = Math.max(1, daysBetween(t.start, (t.end||t.start)) + 1);
      const x = startX + offsetDays * pxPerDay;
      const w = spanDays * pxPerDay;
      const h = 18;

      const color = t.agent ? getAgentColor(t.agent) : "#3b82f6";
      ctx.fillStyle = color;
      ctx.strokeStyle = "#0f172a15";
      ctx.lineWidth = 1;

      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x+r, y+4);
      ctx.lineTo(x+w-r, y+4);
      ctx.quadraticCurveTo(x+w, y+4, x+w, y+4+r);
      ctx.lineTo(x+w, y+4+h-r);
      ctx.quadraticCurveTo(x+w, y+4+h, x+w-r, y+4+h);
      ctx.lineTo(x+r, y+4+h);
      ctx.quadraticCurveTo(x, y+4+h, x, y+4+h-r);
      ctx.lineTo(x, y+4+r);
      ctx.quadraticCurveTo(x, y+4, x+r, y+4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (w >= 60){
        const darkText = hexBrightness(color) <= 150;
        ctx.fillStyle = darkText ? "#ffffff" : "#111111";
        ctx.fillText(t.title, x+8, y+18);
      }
    });

    ctx.translate(0, rowsToDraw.length * rowH);
    ctx.fillStyle = "#64748b";
    const span = daysBetween(min, max) + 1;
    const fmt = (d) => new Date(parseDate(d)).toLocaleDateString(undefined, { month:"short", day:"numeric" });
    ctx.fillText(`Timeline: ${fmt(min)} → ${fmt(max)} (${span} day${span>1?"s":""})`, 0, 16);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pr.title || "project"}-gantt.png`;
    a.click();
  }

  /* ---------- Task Modal (create / edit) ---------- */
  function populateAgentSelect() {
    const agents = readAgents();
    tAgent.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = ""; optNone.textContent = "Unassigned";
    tAgent.appendChild(optNone);
    agents.forEach(({name}) => {
      const o = document.createElement("option");
      o.value = name; o.textContent = name;
      tAgent.appendChild(o);
    });
  }

  function openTaskModal(projectId, task = null) {
    currentProjectId = projectId;
    tId.value = task ? task.id : "";
    taskTitleLabel.textContent = task ? "Edit Task" : "New Task";
    tTitle.value = task?.title || "";
    tNotes.value = task?.notes || "";
    tStart.value = task?.start || "";
    tEnd.value = task?.end || "";
    populateAgentSelect();
    if (task?.agent && ![...tAgent.options].some((o) => o.value === task.agent)) {
      const opt = document.createElement("option"); opt.value = task.agent; opt.textContent = task.agent; tAgent.appendChild(opt);
    }
    tAgent.value = task?.agent || "";
    showDialog(tDlg);
    setTimeout(() => tTitle.focus(), 50);
  }

  function saveTaskSubmit(e) {
    e.preventDefault();
    try {
      const title = (tTitle.value || "").trim();
      const start = tStart.value;
      if (!title) { alert("Please enter a task title."); return; }
      if (!start) { alert("Please choose a start date."); return; }

      let end = tEnd.value || start;
      if (parseDate(end) < parseDate(start)) end = start;

      const pr = findProject(currentProjectId);
      if (!pr) { alert("Project not found."); closeDialog(tDlg); return; }

      const editingId = tId.value;
      if (editingId) {
        const i = pr.tasks.findIndex((x) => x.id === editingId);
        if (i > -1) {
          pr.tasks[i] = { ...pr.tasks[i], title, notes:(tNotes.value||"").trim(), start, end, agent:tAgent.value || "" };
        }
      } else {
        pr.tasks = Array.isArray(pr.tasks) ? pr.tasks : [];
        pr.tasks.push({ id: uid(), title, notes:(tNotes.value||"").trim(), start, end, agent:tAgent.value || "" });
      }

      pr.tasks.sort((a,b)=> a.start===b.start ? a.title.localeCompare(b.title) : a.start.localeCompare(b.start));
      saveProject(pr);

      tId.value = "";
      closeDialog(tDlg);
      renderProjectDetail(pr.id);
      renderNoticePanel();
    } catch (err) {
      console.error(err);
      alert("Could not save the task. See console for details.");
    }
  }

  /* ---------- Gantt modal: resizable + zoom ---------- */
  let ganttZoom = Number(localStorage.getItem("pm_gantt_zoom") || 1);
  let ganttSize = (() => {
    try { return JSON.parse(localStorage.getItem("pm_gantt_size") || "{}"); }
    catch { return {}; }
  })();
  let ganttResizeObserver;

  function renderGanttInto(container, pr){
    container.innerHTML = "";
    container.appendChild(buildGantt(pr, { rowH:34, labelW:260, zoom: ganttZoom }));
  }

  function openGanttModal(projectId){
    const pr = findProject(projectId);
    if(!pr) return;

    const dlg  = $("ganttDialog");
    const ttl  = $("ganttTitle");
    const full = $("ganttFull");

    ttl.textContent = `${pr.title} — Gantt`;
    renderGanttInto(full, pr);
    showDialog(dlg);

    // Apply resizable behavior + saved size
    const card = document.querySelector("#ganttDialog .modal-card.wide") || document.querySelector("#ganttDialog .modal-card");
    if (card){
      Object.assign(card.style, {
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        resize: "both",
        minWidth: "520px",
        minHeight: "360px",
        maxWidth: "95vw",
        maxHeight: "95vh"
      });

      if (ganttSize && ganttSize.w && ganttSize.h){
        card.style.width  = ganttSize.w + "px";
        card.style.height = ganttSize.h + "px";
      } else {
        card.style.width  = "80vw";
        card.style.height = "80vh";
      }

      if (window.ResizeObserver){
        ganttResizeObserver?.disconnect?.();
        ganttResizeObserver = new ResizeObserver((entries)=>{
          const cr = entries[0]?.contentRect;
          if (!cr) return;
          ganttSize = { w: Math.round(cr.width), h: Math.round(cr.height) };
          localStorage.setItem("pm_gantt_size", JSON.stringify(ganttSize));
        });
        ganttResizeObserver.observe(card);
      }
    }
  }

  // modal buttons
  $("ganttClose")?.addEventListener("click", ()=>{
    ganttResizeObserver?.disconnect?.();
    closeDialog($("ganttDialog"));
  });
  $("ganttZoomIn")?.addEventListener("click", ()=>{
    ganttZoom = Math.min(4, +(ganttZoom + 0.2).toFixed(2));
    localStorage.setItem("pm_gantt_zoom", ganttZoom);
    const pr = findProject(currentProjectId); if(pr) renderGanttInto($("ganttFull"), pr);
  });
  $("ganttZoomOut")?.addEventListener("click", ()=>{
    ganttZoom = Math.max(0.4, +(ganttZoom - 0.2).toFixed(2));
    localStorage.setItem("pm_gantt_zoom", ganttZoom);
    const pr = findProject(currentProjectId); if(pr) renderGanttInto($("ganttFull"), pr);
  });
  $("ganttZoomFit")?.addEventListener("click", ()=>{
    ganttZoom = 1;
    localStorage.setItem("pm_gantt_zoom", ganttZoom);

    const card = document.querySelector("#ganttDialog .modal-card.wide") ||
                 document.querySelector("#ganttDialog .modal-card");
    if (card){
      card.style.setProperty("width",  "80vw", "important");
      card.style.setProperty("height", "80vh", "important");
    }
    localStorage.removeItem("pm_gantt_size");

    const pr = findProject(currentProjectId);
    if(pr) renderGanttInto($("ganttFull"), pr);
  });

  /* ---------- Wire up ---------- */
  function goHome(){
    noticePanel?.setAttribute?.("hidden","");
    noticeToggle?.setAttribute?.("aria-expanded","false");
    renderProjectsList("active");
    addBar.hidden = false;
  }
  brandHome?.addEventListener("click", goHome);
  brandHome?.addEventListener("keydown", (e)=> {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); }
  });

  addProjectBtn.addEventListener("click", openProjectModal);

  pForm.addEventListener("submit", saveProjectSubmit);
  projectSaveBtn.addEventListener("click", (e) => { e.preventDefault(); saveProjectSubmit(e); });
  cancelProject.addEventListener("click", () => closeDialog(pDlg));

  tForm.addEventListener("submit", saveTaskSubmit);
  taskSaveBtn.addEventListener("click", (e) => { e.preventDefault(); saveTaskSubmit(e); });
  cancelTask.addEventListener("click", () => closeDialog(tDlg));

  // Notices toggle
  if (noticeToggle && noticePanel) {
    noticeToggle.addEventListener("click", () => {
      const isOpen = noticePanel.hidden === false;
      noticePanel.hidden = isOpen;
      noticeToggle.setAttribute("aria-expanded", String(!isOpen));
    });
    document.addEventListener("click", (e) => {
      if (noticePanel.hidden) return;
      const within = noticePanel.contains(e.target) || noticeToggle.contains(e.target);
      if (!within) { noticePanel.hidden = true; noticeToggle.setAttribute("aria-expanded", "false"); }
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !noticePanel.hidden) {
        noticePanel.hidden = true;
        noticeToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---- Auth wiring ----
  if (authOverlay){
    setupForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const p1 = (setupPass1.value || "").trim();
      const p2 = (setupPass2.value || "").trim();
      if (p1.length < 6) { alert("Passcode must be at least 6 characters."); return; }
      if (p1 !== p2)   { alert("Passcodes do not match."); return; }
      setPassHash(await sha256Hex(p1));
      setupPass1.value = setupPass2.value = "";
      hideAuth();
    });

    unlockForm?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const ok = (await sha256Hex(unlockPass.value || "")) === getPassHash();
      if (ok) { unlockPass.value = ""; unlockMsg.textContent = ""; hideAuth(); }
      else    { unlockMsg.textContent = "Incorrect passcode."; }
    });

    authReset?.addEventListener("click", ()=>{
      if(!confirm("Reset the passcode? You will need to set a new one.")) return;
      clearPassHash(); unlockPass.value = ""; unlockMsg.textContent = ""; showAuth();
    });

    lockBtn?.addEventListener("click", showAuth);
  }

  /* ---------- Idle activity listeners ---------- */
  ["click","keydown","mousemove","wheel","touchstart","scroll"].forEach(ev=>{
    window.addEventListener(ev, () => resetIdleTimer(), {passive:true});
  });
  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden) resetIdleTimer();
  });

  /* ---------- Initial paint ---------- */
  function updateClock() {
    if (!clockBar) return;
    const now = new Date();
    const date = now.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" });
    const time = now.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    clockBar.textContent = `${date} • ${time}`;
  }
  updateClock();
  renderAgents();
  renderProjectsList();
  renderNoticePanel();
  showAuth();
  resetIdleTimer(); // start idle timer once app is up

  /* ---------- Timers ---------- */
  setInterval(updateClock, 1000);
  setInterval(renderNoticePanel, 60000);
})(); // end IIFE
