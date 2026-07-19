// State management
let activeTable = null;
let activeSessionId = null;
let databaseTables = [];
let currentOverviewData = null;
let currentChartInstance = null;

// Professional high-contrast chart palette for better readability
const CHART_COLORS = ['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#64748b'];

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const progressBar = document.getElementById('progress-bar');
const uploadStatus = document.getElementById('upload-status');
const tablesListContainer = document.getElementById('tables-list-container');
const refreshTablesBtn = document.getElementById('refresh-tables-btn');
const schemaCard = document.getElementById('schema-card');
const schemaTableTitle = document.getElementById('schema-table-title');
const schemaColumnsContainer = document.getElementById('schema-columns-container');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const querySuggestions = document.getElementById('query-suggestions');
const chipsWrapper = document.getElementById('chips-wrapper');

// Setup Toast Container
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

// Chat Sidebar Elements
const newChatBtn = document.getElementById('new-chat-btn');
const chatSessionsList = document.getElementById('chat-sessions-list');
const chatModeSelect = document.getElementById('chat-mode-select');

// Tab Navigation Elements
const tabBtnDashboard = document.getElementById('header-nav-dashboard');
const tabBtnChat = document.getElementById('header-nav-chat');
const headerViewToggle = document.getElementById('header-view-toggle');
const workspaceDashboard = document.getElementById('workspace-dashboard');
const workspaceChat = document.getElementById('workspace-chat');
const dashboardEmptyState = document.getElementById('dashboard-empty-state');
const dashboardLayout = document.getElementById('dashboard-layout');

// KPI & Dashboard Elements
const kpiRows = document.getElementById('kpi-rows');
const kpiCols = document.getElementById('kpi-cols');
const chartColSelect = document.getElementById('chart-col-select');
const statsSummaryBody = document.getElementById('stats-summary-body');
const previewDataThead = document.getElementById('preview-data-thead');
const previewDataTbody = document.getElementById('preview-data-tbody');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Landing Page launch
    const launchBtn = document.getElementById('launch-workspace-btn');
    const landingPage = document.getElementById('landing-page');
    const appContainer = document.getElementById('app-container');

    const launchWorkspace = () => {
        if (landingPage) landingPage.style.display = 'none';
        if (appContainer) {
            appContainer.style.display = 'flex';
            setTimeout(() => appContainer.classList.add('visible'), 30);
        }
        localStorage.setItem('workspace_launched', 'true');
    };

    if (localStorage.getItem('workspace_launched') === 'true') {
        launchWorkspace();
    }

    if (launchBtn) {
        launchBtn.addEventListener('click', launchWorkspace);
    }

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            if (appContainer) {
                appContainer.classList.remove('visible');
                setTimeout(() => {
                    appContainer.style.display = 'none';
                    if (landingPage) landingPage.style.display = 'flex';
                }, 200); // Wait for transition
            }
            localStorage.removeItem('workspace_launched');
        });
    }

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const leftPanel = document.getElementById('left-panel');
    if (sidebarToggle && leftPanel) {
        // Restore saved state
        const savedState = localStorage.getItem('sidebar-collapsed');
        if (savedState === 'true') {
            leftPanel.classList.add('collapsed');
        }

        sidebarToggle.addEventListener('click', () => {
            leftPanel.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', leftPanel.classList.contains('collapsed'));
        });
    }

    // Workspace Tabs
    if (tabBtnDashboard && tabBtnChat) {
        tabBtnDashboard.addEventListener('click', () => switchWorkspaceTab('dashboard'));
        tabBtnChat.addEventListener('click', () => switchWorkspaceTab('chat'));
    }

    // Chart column change
    if (chartColSelect) {
        chartColSelect.addEventListener('change', (e) => {
            renderDashboardChart(e.target.value);
        });
    }

    // Chat Sidebar events
    if (newChatBtn) {
        newChatBtn.addEventListener('click', createNewChatSession);
    }

    loadTables().then(() => {
        const savedTable = localStorage.getItem('activeTable');
        if (savedTable && databaseTables.includes(savedTable)) {
            selectDatabaseTable(savedTable);
        }
    });

    // Chat Sidebar Collapse Logic
    const hideChatSidebarBtn = document.getElementById('hide-chat-sidebar-btn');
    const showChatSidebarBtn = document.getElementById('show-chat-sidebar-btn');
    const chatSidebar = document.getElementById('chat-sidebar');
    
    if (hideChatSidebarBtn && showChatSidebarBtn && chatSidebar) {
        hideChatSidebarBtn.addEventListener('click', () => {
            chatSidebar.style.marginLeft = '-250px';
            chatSidebar.style.opacity = '0';
            chatSidebar.style.pointerEvents = 'none';
            setTimeout(() => {
                chatSidebar.style.display = 'none';
                showChatSidebarBtn.style.display = 'flex';
            }, 300);
        });
        
        showChatSidebarBtn.addEventListener('click', () => {
            showChatSidebarBtn.style.display = 'none';
            chatSidebar.style.display = 'flex';
            // Force reflow
            void chatSidebar.offsetWidth;
            chatSidebar.style.marginLeft = '0';
            chatSidebar.style.opacity = '1';
            chatSidebar.style.pointerEvents = 'auto';
        });
    }

    const savedTab = localStorage.getItem('activeTab') || 'dashboard';
    switchWorkspaceTab(savedTab);

    setupUploadHandlers();
    setupChatHandler();
    
    if (refreshTablesBtn) {
        refreshTablesBtn.addEventListener('click', loadTables);
    }
});

