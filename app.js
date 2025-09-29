async function loadData(){
  const res = await fetch('data/sample.json');
  const data = await res.json();

  // KPIs (replace with your logic)
  document.getElementById('kpi-open').textContent   = data.kpis.open;
  document.getElementById('kpi-closed').textContent = data.kpis.closed30d;
  document.getElementById('kpi-avg').textContent    = data.kpis.avgHours;
  document.getElementById('kpi-sla').textContent    = data.kpis.slaPct + '%';

  // Line chart
  new Chart(document.getElementById('ticketsByDay'), {
    type: 'line',
    data: {
      labels: data.trends.labels,
      datasets: [{
        label: 'Tickets per day',
        data: data.trends.values,
        tension: 0.25,
        fill: false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Doughnut chart
  new Chart(document.getElementById('categoryBreakdown'), {
    type: 'doughnut',
    data: {
      labels: data.categories.labels,
      datasets: [{ data: data.categories.values }]
    },
    options: { responsive: true }
  });

  // Table
  const tbody = document.getElementById('tickets-body');
  tbody.innerHTML = data.tickets.slice(0,20).map(t => `
    <tr class="border-b last:border-0">
      <td class="py-2 px-3 font-mono">${t.id}</td>
      <td class="py-2 px-3">${t.title}</td>
      <td class="py-2 px-3">${t.category}</td>
      <td class="py-2 px-3">${t.status}</td>
      <td class="py-2 px-3">${t.created}</td>
    </tr>
  `).join('');
}

document.getElementById('year').textContent = new Date().getFullYear();
loadData();
