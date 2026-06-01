// ==================== 数据管理 ====================
const STORAGE_KEY = 'express_data';

function loadData() {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let expressList = loadData();
let currentFilter = 'unsigned';
let selectionMode = false;
let searchMode = false;
let selectedIds = new Set();

// ==================== 渲染 ====================
function render() {
    const container = document.getElementById('listContainer');
    
    // 过滤数据
    let filtered = expressList;
    if (searchMode) {
        // 搜索模式保持搜索结果
        filtered = window.searchResults || expressList;
    } else if (currentFilter === 'signed') {
        filtered = expressList.filter(e => e.signed);
    } else if (currentFilter === 'unsigned') {
        filtered = expressList.filter(e => !e.signed);
    }
    
    // 按日期分组排序
    filtered.sort((a, b) => b.createDate - a.createDate);
    
    const groups = {};
    filtered.forEach(item => {
        const dateKey = formatDate(new Date(item.createDate));
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(item);
    });
    
    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<div class="empty-state">暂无快递单号</div>';
        return;
    }
    
    let html = '';
    for (const [date, items] of Object.entries(groups)) {
        html += `<div class="date-header">${date}</div>`;
        items.forEach(item => {
            const selectedClass = selectedIds.has(item.id) ? ' selected' : '';
            const statusClass = item.signed ? 'status-signed' : 'status-unsigned';
            const statusText = item.signed ? '已签收' : '未签收';
            
            html += `
                <div class="express-item${selectedClass}" 
                     onclick="onItemClick('${item.id}')" 
                     data-id="${item.id}">
                    <span class="express-number">${escapeHtml(item.trackingNumber)}</span>
                    <span class="express-status ${statusClass}">${statusText}</span>
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
    updateUI();
}

function formatDate(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== UI 更新 ====================
function updateUI() {
    // 工具栏按钮
    document.getElementById('btnSearch').style.display = (!selectionMode && !searchMode) ? '' : 'none';
    document.getElementById('btnExitSearch').style.display = searchMode ? '' : 'none';
    document.getElementById('btnSelectAll').style.display = selectionMode ? '' : 'none';
    document.getElementById('btnBatch').style.display = selectionMode ? '' : 'none';
    document.getElementById('btnExitSelect').style.display = selectionMode ? '' : 'none';
    
    // 标题
    if (searchMode) {
        document.getElementById('toolbarTitle').textContent = '搜索结果';
    } else if (selectionMode && selectedIds.size > 0) {
        document.getElementById('toolbarTitle').textContent = `已选择 ${selectedIds.size} 项`;
    } else {
        document.getElementById('toolbarTitle').textContent = '快递管理';
    }
    
    // 底部选择栏
    const selectionBar = document.getElementById('selectionBar');
    if (selectionMode && selectedIds.size > 0) {
        selectionBar.classList.add('show');
        document.getElementById('selectionCount').textContent = `已选 ${selectedIds.size} 项`;
    } else {
        selectionBar.classList.remove('show');
    }
    
    // 全选按钮图标
    const totalItems = expressList.filter(e => {
        if (currentFilter === 'signed') return e.signed;
        if (currentFilter === 'unsigned') return !e.signed;
        return true;
    }).length;
    
    if (selectedIds.size === totalItems && totalItems > 0) {
        document.getElementById('btnSelectAll').textContent = '☑';
    } else {
        document.getElementById('btnSelectAll').textContent = '☐';
    }
}

// ==================== 事件处理 ====================
let longPressTimer = null;

function onItemClick(id) {
    if (selectionMode) {
        toggleSelect(id);
    } else {
        showItemActionDialog(id);
    }
}

// 长按进入选择模式
document.addEventListener('touchstart', function(e) {
    const item = e.target.closest('.express-item');
    if (!item || selectionMode) return;
    
    longPressTimer = setTimeout(() => {
        selectionMode = true;
        toggleSelect(item.dataset.id);
        render();
    }, 500);
});

document.addEventListener('touchend', function() {
    clearTimeout(longPressTimer);
});

document.addEventListener('touchmove', function() {
    clearTimeout(longPressTimer);
});

function toggleSelect(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
    render();
}

function toggleSelectAll() {
    const filtered = expressList.filter(e => {
        if (currentFilter === 'signed') return e.signed;
        if (currentFilter === 'unsigned') return !e.signed;
        return true;
    });
    
    if (selectedIds.size === filtered.length) {
        selectedIds.clear();
    } else {
        filtered.forEach(e => selectedIds.add(e.id));
    }
    render();
}

function exitSelectionMode() {
    selectionMode = false;
    selectedIds.clear();
    render();
}

// ==================== 筛选 ====================
function switchFilter(filter) {
    if (searchMode) exitSearchMode();
    
    currentFilter = filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    render();
}

// ==================== 添加 ====================
function showAddDialog() {
    document.getElementById('addModal').classList.add('show');
    document.getElementById('addInput').focus();
    
    // 自动粘贴剪贴板
    navigator.clipboard?.readText().then(text => {
        if (text) document.getElementById('addInput').value = text;
    }).catch(() => {});
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function pasteAndAdd() {
    navigator.clipboard?.readText().then(text => {
        if (text) {
            document.getElementById('addInput').value = text;
        }
    }).catch(() => {
        showToast('无法访问剪贴板');
    });
}

function addExpress() {
    const text = document.getElementById('addInput').value.trim();
    if (!text) return;
    
    const numbers = parseTrackingNumbers(text);
    if (numbers.length === 0) {
        showToast('未识别到有效的快递单号');
        return;
    }
    
    numbers.forEach(num => {
        // 检查是否已存在
        if (!expressList.find(e => e.trackingNumber === num)) {
            expressList.push({
                id: generateId(),
                trackingNumber: num,
                createDate: Date.now(),
                signed: false
            });
        }
    });
    
    saveData(expressList);
    closeModal('addModal');
    document.getElementById('addInput').value = '';
    showToast(`成功添加 ${numbers.length} 个快递单号`);
    render();
}

// ==================== 搜索 ====================
function showSearchDialog() {
    document.getElementById('searchModal').classList.add('show');
    document.getElementById('searchInput').focus();
}

function performSearch() {
    const text = document.getElementById('searchInput').value.trim();
    if (!text) return;
    
    const numbers = parseTrackingNumbers(text);
    if (numbers.length === 0) {
        showToast('请输入有效的快递单号');
        return;
    }
    
    searchMode = true;
    window.searchResults = expressList.filter(e => 
        numbers.some(n => e.trackingNumber.includes(n))
    );
    
    closeModal('searchModal');
    document.getElementById('searchInput').value = '';
    render();
    showToast(`找到 ${window.searchResults.length} 条记录`);
}

function exitSearchMode() {
    searchMode = false;
    window.searchResults = null;
    render();
}

// ==================== 批量操作 ====================
function showBatchDialog() {
    if (selectedIds.size === 0) {
        showToast('请先选择快递单号');
        return;
    }
    
    // 直接使用底部栏的按钮
}

function toggleSelectedStatus(signed) {
    const ids = Array.from(selectedIds);
    expressList.forEach(e => {
        if (ids.includes(e.id)) {
            e.signed = signed;
        }
    });
    saveData(expressList);
    showToast(`已标记为${signed ? '已签收' : '未签收'}`);
    exitSelectionMode();
}

function deleteSelected() {
    if (selectedIds.size === 0) return;
    
    if (confirm(`确定要删除 ${selectedIds.size} 个快递单号吗？`)) {
        const ids = Array.from(selectedIds);
        expressList = expressList.filter(e => !ids.includes(e.id));
        saveData(expressList);
        showToast('已删除');
        exitSelectionMode();
    }
}

function copySelected() {
    if (selectedIds.size === 0) {
        showToast('请先选择快递单号');
        return;
    }
    
    const ids = Array.from(selectedIds);
    const text = expressList
        .filter(e => ids.includes(e.id))
        .map(e => e.trackingNumber)
        .join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(`已复制 ${selectedIds.size} 个快递单号`);
    }).catch(() => {
        showToast('复制失败，请手动复制');
    });
}

// ==================== 单个操作 ====================
function showItemActionDialog(id) {
    const item = expressList.find(e => e.id === id);
    if (!item) return;
    
    const action = confirm(
        `操作: ${item.trackingNumber}\n\n` +
        `当前状态: ${item.signed ? '已签收' : '未签收'}\n\n` +
        `点击确定: ${item.signed ? '标记为未签收' : '标记为已签收'}\n` +
        `点击取消: 删除此单号`
    );
    
    if (action) {
        item.signed = !item.signed;
        saveData(expressList);
        showToast(item.signed ? '已标记为已签收' : '已标记为未签收');
    } else {
        if (confirm('确定要删除吗？')) {
            expressList = expressList.filter(e => e.id !== id);
            saveData(expressList);
            showToast('已删除');
        }
    }
    
    render();
}

// ==================== 工具函数 ====================
function parseTrackingNumbers(text) {
    return text
        .replace(/拦截一下|拦截|退回/g, '')
        .split(/[\n\r、,，\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && /^[A-Za-z0-9]+$/.test(s));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ==================== 初始化 ====================
// 给桌面端也添加长按支持
document.addEventListener('mousedown', function(e) {
    const item = e.target.closest('.express-item');
    if (!item || selectionMode) return;
    
    longPressTimer = setTimeout(() => {
        selectionMode = true;
        toggleSelect(item.dataset.id);
        render();
    }, 500);
});

document.addEventListener('mouseup', function() {
    clearTimeout(longPressTimer);
});

// 点击弹窗遮罩关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.classList.remove('show');
        }
    });
});

// 初始渲染
render();