// Switch tabs
function switchWorkspaceTab(tabName) {
    localStorage.setItem('activeTab', tabName);
    if (tabName === 'dashboard') {
        if (tabBtnDashboard) tabBtnDashboard.classList.add('active');
        if (tabBtnChat) tabBtnChat.classList.remove('active');
        if (workspaceDashboard) {
            workspaceDashboard.style.display = 'flex';
            workspaceDashboard.classList.add('active');
            
            // Force ApexCharts to recalculate dimensions since the container was hidden
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
        }
        if (workspaceChat) {
            workspaceChat.style.display = 'none';
            workspaceChat.classList.remove('active');
        }
    } else {
        if (tabBtnChat) tabBtnChat.classList.add('active');
        if (tabBtnDashboard) tabBtnDashboard.classList.remove('active');
        if (workspaceChat) {
            workspaceChat.style.display = 'flex';
            workspaceChat.classList.add('active');
        }
        if (workspaceDashboard) {
            workspaceDashboard.style.display = 'none';
            workspaceDashboard.classList.remove('active');
        }
        scrollToBottom();
    }
}

// File Upload
function setupUploadHandlers() {
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileUpload(files[0]);
    });
}

async function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
        alert("Only CSV files are supported.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    uploadProgressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    uploadStatus.textContent = 'Uploading...';

    let progress = 10;
    const progressInterval = setInterval(() => {
        if (progress < 85) {
            progress += 5;
            progressBar.style.width = `${progress}%`;
        }
    }, 150);

    try {
        const response = await fetch("/upload", { method: "POST", body: formData });
        clearInterval(progressInterval);
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Upload failed");
        }

        const data = await response.json();
        progressBar.style.width = '100%';
        uploadStatus.textContent = 'Done.';
        
        setTimeout(() => { uploadProgressContainer.style.display = 'none'; }, 1500);

        await loadTables();
        selectDatabaseTable(data.data.table_name);
        appendSystemMessage(`Imported <strong>${data.data.table_name}</strong> â€” ${data.data.row_count} rows loaded.`);

    } catch (error) {
        clearInterval(progressInterval);
        progressBar.style.width = '0%';
        uploadStatus.textContent = 'Failed.';
        alert(`Error: ${error.message}`);
    }
}

// Load Tables
async function loadTables() {
    const statusText = document.querySelector('.status-text');
    const indicator = document.querySelector('.status-indicator');
    
    if (indicator && statusText) {
        indicator.className = 'status-indicator loading';
        statusText.textContent = "Syncing...";
    }

    try {
        const response = await fetch("/tables");
        if (!response.ok) throw new Error("Could not fetch tables");
        const data = await response.json();
        
        databaseTables = data.tables;
        renderTablesList();

        if (indicator && statusText) {
            indicator.className = 'status-indicator online';
            statusText.textContent = "Connected";
        }
    } catch (error) {
        console.error("Failed to load tables", error);
        tablesListContainer.innerHTML = `<div class="empty-state"><p>Connection error.</p></div>`;
        if (indicator && statusText) {
            indicator.className = 'status-indicator';
            statusText.textContent = "Offline";
        }
    }
}

function renderTablesList() {
    if (databaseTables.length === 0) {
        tablesListContainer.innerHTML = `<div class="empty-state"><p>No tables loaded.</p></div>`;
        return;
    }

    tablesListContainer.innerHTML = '';
    databaseTables.forEach(tableName => {
        const item = document.createElement('div');
        item.className = 'table-item';
        if (activeTable === tableName) item.classList.add('active');

        item.innerHTML = `
            <div class="table-info">
                <i class="fa-solid fa-table"></i>
                <span class="table-name">${tableName}</span>
            </div>
            <i class="fa-solid fa-trash table-delete-btn" style="color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 12px; transition: color 0.2s;"></i>
        `;

        const deleteBtn = item.querySelector('.table-delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const res = await fetch(`/tables/${tableName}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Failed to delete table");
                showToast(`Dataset '${tableName}' deleted.`, "success");
                if (activeTable === tableName) {
                    activeTable = null;
                    localStorage.removeItem('activeTable');
                    chatSessionsList.innerHTML = '';
                    chatMessages.innerHTML = '';
                    chatInput.disabled = true;
                    sendBtn.disabled = true;
                    headerViewToggle.style.display = 'none';
                    document.getElementById('schema-card').style.display = 'none';
                }
                await loadTables();
            } catch (err) {
                console.error(err);
                showToast("Error deleting dataset.", "error");
            }
        });

        item.addEventListener('click', () => {
            selectDatabaseTable(tableName);
        });
        tablesListContainer.appendChild(item);
    });
}

// Select table
async function selectDatabaseTable(tableName) {
    if (activeTable !== tableName) {
        activeTable = tableName;
        localStorage.setItem('activeTable', tableName);
        await loadChatSessions(tableName);
    }
    
    activeTable = tableName;
    localStorage.setItem('activeTable', tableName);
    
    const items = tablesListContainer.querySelectorAll('.table-item');
    items.forEach(item => {
        const nameText = item.querySelector('.table-name').textContent;
        item.classList.toggle('active', nameText === tableName);
    });

    if (headerViewToggle) {
        headerViewToggle.style.display = 'flex';
    }

    chatInput.disabled = false;
    chatInput.placeholder = `Query ${tableName}...`;
    sendBtn.disabled = false;

    // Load Schema
    try {
        const response = await fetch(`/tables/${tableName}/schema`);
        if (!response.ok) throw new Error("Could not load schema");
        const data = await response.json();
        renderSchemaDetails(data.columns);
        renderSuggestions(tableName, data.columns);
    } catch (error) {
        console.error("Failed to load schema", error);
    }

    // Load Dashboard
    try {
        const response = await fetch(`/tables/${tableName}/overview`);
        if (!response.ok) throw new Error("Could not load overview");
        const data = await response.json();
        currentOverviewData = data;
        renderDashboardView();
        switchWorkspaceTab('dashboard');
    } catch (error) {
        console.error("Failed to load dashboard", error);
    }
}

