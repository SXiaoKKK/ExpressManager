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
let scannerActive = false;
let html5QrCode = null;

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

// ==================== 扫码功能 ====================

// 动态加载扫码库
function loadScannerLibrary(callback) {
    if (window.Html5Qrcode) {
        callback();
        return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.onload = callback;
    script.onerror = () => {
        showToast('扫码库加载失败，请检查网络');
    };
    document.head.appendChild(script);
}

// 开始扫码
function startScan() {
    loadScannerLibrary(() => {
        // 创建扫码容器
        let scannerContainer = document.getElementById('scannerContainer');
        if (!scannerContainer) {
            scannerContainer = document.createElement('div');
            scannerContainer.id = 'scannerContainer';
            scannerContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.95);
                z-index: 500;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            `;
            
            scannerContainer.innerHTML = `
                <div style="color:white;font-size:18px;margin-bottom:16px;">
                    将快递单号条形码/二维码置于框内
                </div>
                <div id="reader" style="width:300px;max-width:90vw;"></div>
                <button id="btnCloseScanner" style="
                    margin-top:20px;
                    padding:12px 40px;
                    border-radius:25px;
                    border:2px solid white;
                    background:transparent;
                    color:white;
                    font-size:16px;
                    cursor:pointer;
                ">关闭扫码</button>
            `;
            
            document.body.appendChild(scannerContainer);
            
            document.getElementById('btnCloseScanner').onclick = stopScan;
        }
        
        scannerContainer.style.display = 'flex';
        
        // 初始化扫码器
        html5QrCode = new Html5Qrcode("reader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
            ]
        };
        
        html5QrCode.start(
            { facingMode: "environment" }, // 后置摄像头
            config,
            onScanSuccess,
            onScanFailure
        ).catch(err => {
            showToast('无法打开摄像头: ' + err.message);
            stopScan();
        });
        
        scannerActive = true;
    });
}

// 扫码成功回调
function onScanSuccess(decodedText, decodedResult) {
    if (!scannerActive) return;
    
    // 震动反馈（如果设备支持）
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    // 从扫码结果中提取快递单号
    const trackingNumber = extractTrackingNumberFromScan(decodedText);
    
    // 关闭扫码器
    stopScan();
    
    // 显示扫码结果
    showScanResult(trackingNumber);
}

// 扫码失败回调
function onScanFailure(error) {
    // 忽略频繁的扫描失败，不打印日志
}

// 停止扫码
function stopScan() {
    scannerActive = false;
    
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(() => {});
        html5QrCode = null;
    }
    
    const container = document.getElementById('scannerContainer');
    if (container) {
        container.style.display = 'none';
    }
}

// 从扫码结果提取单号
function extractTrackingNumberFromScan(text) {
    // 去除空格和特殊字符
    const cleaned = text.trim();
    
    // 尝试匹配快递单号格式（字母数字组合，8-30位）
    const match = cleaned.match(/[A-Za-z0-9]{8,30}/);
    return match ? match[0] : cleaned;
}

// 显示扫码结果
function showScanResult(trackingNumber) {
    // 检查是否已存在
    const exists = expressList.find(e => e.trackingNumber === trackingNumber);
    const statusEmoji = exists ? '✅ 该单号已存在' : '🆕 新单号';
    const statusColor = exists ? '#2e7d32' : '#1976D2';
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 600;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 24px;
            width: 90%;
            max-width: 360px;
            text-align: center;
        ">
            <div style="font-size:18px;font-weight:bold;margin-bottom:16px;">扫码结果</div>
            <div style="
                background: #f5f5f5;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <div style="font-size:22px;font-weight:bold;color:#333;word-break:break-all;">
                    ${escapeHtml(trackingNumber)}
                </div>
                <div style="font-size:14px;color:${statusColor};margin-top:8px;">
                    ${statusEmoji}
                </div>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="btnAddScan" style="
                    flex:1;
                    padding:12px;
                    border-radius:8px;
                    border:1px solid #1976D2;
                    background:white;
                    color:#1976D2;
                    font-size:14px;
                    cursor:pointer;
                ">录入此单号</button>
                <button id="btnSearchScan" style="
                    flex:1;
                    padding:12px;
                    border-radius:8px;
                    border:none;
                    background:#1976D2;
                    color:white;
                    font-size:14px;
                    cursor:pointer;
                ">搜索此单号</button>
            </div>
            <button id="btnCloseScanResult" style="
                width:100%;
                margin-top:12px;
                padding:12px;
                border-radius:8px;
                border:1px solid #ddd;
                background:white;
                color:#666;
                font-size:14px;
                cursor:pointer;
            ">关闭</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 按钮事件
    overlay.querySelector('#btnAddScan').onclick = () => {
        if (!expressList.find(e => e.trackingNumber === trackingNumber)) {
            expressList.push({
                id: generateId(),
                trackingNumber: trackingNumber,
                createDate: Date.now(),
                signed: false
            });
            saveData(expressList);
            showToast(`已录入: ${trackingNumber}`);
        } else {
            showToast('该单号已存在');
        }
        document.body.removeChild(overlay);
        render();
    };
    
    overlay.querySelector('#btnSearchScan').onclick = () => {
        document.body.removeChild(overlay);
        searchMode = true;
        window.searchResults = expressList.filter(e => 
            e.trackingNumber.includes(trackingNumber)
        );
        render();
        showToast(`找到 ${window.searchResults.length} 条记录`);
    };
    
    overlay.querySelector('#btnCloseScanResult').onclick = () => {
        document.body.removeChild(overlay);
    };
    
    // 点击遮罩关闭
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
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