// ----------------- SCHEMA & EDA -----------------
function renderSchemaDetails(columns) {
    schemaCard.style.display = 'block';
    schemaTableTitle.textContent = `SCHEMA: ${activeTable}`;
    
    schemaColumnsContainer.innerHTML = '';
    columns.forEach(col => {
        const pill = document.createElement('div');
        pill.className = 'column-pill';
        pill.innerHTML = `${col.name} <span>${col.type}</span>`;
        schemaColumnsContainer.appendChild(pill);
    });
}

function renderSuggestions(tableName, columns) {
    querySuggestions.style.display = 'flex';
    chipsWrapper.innerHTML = '';

    const suggestions = [];
    suggestions.push(`Show the first 5 rows of ${tableName}`);

    const numericCols = columns.filter(c => {
        const t = c.type.toLowerCase();
        return t.includes('int') || t.includes('float') || t.includes('double') || t.includes('numeric');
    }).map(c => c.name);

    const textCols = columns.filter(c => {
        const t = c.type.toLowerCase();
        return t.includes('varchar') || t.includes('text') || t.includes('string');
    }).map(c => c.name);

    if (numericCols.length > 0) suggestions.push(`What is the average ${numericCols[0]}?`);
    if (textCols.length > 0 && numericCols.length > 0) {
        suggestions.push(`Sum of ${numericCols[0]} grouped by ${textCols[0]}`);
    } else if (textCols.length > 0) {
        suggestions.push(`Count records grouped by ${textCols[0]}`);
    }

    const colNames = columns.map(c => c.name);
    if (colNames.includes('survived') && colNames.includes('sex')) suggestions.push(`Survival rate by gender`);
    if (colNames.includes('fare') && colNames.includes('pclass')) suggestions.push(`Average fare by passenger class`);

    suggestions.forEach(q => {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = q;
        chip.addEventListener('click', () => {
            chatInput.value = q;
            switchWorkspaceTab('chat');
            chatForm.dispatchEvent(new Event('submit'));
        });
        chipsWrapper.appendChild(chip);
    });
}

// Dashboard
function renderDashboardView() {
    if (!currentOverviewData) return;

    dashboardEmptyState.style.display = 'none';
    dashboardLayout.style.display = 'block';

    // 1. KPI Box
    const kpiRows = document.getElementById('kpi-rows');
    const kpiCols = document.getElementById('kpi-cols');
    const kpiTable = document.getElementById('kpi-table');
    if (kpiRows) kpiRows.textContent = currentOverviewData.row_count.toLocaleString();
    if (kpiCols) kpiCols.textContent = currentOverviewData.column_count.toLocaleString();
    if (kpiTable) kpiTable.textContent = activeTable;

    // 2. Dynamic Power BI Style Charts
    const edaContainer = document.getElementById('eda-charts-container');
    if (edaContainer) {
        edaContainer.innerHTML = '';
        let chartCount = 0;

        // Categorical Donut Charts (Max 3)
        if (currentOverviewData.categorical_summary) {
            for (const [colName, data] of Object.entries(currentOverviewData.categorical_summary)) {
                if (chartCount >= 3 || data.length === 0) continue;
                
                const box = document.createElement('div');
                box.className = 'dashboard-report-card';
                box.style = "min-height: 220px; display: flex; flex-direction: column; overflow: hidden; justify-content: space-between;";
                box.innerHTML = `<div style="font-family: var(--mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; text-align: center;">${colName} Distribution</div>`;
                
                const chartDiv = document.createElement('div');
                const chartId = 'eda-cat-' + chartCount;
                chartDiv.id = chartId;
                chartDiv.style.flex = "1";
                box.appendChild(chartDiv);
                edaContainer.appendChild(box);
                
                const series = data.map(d => d.count);
                const labels = data.map(d => String(d.value).substring(0, 15) || 'Unknown');
                
                new ApexCharts(chartDiv, {
                    chart: { type: 'donut', height: 160, background: 'transparent', parentHeightOffset: 0, toolbar: {show: false} },
                    series: series,
                    labels: labels,
                    theme: { mode: 'dark' },
                    stroke: { width: 1, colors: ['#09090b'] },
                    dataLabels: { enabled: false },
                    legend: { show: false },
                    tooltip: { theme: 'dark', style: { fontFamily: 'var(--mono)' } },
                    plotOptions: { pie: { donut: { size: '70%' } } },
                    colors: CHART_COLORS
                }).render();
                
                chartCount++;
            }
        }
        
        // Numeric Summary Bar Chart (1 Chart for top 5 numeric averages, filtering out IDs/Codes to avoid scaling issue)
        if (currentOverviewData.numeric_summary && currentOverviewData.numeric_summary.length > 0) {
            let topNumerics = currentOverviewData.numeric_summary.filter(n => {
                const colLower = n.column.toLowerCase();
                return !colLower.includes('id') && !colLower.includes('zip') && !colLower.includes('code') && !colLower.includes('lat') && !colLower.includes('long') && !colLower.includes('phone') && !colLower.includes('year') && !colLower.includes('post');
            });
            if (topNumerics.length === 0) {
                topNumerics = currentOverviewData.numeric_summary;
            }
            topNumerics = topNumerics.slice(0, 5);
            
            const box = document.createElement('div');
            box.className = 'dashboard-report-card';
            box.style = "min-height: 220px; display: flex; flex-direction: column; overflow: hidden; justify-content: space-between;";
            box.innerHTML = `<div style="font-family: var(--mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; text-align: center;">Average Values</div>`;
            
            const chartDiv = document.createElement('div');
            chartDiv.id = 'eda-num-chart';
            chartDiv.style.flex = "1";
            box.appendChild(chartDiv);
            edaContainer.appendChild(box);
            
            const categories = topNumerics.map(n => n.column);
            const seriesData = topNumerics.map(n => n.avg || 0);
            
            new ApexCharts(chartDiv, {
                chart: { type: 'bar', height: 160, background: 'transparent', parentHeightOffset: 0, toolbar: {show: false} },
                series: [{ name: 'Avg', data: seriesData }],
                xaxis: { categories: categories, labels: { style: { colors: '#71717a', fontSize: '9px', fontFamily: 'var(--mono)' } }, axisBorder: {show: false}, axisTicks: {show: false} },
                yaxis: { labels: { show: false } },
                grid: { show: false },
                theme: { mode: 'dark' },
                dataLabels: { enabled: true, style: { fontSize: '9px', fontFamily: 'var(--mono)', colors: ['var(--text)'] }, offsetY: -20, background: { enabled: false } },
                plotOptions: { bar: { borderRadius: 4, distributed: true, columnWidth: '40%', dataLabels: { position: 'top' } } },
                legend: { show: false },
                tooltip: { theme: 'dark', style: { fontFamily: 'var(--mono)' } },
                colors: CHART_COLORS
            }).render();
        }
    }

    // 3. Preview Table
    const previewDataThead = document.getElementById('preview-data-thead');
    const previewDataTbody = document.getElementById('preview-data-tbody');
    
    if (previewDataThead && previewDataTbody) {
        previewDataThead.innerHTML = '';
        previewDataTbody.innerHTML = '';
        if (currentOverviewData.preview_rows && currentOverviewData.preview_rows.length > 0) {
            const headers = Object.keys(currentOverviewData.preview_rows[0]);
            const headerRow = document.createElement('tr');
            headers.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                headerRow.appendChild(th);
            });
            previewDataThead.appendChild(headerRow);

            currentOverviewData.preview_rows.forEach(row => {
                const tr = document.createElement('tr');
                headers.forEach(h => {
                    const td = document.createElement('td');
                    td.textContent = row[h] !== null ? row[h] : '—';
                    tr.appendChild(td);
                });
                previewDataTbody.appendChild(tr);
            });
        }
    }

    // 4. Pinned Insights
    renderPinnedInsights();
}

function renderPinnedInsights() {
    const container = document.getElementById('pinned-insights-grid');
    if (!container) return;
    
    const storageKey = `pinned_insights_${activeTable}`;
    let pinned = [];
    try {
        pinned = JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch(e) {
        pinned = [];
    }
    
    if (pinned.length === 0) {
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.01); border: 1px dashed var(--border); border-radius: 8px; padding: 32px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 140px; grid-column: 1 / -1;">
                <i class="fa-solid fa-thumbtack" style="font-size: 20px; color: var(--text-muted); opacity: 0.4;"></i>
                <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">No Pinned Insights</div>
                <div style="font-size: 11px; color: var(--text-muted); max-width: 250px;">Ask questions in the SQL Chat tab and pin visual charts to build your dynamic dashboard.</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    pinned.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'dashboard-report-card';
        card.style = 'background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;';
        
        const cardHeader = document.createElement('div');
        cardHeader.style = 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px;';
        cardHeader.innerHTML = `
            <div style="display:flex; flex-direction:column; max-width:85%;">
                <strong style="font-size: 12px; font-family: var(--mono); color: var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.question}</strong>
            </div>
            <button class="remove-pin-btn" data-index="${idx}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:11px;" title="Remove Pin">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        card.appendChild(cardHeader);
        
        if (item.explanation) {
            const exp = document.createElement('div');
            exp.style = 'font-size: 11px; color: var(--text-secondary); line-height: 1.4; max-height: 50px; overflow: hidden; text-overflow: ellipsis;';
            exp.textContent = item.explanation.substring(0, 120) + (item.explanation.length > 120 ? '...' : '');
            card.appendChild(exp);
        }
        
        const vizId = 'pinned-viz-' + Date.now() + '-' + idx;
        const chartDiv = document.createElement('div');
        chartDiv.id = vizId;
        chartDiv.style = 'min-height: 180px; width: 100%;';
        card.appendChild(chartDiv);
        
        container.appendChild(card);
        
        const removeBtn = card.querySelector('.remove-pin-btn');
        removeBtn.onclick = () => {
            pinned.splice(idx, 1);
            localStorage.setItem(storageKey, JSON.stringify(pinned));
            renderPinnedInsights();
            showToast("Pinned insight removed.", "success");
        };
        
        setTimeout(() => {
            if (item.results) {
                const chartData = analyzeResultsForChart(item.results, item.chartType || 'auto');
                if (chartData) {
                    renderInlineChatChart(vizId, chartData, item.chartType || 'auto', false);
                } else {
                    chartDiv.innerHTML = '<p style="color:var(--text-muted); font-size:10px; text-align:center; padding-top:40px;">Data summary table in SQL Chat.</p>';
                }
            }
        }, 100);
    });
}

// Chat Sessions Management
async function loadChatSessions(tableName) {
    try {
        const res = await fetch(`/tables/${tableName}/chats`);
        if (!res.ok) throw new Error("Failed to load chats");
        const sessions = await res.json();
        
        renderChatSessionsList(sessions);
        
        if (sessions.length > 0) {
            await loadChatHistory(sessions[0].id);
        } else {
            createNewChatSession();
        }
    } catch (e) {
        console.error(e);
    }
}

function renderChatSessionsList(sessions) {
    chatSessionsList.innerHTML = '';
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'chat-session-item';
        if (session.id === activeSessionId) item.classList.add('active');
        
        item.innerHTML = `
            <span class="chat-session-title">${session.title}</span>
            <i class="fa-solid fa-trash chat-session-delete"></i>
        `;
        
        const deleteBtn = item.querySelector('.chat-session-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChatSession(session.id, item);
        });
        
        item.addEventListener('click', () => {
            loadChatHistory(session.id);
        });
        
        chatSessionsList.appendChild(item);
    });
}

function createNewChatSession() {
    activeSessionId = null;
    
    // Update UI active states
    const items = chatSessionsList.querySelectorAll('.chat-session-item');
    items.forEach(item => item.classList.remove('active'));
    
    chatMessages.innerHTML = `
        <div class="message assistant-message first-message">
            <div class="msg-avatar">AI</div>
            <div class="msg-bubble">
                <p>Ready. Selected table <strong>${activeTable}</strong>. Ask analytical questions to start a new chat.</p>
            </div>
        </div>
    `;
    scrollToBottom();
}

async function loadChatHistory(sessionId) {
    activeSessionId = sessionId;
    
    // Update UI active states
    const items = chatSessionsList.querySelectorAll('.chat-session-item');
    items.forEach(item => item.classList.remove('active'));
    // We re-render active state visually later if needed, but it's easier to just re-fetch or find the right one.
    loadChatSessionsQuietly(); // Refresh list to get proper active state
    
    chatMessages.innerHTML = '';
    chatInput.disabled = true;
    
    try {
        const res = await fetch(`/chats/${sessionId}`);
        if (!res.ok) throw new Error("Failed to load history");
        const data = await res.json();
        
        if (data.history.length === 0) {
            createNewChatSession();
            return;
        }
        
        data.history.forEach(msg => {
            if (msg.role === 'user') {
                appendMessage('user', msg.content);
            } else {
                appendChatResult({
                    sql: msg.sql,
                    results: msg.results,
                    explanation: msg.explanation,
                    question: "auto" // Used for chart detection fallback
                }, false);
            }
        });
    } catch (e) {
        console.error(e);
        appendMessage('assistant', "<strong>Error loading history</strong>");
    } finally {
        chatInput.disabled = false;
        scrollToBottom();
    }
}

async function loadChatSessionsQuietly() {
    if (!activeTable) return;
    try {
        const res = await fetch(`/tables/${activeTable}/chats`);
        if (res.ok) {
            const sessions = await res.json();
            renderChatSessionsList(sessions);
        }
    } catch (e) {}
}

async function deleteChatSession(sessionId, element) {
    try {
        await fetch(`/chats/${sessionId}`, { method: 'DELETE' });
        element.remove();
        if (activeSessionId === sessionId) {
            createNewChatSession();
            loadChatSessionsQuietly();
        }
    } catch (e) {
        console.error("Failed to delete chat", e);
    }
}

// Chat Handler
function setupChatHandler() {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = chatInput.value.trim();
        if (!question) return;

        appendMessage('user', question);
        chatInput.value = '';
        const typingMsgId = appendTypingIndicator();
        chatInput.disabled = true;
        sendBtn.disabled = true;

        try {
            const payload = { 
                question: question, 
                table_name: activeTable,
                mode: chatModeSelect ? chatModeSelect.value : 'analysis'
            };
            if (activeSessionId) payload.session_id = activeSessionId;
            
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            removeTypingIndicator(typingMsgId);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Query failed");
            }

            const data = await response.json();
            
            if (data.session_id && activeSessionId !== data.session_id) {
                activeSessionId = data.session_id;
                loadChatSessionsQuietly();
            }
            
            if (data.error) {
                appendMessage('assistant', `<strong>Error:</strong> ${data.error}`);
            } else {
                appendChatResult(data, true);
            }
        } catch (error) {
            removeTypingIndicator(typingMsgId);
            appendMessage('assistant', `<strong>Error:</strong> ${error.message}`);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    });
}

function appendMessage(sender, text) {
    const message = document.createElement('div');
    message.className = `message ${sender}-message`;
    const avatarText = sender === 'user' ? 'YOU' : 'AI';
    message.innerHTML = `
        <div class="msg-avatar">${avatarText}</div>
        <div class="msg-bubble"><p>${text}</p></div>
    `;
    chatMessages.appendChild(message);
    scrollToBottom();
}

function appendSystemMessage(htmlText) {
    const message = document.createElement('div');
    message.className = 'message assistant-message';
    message.innerHTML = `
        <div class="msg-avatar">SYS</div>
        <div class="msg-bubble"><p>${htmlText}</p></div>
    `;
    chatMessages.appendChild(message);
    scrollToBottom();
}

function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const message = document.createElement('div');
    message.className = 'message assistant-message';
    message.id = id;
    message.innerHTML = `
        <div class="msg-avatar">AI</div>
        <div class="msg-bubble">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
    `;
    chatMessages.appendChild(message);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Chart Detection for Chat
function detectChartType(question) {
    const q = (question || '').toLowerCase();
    if (q.includes('pie') || q.includes('donut')) return 'pie';
    if (q.includes('scatter') || q.includes('correlation') || q.includes('relationship') || q.includes('vs')) return 'scatter';
    if (q.includes('heatmap') || q.includes('density') || q.includes('matrix')) return 'heatmap';
    if (q.includes('line') || q.includes('trend') || q.includes('over time')) return 'line';
    if (q.includes('area')) return 'area';
    if (q.includes('bar') || q.includes('chart') || q.includes('graph') || q.includes('plot') || q.includes('visual') || q.includes('histogram') || q.includes('distribution')) return 'bar';
    return 'auto';
}

function analyzeResultsForChart(results, chartType = 'auto') {
    if (!results || results.length === 0 || results.length > 50) return null;
    const columns = Object.keys(results[0]);
    if (columns.length < 2) return null;

    const labelCols = [];
    const numericCols = [];

    columns.forEach(col => {
        const vals = results.map(r => r[col]).filter(v => v !== null && v !== undefined);
        if (vals.length === 0) return;
        const numRatio = vals.filter(v => typeof v === 'number' || (!isNaN(parseFloat(v)) && isFinite(v))).length / vals.length;
        if (numRatio >= 0.8) numericCols.push(col);
        else labelCols.push(col);
    });

    // Special parsing structure for Scatter Plot
    if (chartType === 'scatter') {
        if (numericCols.length >= 2) {
            return {
                xCol: numericCols[0],
                yCol: numericCols[1],
                series: [{
                    name: `${numericCols[1]} vs ${numericCols[0]}`,
                    data: results.map(r => ({
                        x: parseFloat(r[numericCols[0]]),
                        y: parseFloat(r[numericCols[1]])
                    }))
                }]
            };
        }
    }

    if (labelCols.length >= 1 && numericCols.length >= 1) {
        return {
            labelCol: labelCols[0],
            numericCols: numericCols,
            labels: results.map(r => String(r[labelCols[0]] !== null ? r[labelCols[0]] : '—')),
            series: numericCols.map(col => ({
                name: col,
                data: results.map(r => r[col] !== null && r[col] !== undefined ? parseFloat(r[col]) : 0)
            }))
        };
    }

    if (numericCols.length >= 2) {
        return {
            labelCol: numericCols[0],
            numericCols: numericCols.slice(1),
            labels: results.map(r => String(r[numericCols[0]])),
            series: numericCols.slice(1).map(col => ({
                name: col,
                data: results.map(r => r[col] !== null && r[col] !== undefined ? parseFloat(r[col]) : 0)
            }))
        };
    }

    return null;
}

function renderInlineChatChart(containerId, chartData, chartType, animate = true) {
    const resolvedType = chartType === 'auto' ? 'bar' : chartType;
    let options = {};

    if (resolvedType === 'pie') {
        options = {
            series: chartData.series[0].data,
            labels: chartData.labels,
            chart: { type: 'pie', height: 300, foreColor: '#888888', background: 'transparent', fontFamily: "'JetBrains Mono', monospace" },
            colors: CHART_COLORS,
            stroke: { colors: ['#000000'], width: 2 },
            legend: { position: 'bottom', labels: { colors: '#888888' } },
            tooltip: { theme: 'dark', style: { fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" } },
            dataLabels: { enabled: true, style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" }, dropShadow: { enabled: false } }
        };
    } else if (resolvedType === 'scatter') {
        options = {
            series: chartData.series,
            chart: { type: 'scatter', height: 300, foreColor: '#888888', background: 'transparent', fontFamily: "'JetBrains Mono', monospace", toolbar: {show: false} },
            colors: CHART_COLORS,
            xaxis: {
                tickAmount: 5,
                labels: { formatter: val => parseFloat(val).toFixed(1), style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } },
                title: { text: chartData.xCol, style: { color: '#888888', fontFamily: "'JetBrains Mono', monospace" } }
            },
            yaxis: {
                title: { text: chartData.yCol, style: { color: '#888888', fontFamily: "'JetBrains Mono', monospace" } },
                labels: { style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } }
            },
            grid: { borderColor: '#27272a', xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
            tooltip: { theme: 'dark', style: { fontFamily: "'JetBrains Mono', monospace" } }
        };
    } else if (resolvedType === 'heatmap') {
        options = {
            series: chartData.series,
            chart: { type: 'heatmap', height: 300, foreColor: '#888888', background: 'transparent', fontFamily: "'JetBrains Mono', monospace", toolbar: {show: false} },
            colors: CHART_COLORS,
            dataLabels: { enabled: true, style: { fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" } },
            xaxis: { labels: { style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } } },
            yaxis: { labels: { style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } } },
            grid: { borderColor: '#27272a' },
            tooltip: { theme: 'dark', style: { fontFamily: "'JetBrains Mono', monospace" } }
        };
    } else {
        // Smart Y-axis scaling for massive differences (Note: logarithmic scale is not supported for bar charts in ApexCharts)
        let useLogScale = false;
        let allValues = [];
        chartData.series.forEach(s => allValues.push(...s.data));
        allValues = allValues.filter(v => v > 0);
        if (allValues.length > 0 && resolvedType !== 'bar') {
            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            if (maxVal / minVal > 1000 && chartData.series.length > 1) {
                useLogScale = true;
            }
        }

        options = {
            series: chartData.series,
            chart: {
                type: resolvedType === 'line' ? 'line' : resolvedType === 'area' ? 'area' : 'bar',
                height: 300,
                foreColor: '#888888',
                animations: { enabled: animate },
                toolbar: { show: false },
                background: 'transparent',
                fontFamily: "'JetBrains Mono', monospace"
            },
            plotOptions: resolvedType === 'bar' ? {
                bar: { borderRadius: 0, horizontal: chartData.labels.length > 6, distributed: chartData.series.length === 1, columnWidth: '50%', barHeight: '55%' }
            } : {},
            colors: CHART_COLORS,
            dataLabels: {
                enabled: false // Disabled for readability
            },
            xaxis: {
                categories: chartData.labels,
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: { style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } }
            },
            yaxis: {
                logarithmic: useLogScale,
                labels: {
                    style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" },
                    formatter: val => {
                        if (val === undefined || val === null) return val;
                        if (val >= 1e6) return (val/1e6).toFixed(1) + 'M';
                        if (val >= 1e3) return (val/1e3).toFixed(1) + 'K';
                        return typeof val === 'number' ? val.toFixed(val % 1 === 0 ? 0 : 2) : val;
                    }
                }
            },
            grid: { borderColor: '#27272a', xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
            stroke: (resolvedType === 'line' || resolvedType === 'area') ? { curve: 'straight', width: 2 } : {},
            fill: resolvedType === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02 } } : {},
            legend: { show: chartData.series.length > 1, position: 'top', labels: { colors: '#888888' } },
            tooltip: { theme: 'dark', style: { fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }, y: { formatter: val => typeof val === 'number' ? val.toLocaleString() : val } }
        };
    }

    setTimeout(() => {
        const el = document.getElementById(containerId);
        if (el) new ApexCharts(el, options).render();
    }, 80);
}

// Chat Result Render
function appendChatResult(data, animateChart = true) {
    const message = document.createElement('div');
    message.className = 'message assistant-message';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = 'AI';
    message.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    // 1. Explanation
    if (data.explanation) {
        const explanationEl = document.createElement('div');
        explanationEl.className = 'explanation';
        explanationEl.innerHTML = marked.parse(data.explanation);
        bubble.appendChild(explanationEl);
    }
    
    // Check if it is a Multi-Query Dashboard
    if (data.is_multi_query && data.queries) {
        const grid = document.createElement('div');
        grid.className = 'dashboard-report-grid';
        grid.style = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 16px;';
        
        data.queries.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'dashboard-report-card';
            card.style = 'background: var(--surface); border: 1px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 8px;';
            
            const cardHeader = document.createElement('div');
            cardHeader.style = 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 6px;';
            cardHeader.innerHTML = `
                <strong style="font-size: 13px; font-family: var(--mono); color: var(--text);">${q.title}</strong>
                <span class="table-badge" style="font-size: 9px; padding: 2px 6px; background: var(--border); color: var(--text-muted); font-family: var(--mono);">${q.chart_type.toUpperCase()}</span>
            `;
            card.appendChild(cardHeader);
            
            // Visual container
            const vizId = 'multi-viz-' + Date.now() + '-' + idx;
            const chartDiv = document.createElement('div');
            chartDiv.id = vizId;
            chartDiv.style = 'min-height: 200px; width: 100%;';
            card.appendChild(chartDiv);
            
            // Toggleable SQL source code
            const codeToggle = document.createElement('details');
            codeToggle.style = 'font-size: 11px; font-family: var(--mono); color: var(--text-muted); cursor: pointer;';
            codeToggle.innerHTML = `
                <summary style="outline:none; margin-bottom:4px;">SQL Source</summary>
                <pre style="background:var(--bg); border:1px solid var(--border); padding:6px; overflow-x:auto; margin:0;"><code class="language-sql">${q.sql}</code></pre>
            `;
            card.appendChild(codeToggle);
            
            grid.appendChild(card);
            
            // Render chart dynamically
            setTimeout(() => {
                const subChartData = analyzeResultsForChart(q.results, q.chart_type);
                if (subChartData) {
                    renderInlineChatChart(vizId, subChartData, q.chart_type, animateChart);
                } else {
                    chartDiv.innerHTML = '<p style="color:var(--text-muted); font-size:11px; text-align:center; padding-top:40px;">No numerical trends. (Table details available in context)</p>';
                }
            }, 100);
        });
        
        bubble.appendChild(grid);
    } else {
        // Standard single query flow
        // Affected rows (for Data Cleaning Mode)
        if (data.results && data.results.length === 1 && data.results[0].affected_rows !== undefined) {
            const successMsg = document.createElement('div');
            successMsg.innerHTML = `<p style="color: #10b981; font-weight: bold;"><i class="fa-solid fa-check-circle"></i> Success: ${data.results[0].affected_rows} rows affected.</p>`;
            bubble.appendChild(successMsg);
        }

        // 2. SQL Code
        if (data.sql) {
            const sqlContainer = document.createElement('div');
            sqlContainer.className = 'sql-code-block';
            
            sqlContainer.innerHTML = `
                <div class="sql-header">
                    <span>SQL Query</span>
                    <div>
                        <button class="edit-sql-btn" title="Edit & Run" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-right:8px;"><i class="fa-solid fa-pen"></i></button>
                        <button class="copy-sql-btn" title="Copy SQL" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-regular fa-copy"></i></button>
                    </div>
                </div>
                <div class="sql-content-area">
                    <pre><code class="language-sql">${data.sql}</code></pre>
                </div>
            `;
            
            // Copy SQL
            const copyBtn = sqlContainer.querySelector('.copy-sql-btn');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(data.sql);
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>', 2000);
            });
            
            // Edit SQL
            const editBtn = sqlContainer.querySelector('.edit-sql-btn');
            const sqlContentArea = sqlContainer.querySelector('.sql-content-area');
            editBtn.addEventListener('click', () => {
                if (sqlContentArea.querySelector('textarea')) return; // already editing
                
                sqlContentArea.innerHTML = `
                    <textarea class="edit-sql-textarea" style="width: 100%; min-height: 100px; background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 12px; font-family: var(--mono); font-size: 13px; resize: vertical;">${data.sql}</textarea>
                    <div style="display:flex; justify-content:flex-end; padding-top:8px;">
                        <button class="run-edited-sql-btn" style="background: var(--white); color: var(--black); border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; font-family: var(--mono); font-weight: bold;">Run Query</button>
                    </div>
                `;
                
                const runBtn = sqlContentArea.querySelector('.run-edited-sql-btn');
                const textarea = sqlContentArea.querySelector('.edit-sql-textarea');
                
                runBtn.addEventListener('click', async () => {
                    const newSql = textarea.value.trim();
                    if (!newSql) return;
                    
                    runBtn.disabled = true;
                    runBtn.textContent = 'Running...';
                    
                    try {
                        const res = await fetch("/chat/run_sql", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                sql: newSql,
                                table_name: activeTable,
                                session_id: activeSessionId,
                                question: "Manual Edit"
                            })
                        });
                        const resData = await res.json();
                        
                        if (resData.error) {
                            showToast(resData.error, "error");
                            runBtn.disabled = false;
                            runBtn.textContent = 'Run Query';
                        } else {
                            appendChatResult(resData, true);
                        }
                    } catch (e) {
                        showToast("Execution failed.", "error");
                        runBtn.disabled = false;
                        runBtn.textContent = 'Run Query';
                    }
                });
            });

            bubble.appendChild(sqlContainer);
        }

        let chartData = null;
        let shouldShowChart = false;
        let chartId = null;
        const userRequestedChart = detectChartType(data.question || "");

        // 3. Results (Chart or Table)
        if (data.results && data.results.length > 0 && data.results[0].affected_rows === undefined) {
            chartData = analyzeResultsForChart(data.results, userRequestedChart);
            shouldShowChart = chartData && userRequestedChart !== 'none';

            const vizContainer = document.createElement('div');
            vizContainer.className = 'results-visualization';
            
            if (shouldShowChart) {
                chartId = 'inline-chart-' + Date.now() + Math.floor(Math.random() * 1000);
                const typeLabel = userRequestedChart === 'auto' ? 'BAR' : userRequestedChart.toUpperCase();
                
                vizContainer.innerHTML = `
                    <div class="inline-chart-section">
                        <div class="inline-chart-header">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i class="fa-solid fa-chart-column"></i>
                                <span>${typeLabel} &mdash; ${chartData.labelCol || 'Scatter'}</span>
                            </div>
                            <span class="table-badge"><i class="fa-solid fa-database"></i> ${activeTable || 'Dataset'}</span>
                        </div>
                        <div id="${chartId}" class="inline-chart"></div>
                    </div>
                `;
            } else {
                // Render basic table for small results
                let tableHtml = '<div class="table-wrapper"><table class="data-table"><thead><tr>';
                const keys = Object.keys(data.results[0]);
                keys.forEach(k => tableHtml += `<th>${k}</th>`);
                tableHtml += '</tr></thead><tbody>';
                
                data.results.slice(0, 15).forEach(row => {
                    tableHtml += '<tr>';
                    keys.forEach(k => tableHtml += `<td>${row[k]}</td>`);
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table></div>';
                vizContainer.innerHTML = tableHtml;
            }
            
            bubble.appendChild(vizContainer);
            
            // Action Buttons (Export & Pin)
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'chat-actions';
            actionsContainer.style.display = 'flex';
            actionsContainer.style.gap = '8px';
            actionsContainer.style.marginTop = '12px';
            
            const csvBtn = document.createElement('button');
            csvBtn.className = 'action-btn';
            csvBtn.innerHTML = '<i class="fa-solid fa-download"></i> Export CSV';
            csvBtn.style = "background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 4px 8px; font-size: 11px; cursor: pointer; border-radius: 4px;";
            csvBtn.onclick = () => {
                const keys = Object.keys(data.results[0]);
                const csvRows = [keys.join(',')];
                data.results.forEach(row => {
                    csvRows.push(keys.map(k => `"${String(row[k]).replace(/"/g, '""')}"`).join(','));
                });
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.setAttribute('hidden', '');
                a.setAttribute('href', url);
                a.setAttribute('download', 'export.csv');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
            actionsContainer.appendChild(csvBtn);
            
            // Add Pin to Dashboard button
            const pinBtn = document.createElement('button');
            pinBtn.className = 'action-btn pinned-insight-btn';
            pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pin to Dashboard';
            pinBtn.style = "background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 4px 8px; font-size: 11px; cursor: pointer; border-radius: 4px;";
            
            const storageKey = `pinned_insights_${activeTable}`;
            let currentPinned = [];
            try { currentPinned = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) {}
            const isAlreadyPinned = currentPinned.some(p => p.question === data.question);
            if (isAlreadyPinned) {
                pinBtn.classList.add('pinned');
                pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pinned';
            }
            
            pinBtn.onclick = () => {
                let pinnedList = [];
                try { pinnedList = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) {}
                
                const existingIdx = pinnedList.findIndex(p => p.question === data.question);
                if (existingIdx >= 0) {
                    pinnedList.splice(existingIdx, 1);
                    pinBtn.classList.remove('pinned');
                    pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pin to Dashboard';
                    showToast("Insight unpinned.", "success");
                } else {
                    pinnedList.push({
                        question: data.question,
                        explanation: data.explanation,
                        results: data.results,
                        chartType: userRequestedChart
                    });
                    pinBtn.classList.add('pinned');
                    pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pinned';
                    showToast("Insight pinned to dashboard!", "success");
                }
                localStorage.setItem(storageKey, JSON.stringify(pinnedList));
                renderPinnedInsights();
            };
            
            actionsContainer.appendChild(pinBtn);
            bubble.appendChild(actionsContainer);
        }

        if (shouldShowChart && chartData) {
            renderInlineChatChart(chartId, chartData, userRequestedChart === 'auto' ? 'bar' : userRequestedChart, animateChart);
        }
    }
    
    message.appendChild(bubble);
    chatMessages.appendChild(message);
    scrollToBottom();
}

// Helpers
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    let icon = '<i class="fa-solid fa-info-circle"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-check-circle" style="color: var(--green);"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--red);"></i>';
    
    toast.innerHTML = `${icon} <span>${escapeHtml(message)}</span>`;
    
    const container = document.getElementById('toast-container') || document.body;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const reveals = document.querySelectorAll('.reveal-on-scroll');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, { threshold: 0.1 });

    reveals.forEach(el => observer.observe(el));
});

