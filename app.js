/*
   ====================================================
   Tada Layout Digital Layout App JS
   ====================================================
*/

// Application State
let plotData = [];
let activeFacingFilters = new Set();
let activeStatusFilters = new Set();

// Pan & Zoom state
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// Coordinate Mapper State
let isMapperMode = false;
let activeMapperPlot = 1;

// Admin Mode state
let userRole = sessionStorage.getItem('userRole') || (sessionStorage.getItem('isAdminLoggedIn') === 'true' ? 'director' : null);
let isAdminLoggedIn = !!userRole;
let isDirectorLoggedIn = userRole === 'director';
let isStaffLoggedIn = userRole === 'staff';

// DOM Cache
const mapViewport = document.getElementById('mapViewport');
const mapContainer = document.getElementById('mapContainer');
const mapImage = document.getElementById('mapImage');
const plotsOverlay = document.getElementById('plotsOverlay');
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const searchSuggestions = document.getElementById('searchSuggestions');
const facingFilterGrid = document.getElementById('facingFilterGrid');
const statusLegendList = document.getElementById('statusLegendList');
const plotModal = document.getElementById('plotModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const mapTip = document.getElementById('mapTip');

// Sidebar responsive controls
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

// Statistics DOM
const statTotalPlots = document.getElementById('statTotalPlots');
const statAvailablePlots = document.getElementById('statAvailablePlots');
const statPremKumarPlots = document.getElementById('statPremKumarPlots');
const statSureshPlots = document.getElementById('statSureshPlots');
const statSoumithPlots = document.getElementById('statSoumithPlots');

// Mapper DOM
const mapperSection = document.getElementById('mapperSection');
const toggleMapperBtn = document.getElementById('toggleMapperBtn');
const mapperPanel = document.getElementById('mapperPanel');
const mapperActivePlot = document.getElementById('mapperActivePlot');
const mapperPlotList = document.getElementById('mapperPlotList');
const mapperExportBtn = document.getElementById('mapperExportBtn');

// Admin Login DOM
const loginModalBackdrop = document.getElementById('loginModalBackdrop');
const loginModalCloseBtn = document.getElementById('loginModalCloseBtn');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const sidebarFooter = document.getElementById('sidebarFooter');

// Setup Application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTadaApp);
} else {
    startTadaApp();
}

function startTadaApp() {
    initApp();
    setupMapControls();
    setupSearch();
    setupFilters();
    setupMobileSidebar();
    setupMapper();
    setupAdmin();
}

// Ensure map is fitted once all resources are loaded and on resize
window.addEventListener('load', () => {
    fitMapToViewport();
    
    // Smooth transition to hide the loader screen
    setTimeout(() => {
        const loader = document.getElementById('loadingScreen');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.remove();
            }, 600); // Remove element after opacity transition completes
        }
    }, 1200); // Keep loader visible for 1.2 seconds for a premium feel
});
window.addEventListener('resize', fitMapToViewport);

// Initialization
function initApp() {
    // Check local storage for custom database updates
    const localData = localStorage.getItem('aspire_avatar2_data');
    if (localData) {
        try {
            plotData = JSON.parse(localData);
            renderPlotDots();
            updateStatistics();
            setTimeout(fitMapToViewport, 100);
            setupAdminState();
            return;
        } catch (e) {
            console.error('Error parsing local storage database', e);
        }
    }

    // Load standard data from data.json or fallback
    fetch('data.json')
        .then(res => {
            if (!res.ok) throw new Error('Data fetch failed');
            return res.json();
        })
        .then(data => {
            plotData = data;
            renderPlotDots();
            updateStatistics();
            setTimeout(fitMapToViewport, 100);
            setupAdminState();
        })
        .catch(err => {
            console.warn('Network issue. Falling back to data.js:', err);
            if (typeof plotDataRawTada !== 'undefined') {
                plotData = plotDataRawTada;
            } else if (typeof plotDataRaw !== 'undefined') {
                plotData = plotDataRaw;
            } else {
                console.error('Offline dataset not found.');
            }
            renderPlotDots();
            updateStatistics();
            setTimeout(fitMapToViewport, 100);
            setupAdminState();
        });
}

// ----------------------------------------------------
// Rendering Functions
// ----------------------------------------------------

function getStatusColor(status, plotNo) {
    if (String(plotNo) === '1') return '#8b5cf6'; // Violet for Plot 1 (EVERYONES)
    const s = String(status || '').toUpperCase().trim();
    if (s === 'EVERYONES' || s === "EVERYONE'S" || s === 'EVERYONE') return '#8b5cf6'; // Violet
    if (s === 'AVAILABLE') return '#10b981'; // Green
    if (s === 'PREM KUMAR' || s === 'PREMKUMAR' || s === 'PREM') return '#f97316'; // Orange
    if (s === 'SURESH') return '#facc15'; // Yellow
    if (s === 'SOUMITH') return '#3b82f6'; // Blue
    
    if (s === 'MORTGAGE' || s === 'HOLD') return '#f97316'; // Orange
    if (s === 'REGISTERED') return '#facc15'; // Yellow
    if (s === 'SOLD' || s === 'BOOKED' || s === 'CLUB HOUSE') return '#3b82f6'; // Blue
    return '#10b981'; // Green default
}

function renderPlotDots() {
    plotsOverlay.innerHTML = '';
    
    Object.keys(plotCoordinates).forEach(plotNo => {
        const coords = plotCoordinates[plotNo];
        const detail = plotData.find(p => String(p.plot_no) === String(plotNo));
        const status = detail ? detail.plot_status : (String(plotNo) === '1' ? 'EVERYONES' : 'AVAILABLE');
        
        const dot = document.createElement('button');
        dot.className = 'plot-dot';
        dot.id = `plot-dot-${plotNo}`;
        dot.dataset.plotNo = plotNo;
        dot.dataset.facing = detail && detail.facing ? detail.facing : 'Unknown';
        dot.dataset.status = status;
        
        dot.style.setProperty('--plot-color', getStatusColor(status, plotNo));
        const isAvailablePlotDot = String(status || '').toUpperCase().trim() === 'AVAILABLE';
        const displaySizeTooltip = (isAvailablePlotDot || !detail || !detail.plot_size || detail.plot_size === 'N/A') ? 'N/A' : (detail.plot_size + ' Sq.Yds');
        dot.title = `Plot #${plotNo} | Status: ${status} | Size: ${displaySizeTooltip} | Facing: ${detail && detail.facing ? detail.facing : 'N/A'}`;
        
        // Mapped coordinates centered for 20px dot size
        dot.style.left = `${coords.left - 10}px`;
        dot.style.top = `${coords.top - 10}px`;
        
        dot.textContent = plotNo;
        
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isMapperMode) {
                activeMapperPlot = parseInt(plotNo) || plotNo;
                if (mapperActivePlot) {
                    mapperActivePlot.value = plotNo;
                }
                highlightActiveMapperButton();
                return;
            }
            openPlotModal(plotNo);
        });
        
        plotsOverlay.appendChild(dot);
    });

    applyFilters();
}

// ----------------------------------------------------
// Map Control (Pan & Zoom) Functions
// ----------------------------------------------------

function setupMapControls() {
    mapViewport.addEventListener('mousedown', (e) => {
        // Disallow panning if clicking a dot or details modal
        if (e.target.closest('.plot-dot') || e.target.closest('#plotModal')) return;
        isPanning = true;
        mapViewport.style.cursor = 'grabbing';
        startX = e.clientX - panX;
        startY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateMapTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            mapViewport.style.cursor = 'grab';
        }
    });

    // Zoom on wheel scroll
    mapViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        
        // Viewport center context coordinates
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate new scale
        const previousScale = zoomScale;
        if (e.deltaY < 0) {
            zoomScale = Math.min(zoomScale + zoomIntensity, 4.0);
        } else {
            zoomScale = Math.max(zoomScale - zoomIntensity, 0.4);
        }
        
        // Offset pan adjustment so mouse remains focal point
        panX -= (mouseX / previousScale) * (zoomScale - previousScale);
        panY -= (mouseY / previousScale) * (zoomScale - previousScale);
        
        updateMapTransform();
    }, { passive: false });

    // Touch support (mobile pan & pinch)
    let initialTouchDist = 0;
    mapViewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            if (e.target.closest('.plot-dot') || e.target.closest('#plotModal')) return;
            isPanning = true;
            startX = e.touches[0].clientX - panX;
            startY = e.touches[0].clientY - panY;
        } else if (e.touches.length === 2) {
            isPanning = false;
            initialTouchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });

    mapViewport.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 1) {
            panX = e.touches[0].clientX - startX;
            panY = e.touches[0].clientY - startY;
            updateMapTransform();
        } else if (e.touches.length === 2) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = currentDist / initialTouchDist;
            zoomScale = Math.max(0.4, Math.min(zoomScale * factor, 4.0));
            initialTouchDist = currentDist;
            updateMapTransform();
        }
    });

    mapViewport.addEventListener('touchend', () => {
        isPanning = false;
    });

    // Double click to reset viewport
    mapViewport.addEventListener('dblclick', (e) => {
        if (e.target.closest('.plot-dot') || e.target.closest('#plotModal')) return;
        fitMapToViewport();
    });

    // Hook floating map control buttons
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const recenterBtn = document.getElementById('recenterBtn');

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            zoomScale = Math.min(zoomScale + 0.2, 4.0);
            updateMapTransform();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            zoomScale = Math.max(zoomScale - 0.2, 0.4);
            updateMapTransform();
        });
    }

    if (recenterBtn) {
        recenterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fitMapToViewport();
        });
    }

    const floatLegendHeader = document.getElementById('floatingLegendHeader');
    const floatLegendCard = document.getElementById('floatingLegendCard');
    if (floatLegendHeader && floatLegendCard) {
        floatLegendHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            floatLegendCard.classList.toggle('collapsed');
        });
    }

    const goToSatelliteBtn = document.getElementById('goToSatelliteBtn');
    if (goToSatelliteBtn) {
        goToSatelliteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = '../index.html?project=avatar2';
        });
    }
}

function updateMapTransform() {
    mapContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

function fitMapToViewport() {
    zoomScale = 1.02051;
    panX = -9;
    panY = -33.124;
    updateMapTransform();
}

// ----------------------------------------------------
// Search Bar Implementation
// ----------------------------------------------------

function setupSearch() {
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toUpperCase();
        if (query.length > 0) {
            searchClearBtn.style.display = 'block';
            showSearchSuggestions(query);
        } else {
            searchClearBtn.style.display = 'none';
            searchSuggestions.style.display = 'none';
        }
    });

    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        searchSuggestions.style.display = 'none';
        
        // Remove search highlights
        document.querySelectorAll('.plot-dot.highlighted').forEach(dot => {
            dot.classList.remove('highlighted');
        });
    });

    // Close suggestions dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchSuggestions.style.display = 'none';
        }
    });
}

function showSearchSuggestions(query) {
    searchSuggestions.innerHTML = '';
    
    // Filter plotDataRaw/coords mapped plots matching search
    const matches = Object.keys(plotCoordinates).filter(plotNo => {
        return String(plotNo).includes(query);
    }).sort((a, b) => parseInt(a) - parseInt(b));

    if (matches.length > 0) {
        matches.slice(0, 8).forEach(plotNo => {
            const detail = plotData.find(p => String(p.plot_no) === String(plotNo));
            const status = detail ? detail.plot_status : 'AVAILABLE';
            
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <span class="suggestion-no">Plot #${plotNo}</span>
                <span class="suggestion-desc">${status} &bull; ${detail && detail.facing ? detail.facing : 'Unknown'}</span>
            `;
            
            div.addEventListener('click', () => {
                searchInput.value = plotNo;
                searchSuggestions.style.display = 'none';
                focusOnPlot(plotNo);
                openPlotModal(plotNo);
            });
            
            searchSuggestions.appendChild(div);
        });
        searchSuggestions.style.display = 'block';
    } else {
        searchSuggestions.style.display = 'none';
    }
}

function focusOnPlot(plotNo) {
    const coords = plotCoordinates[plotNo];
    if (!coords) return;
    
    document.querySelectorAll('.plot-dot.highlighted').forEach(dot => {
        dot.classList.remove('highlighted');
    });
    
    const dot = document.getElementById(`plot-dot-${plotNo}`);
    if (dot) dot.classList.add('highlighted');
    
    // Center viewport focusing on targets
    zoomScale = 1.0;
    const vWidth = mapViewport.clientWidth;
    const vHeight = mapViewport.clientHeight;
    
    panX = vWidth / 2 - coords.left * zoomScale;
    panY = vHeight / 2 - coords.top * zoomScale;
    
    updateMapTransform();
}

// ----------------------------------------------------
// Filter Panel Implementation
// ----------------------------------------------------

function setupFilters() {
    // 1. Facing Filters (Pills)
    facingFilterGrid.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const facing = pill.dataset.facing;
            if (activeFacingFilters.has(facing)) {
                activeFacingFilters.delete(facing);
                pill.classList.remove('active');
            } else {
                activeFacingFilters.add(facing);
                pill.classList.add('active');
            }
            applyFilters();
        });
    });

    document.getElementById('facingResetBtn').addEventListener('click', () => {
        activeFacingFilters.clear();
        facingFilterGrid.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
        applyFilters();
    });
}

function applyFilters() {
    document.querySelectorAll('.plot-dot').forEach(dot => {
        const plotNo = dot.dataset.plotNo;
        const facing = dot.dataset.facing;
        const rawStatus = String(dot.dataset.status || '').toUpperCase().trim();
        
        let normalizedStatus = 'AVAILABLE';
        if (String(plotNo) === '1' || rawStatus === 'EVERYONES' || rawStatus === "EVERYONE'S" || rawStatus === 'EVERYONE') {
            normalizedStatus = 'EVERYONES';
        } else if (rawStatus === 'PREM KUMAR' || rawStatus === 'PREMKUMAR' || rawStatus === 'PREM' || rawStatus === 'MORTGAGE' || rawStatus === 'HOLD') {
            normalizedStatus = 'PREM KUMAR';
        } else if (rawStatus === 'SURESH' || rawStatus === 'REGISTERED') {
            normalizedStatus = 'SURESH';
        } else if (rawStatus === 'SOUMITH' || rawStatus === 'SOLD' || rawStatus === 'BOOKED' || rawStatus === 'CLUB HOUSE') {
            normalizedStatus = 'SOUMITH';
        }
        
        let show = true;
        
        // Apply Facing constraint
        if (activeFacingFilters.size > 0 && !activeFacingFilters.has(facing)) {
            show = false;
        }
        
        // Apply Status constraint
        if (activeStatusFilters.size > 0 && !activeStatusFilters.has(normalizedStatus) && !activeStatusFilters.has(rawStatus)) {
            show = false;
        }
        
        if (show) {
            dot.classList.remove('filtered-out');
        } else {
            dot.classList.add('filtered-out');
        }
    });
}

// ----------------------------------------------------
// Details Modal Implementation
// ----------------------------------------------------

function openPlotModal(plotNo) {
    const item = plotData.find(p => String(p.plot_no) === String(plotNo)) || {
        plot_no: plotNo,
        plot_size: 'N/A',
        facing: 'N/A',
        plot_status: 'AVAILABLE',
        dim_north: 'N/A',
        dim_south: 'N/A',
        dim_east: 'N/A',
        dim_west: 'N/A',
        customer_name: 'N/A',
        reference_name: 'N/A'
    };
    
    const color = getStatusColor(item.plot_status);
    
    let editButtonHtml = '';
    if (isAdminLoggedIn) {
        editButtonHtml = `
            <button class="admin-login-btn" id="editPlotBtn" style="background: var(--accent); color: #fff; border: none; font-weight: 700; width: 100%; margin-top: 15px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; font-size: 14px;">
                <i class="fa-solid fa-pen-to-square"></i> Edit Plot Details
            </button>
        `;
    }
    
    const statusUpper = String(item.plot_status || '').toUpperCase().trim();
    const isDealSimulatorAllowed = isDirectorLoggedIn && (statusUpper === 'AVAILABLE' || statusUpper === 'RESALE');

    modalBody.innerHTML = `
        <div class="detail-card">
            <div class="detail-row">
                <span class="detail-label">Plot Number</span>
                <span class="detail-val" style="font-size: 18px; font-weight: 700; color: var(--accent)"># ${item.plot_no}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="status-badge" style="--badge-color: ${color}; --badge-glow: ${color}">${item.plot_status}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Plot Area</span>
                <span class="detail-val">${(String(item.plot_status || '').toUpperCase().trim() === 'AVAILABLE' || !item.plot_size || item.plot_size === 'N/A') ? 'N/A' : item.plot_size + ' Sq. Yards'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Facing Direction</span>
                <span class="detail-val">${item.facing || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Customer Name</span>
                <span class="detail-val">${item.customer_name ? (isAdminLoggedIn ? item.customer_name : maskName(item.customer_name)) : 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reference / Share</span>
                <span class="detail-val">${item.reference_name || 'N/A'}</span>
            </div>
        </div>
        <button class="btn-director-action" id="openDealSimulatorBtn" style="display: ${isDealSimulatorAllowed ? 'flex' : 'none'}; margin-top: 8px;">
            <i class="fa-solid fa-calculator" style="color: #facc15;"></i> Live Deal Closer &amp; Margin Simulator
        </button>
        ${editButtonHtml}
    `;
    const openSimBtn = document.getElementById('openDealSimulatorBtn');
    if (openSimBtn) {
        openSimBtn.addEventListener('click', () => {
            openDealSimulator(plotNo);
        });
    }
    
    modalBackdrop.classList.add('show');
}

function maskName(name) {
    if (!name || name === 'N/A' || name === '') return 'N/A';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        const p = parts[0];
        if (p.length <= 3) return p;
        return p.slice(0, 2) + '*'.repeat(p.length - 3) + p.slice(-1);
    }
    return parts.map((p, idx) => {
        if (idx === 0) return p;
        return p[0] + '*';
    }).join(' ');
}

// Close listeners
modalCloseBtn.addEventListener('click', closePlotModal);
modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closePlotModal();
});

const plotModalEl = document.getElementById('plotModal');
if (plotModalEl) {
    ['wheel', 'mousewheel', 'DOMMouseScroll', 'touchmove'].forEach(evt => {
        plotModalEl.addEventListener(evt, (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
    if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableScrollPropagation(plotModalEl);
        L.DomEvent.disableClickPropagation(plotModalEl);
    }
}
mapViewport.addEventListener('click', (e) => {
    if (e.target === mapViewport || e.target === mapContainer || e.target === mapImage) {
        closePlotModal();
    }
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlotModal();
});

function closePlotModal() {
    modalBackdrop.classList.remove('show');
}

// ----------------------------------------------------
// Director Mode: One-Click Digital Allotment Certificate
// ----------------------------------------------------
function exportDigitalAllotment(plotNo, customTerms) {
    const item = plotData.find(p => String(p.plot_no) === String(plotNo)) || {
        plot_no: plotNo,
        plot_size: '200',
        facing: 'East',
        plot_status: 'AVAILABLE',
        customer_name: ''
    };

    const plotAreaYds = parseFloat(String(item.plot_size || '').replace(/[^0-9.]/g, '')) || 200;
    const facingStr = item.facing || 'EAST';
    const customerName = item.customer_name || 'Valued Buyer';
    const projectMeta = { title: "Aspirealty AVATAR 2" };
    const defaultBaseRate = 15499;

    const ratePerYd = customTerms && customTerms.netRate ? customTerms.netRate : defaultBaseRate;
    const totalAmount = customTerms && customTerms.totalAmount ? customTerms.totalAmount : Math.round(plotAreaYds * ratePerYd);
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const certNo = `ASP-ALT-${plotNo}-${Date.now().toString().slice(-6)}`;
    const fmt = (v) => '₹ ' + Math.round(v).toLocaleString('en-IN');

    const bookingAmt = 100000;
    const amt15 = Math.round(totalAmount * 0.25);
    const amt45 = Math.max(0, totalAmount - bookingAmt - amt15);

    const qrData = encodeURIComponent(`ASPIREALTY OFFICIAL ALLOTMENT CERTIFICATE\nCert No: ${certNo}\nProject: ${projectMeta.title}\nPlot No: ${plotNo}\nPlot Area: ${plotAreaYds} Sq.Yds\nClient: ${customerName}\nTotal Value: ${fmt(totalAmount)}\nDirector Verified & Approved`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;

    const certWindow = window.open('', '_blank');
    if (!certWindow) {
        alert("Pop-up blocked! Please allow pop-ups to generate the Digital Allotment Certificate.");
        return;
    }

    const shareText = encodeURIComponent(`*ASPIREALTY INFRA DEVELOPERS*\nOfficial Provisional Plot Allotment Certificate\n\n📌 *Project*: ${projectMeta.title}\n🏡 *Plot No*: ${plotNo}\n📐 *Area*: ${plotAreaYds} Sq. Yards (${facingStr} Facing)\n👤 *Client*: ${customerName}\n💰 *Agreed Deal Value*: ${fmt(totalAmount)}\n📜 *Certificate No*: ${certNo}\n\nVerified and digitally authorized by Director.`);
    const whatsappUrl = `https://wa.me/?text=${shareText}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Provisional Plot Allotment Certificate - Plot #${plotNo}`)}&body=${shareText}`;

    certWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Digital Allotment Certificate - Plot #${plotNo} - ${projectMeta.title}</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Great+Vibes&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0f172a; color: #334155; padding: 30px 15px; }
                .cert-container { max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 8px solid #0f2942; padding: 40px; box-shadow: 0 25px 60px rgba(0,0,0,0.5); position: relative; overflow: hidden; }
                .cert-container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 10px; background: linear-gradient(90deg, #d97706, #facc15, #0284c7, #10b981); }
                .cert-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
                .brand-title { font-size: 24px; font-weight: 800; color: #0f2942; letter-spacing: -0.5px; }
                .brand-sub { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
                .cert-badge { background: #fef3c7; border: 1px solid #f59e0b; color: #b45309; padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
                .cert-title-block { text-align: center; margin-bottom: 30px; }
                .cert-title-block h1 { font-size: 26px; font-weight: 800; color: #0f2942; text-transform: uppercase; letter-spacing: 1px; }
                .cert-title-block p { font-size: 13px; color: #64748b; margin-top: 6px; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 25px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
                .info-item { display: flex; flex-direction: column; gap: 4px; }
                .info-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                .info-val { font-size: 15px; font-weight: 800; color: #0f2942; }
                .highlight-val { color: #0284c7; }
                .table-title { font-size: 14px; font-weight: 800; color: #0f2942; margin-bottom: 10px; text-transform: uppercase; }
                table.cert-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
                table.cert-table th, table.cert-table td { padding: 12px 14px; border: 1px solid #cbd5e1; text-align: left; }
                table.cert-table th { background: #0f2942; color: #ffffff; font-weight: 700; font-size: 12px; text-transform: uppercase; }
                .sig-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 35px; padding-top: 20px; border-top: 2px dashed #cbd5e1; }
                .qr-box { text-align: center; }
                .qr-box img { width: 90px; height: 90px; border-radius: 8px; border: 1px solid #cbd5e1; padding: 4px; }
                .signature-box { text-align: right; }
                .sig-font { font-family: 'Great Vibes', cursive; font-size: 32px; color: #0f2942; margin-bottom: -4px; }
                .director-stamp { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; border: 1.5px solid #10b981; color: #047857; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; margin-top: 6px; }
                .actions-bar { margin-top: 30px; text-align: center; display: flex; justify-content: center; gap: 12px; }
                .btn-act { padding: 12px 24px; border-radius: 10px; border: none; font-weight: 800; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; transition: transform 0.2s; }
                .btn-act:hover { transform: translateY(-2px); }
                .btn-print { background: #0284c7; }
                .btn-whatsapp { background: #25d366; }
                .btn-email { background: #6366f1; }
                @media print {
                    .actions-bar { display: none !important; }
                    body { background: #fff; padding: 0; }
                    .cert-container { border: none; box-shadow: none; padding: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="cert-container">
                <div class="cert-header">
                    <div>
                        <div class="brand-title"><i class="fa-solid fa-building-columns" style="color: #0284c7;"></i> ASPIREALTY INFRA DEVELOPERS</div>
                        <div class="brand-sub">Official Provisional Plot Allotment Certificate</div>
                    </div>
                    <div class="cert-badge">
                        <i class="fa-solid fa-shield-halved"></i> DIRECTOR VERIFIED
                    </div>
                </div>

                <div class="cert-title-block">
                    <h1>PROVISIONAL PLOT ALLOTMENT LETTER</h1>
                    <p>Certificate Serial No: <strong>${certNo}</strong> &bull; Date of Allotment: <strong>${todayStr}</strong></p>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Customer / Allottee Name</span>
                        <span class="info-val highlight-val">${customerName}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Project Name &amp; Phase</span>
                        <span class="info-val">${projectMeta.title}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Allotted Plot Number</span>
                        <span class="info-val highlight-val">Plot #${plotNo}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Plot Area &amp; Facing</span>
                        <span class="info-val">${plotAreaYds} Sq. Yards (${facingStr} Facing)</span>
                    </div>
                </div>

                <div class="table-title">Negotiated Deal &amp; Payment Schedule</div>
                <table class="cert-table">
                    <thead>
                        <tr>
                            <th>Milestone / Particulars</th>
                            <th style="text-align: center;">Timeline</th>
                            <th style="text-align: right;">Amount Payable</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Total Negotiated Deal Value</strong></td>
                            <td style="text-align: center;">Agreed Rate: ${fmt(ratePerYd)}/sq.yd</td>
                            <td style="text-align: right; font-weight: 800; color: #0284c7;">${fmt(totalAmount)}</td>
                        </tr>
                        <tr>
                            <td>Booking Advance Received</td>
                            <td style="text-align: center;">Immediate / Spot</td>
                            <td style="text-align: right;">₹ 1,00,000</td>
                        </tr>
                        <tr>
                            <td>15-Day Milestone Payment (25%)</td>
                            <td style="text-align: center;">Within 15 Days</td>
                            <td style="text-align: right;">${fmt(amt15)}</td>
                        </tr>
                        <tr>
                            <td>Final Balance Payment (100%)</td>
                            <td style="text-align: center;">Within 45 Days / Registration</td>
                            <td style="text-align: right;">${fmt(amt45)}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="font-size: 11px; color: #64748b; line-height: 1.5; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 3px solid #0284c7;">
                    <strong>Terms &amp; Conditions:</strong> This provisional allotment is issued subject to receipt of scheduled payment milestones. Registration charges and extra corpus fund (₹200/sq.yd) are payable separately at the time of sale deed execution as per government tariffs.
                </div>

                <div class="sig-footer">
                    <div class="qr-box">
                        <img src="${qrUrl}" alt="QR Verification Code">
                        <div style="font-size: 10px; font-weight: 700; color: #64748b; margin-top: 4px;">SCAN TO VERIFY CERTIFICATE</div>
                    </div>
                    <div class="signature-box">
                        <div class="sig-font">Aspirealty Director</div>
                        <div style="font-size: 12px; font-weight: 800; color: #0f2942;">AUTHORIZED DIRECTOR SIGNATURE</div>
                        <div class="director-stamp">
                            <i class="fa-solid fa-certificate"></i> DIGITALLY SEALED &amp; APPROVED
                        </div>
                    </div>
                </div>

                <div class="actions-bar">
                    <button class="btn-act btn-print" onclick="window.print()"><i class="fa-solid fa-print"></i> Print / Save PDF</button>
                    <a href="${whatsappUrl}" target="_blank" class="btn-act btn-whatsapp"><i class="fa-brands fa-whatsapp"></i> Share on WhatsApp</a>
                    <a href="${mailtoUrl}" class="btn-act btn-email"><i class="fa-solid fa-envelope"></i> Send Email</a>
                </div>
            </div>
        </body>
        </html>
    `);
    certWindow.document.close();
}

// ----------------------------------------------------
// Director Mode: Live Deal Closer & Margin Simulator
// ----------------------------------------------------
function openDealSimulator(plotNo) {
    const item = plotData.find(p => String(p.plot_no) === String(plotNo)) || {
        plot_no: plotNo,
        plot_size: '200',
        facing: 'East',
        plot_status: 'AVAILABLE',
        customer_name: ''
    };

    const plotAreaYds = parseFloat(String(item.plot_size || '').replace(/[^0-9.]/g, '')) || 200;
    const facingStr = item.facing || 'EAST';
    const isEast = facingStr.toUpperCase().includes('EAST');
    const isMortgage = (item.plot_status && String(item.plot_status).toUpperCase().includes('MORTGAGE')) || (item.remarks && String(item.remarks).toUpperCase().includes('MORTGAGE'));
    const isCorner = (item.is_corner === true) || (item.remarks && String(item.remarks).toUpperCase().includes('CORNER'));

    const defaultBaseRate = 15499;
    const eastRate = isEast ? 200 : 0;
    const cornerRate = isCorner ? 500 : 0;
    const mortgageRate = isMortgage ? 300 : 0;
    const standardEffectiveRate = defaultBaseRate + eastRate + cornerRate + mortgageRate;

    const modalBackdrop = document.getElementById('dealSimulatorModalBackdrop');
    const modalBody = document.getElementById('dealSimulatorBody');
    if (!modalBackdrop || !modalBody) return;

    const fmt = (v) => '₹ ' + Math.round(v).toLocaleString('en-IN');

    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
            <!-- Plot Summary Card -->
            <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); padding: 12px 14px; border-radius: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Target Plot</span>
                    <div style="font-size: 18px; font-weight: 800; color: #facc15;">Plot #${item.plot_no} (${plotAreaYds} Sq.Yds)</div>
                </div>
                <div>
                    <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Standard Rate Card</span>
                    <div style="font-size: 15px; font-weight: 700; color: #fff;">${fmt(standardEffectiveRate)} / sq.yd</div>
                </div>
            </div>

            <!-- Controls -->
            <div class="sim-control-group">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 12px; font-weight: 700; color: #fff;">Target Negotiated Rate / Sq.yd</label>
                    <span id="simRateDisplay" style="font-size: 16px; font-weight: 800; color: #facc15;">${fmt(standardEffectiveRate)}</span>
                </div>
                <input type="range" id="simRateRange" class="sim-slider" min="10000" max="25000" step="50" value="${standardEffectiveRate}">
            </div>

            <div class="sim-control-group">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 12px; font-weight: 700; color: #fff;">Spot Payment Discount (Flat)</label>
                    <span id="simSpotDiscountDisplay" style="font-size: 14px; font-weight: 700; color: #34d399;">₹ 0</span>
                </div>
                <input type="range" id="simSpotDiscountRange" class="sim-slider" min="0" max="200000" step="5000" value="0">
            </div>

            <div class="sim-control-group" style="gap: 10px;">
                <label style="font-size: 11.5px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Director Special Waivers</label>
                ${isEast ? `
                <label class="sim-toggle-switch">
                    <span>Waive East Facing Premium (₹200/sq.yd)</span>
                    <input type="checkbox" id="simWaiveEast">
                </label>` : ''}
                ${isCorner ? `
                <label class="sim-toggle-switch">
                    <span>Waive Corner Plot Premium (₹500/sq.yd)</span>
                    <input type="checkbox" id="simWaiveCorner">
                </label>` : ''}
                ${isMortgage ? `
                <label class="sim-toggle-switch">
                    <span>Waive Mortgage Plot Charge (₹300/sq.yd)</span>
                    <input type="checkbox" id="simWaiveMortgage">
                </label>` : ''}
            </div>

            <!-- Live Results Banner -->
            <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9)); border: 1px solid rgba(250, 204, 21, 0.3); padding: 14px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">Final Negotiated Deal Amount</span>
                    <span id="simTotalDealVal" style="font-size: 20px; font-weight: 800; color: #34d399;">${fmt(Math.round(plotAreaYds * standardEffectiveRate))}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">Total Buyer Savings</span>
                    <span id="simTotalSavingsVal" style="font-size: 14px; font-weight: 700; color: #60a5fa;">₹ 0</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
                    <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">Profitability Status</span>
                    <span id="simMarginBadge" class="margin-badge margin-high"><i class="fa-solid fa-circle-check"></i> High Margin (100%)</span>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: 6px;">
                <button id="btnApplyDealToQuote" class="admin-login-btn" style="flex: 1; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; font-weight: 700; padding: 12px; border-radius: 8px; cursor: pointer;">
                    <i class="fa-solid fa-file-invoice-dollar"></i> Export Quote Sheet
                </button>
            </div>
        </div>
    `;

    modalBackdrop.classList.add('show');

    const rateRange = document.getElementById('simRateRange');
    const spotRange = document.getElementById('simSpotDiscountRange');
    const waiveEast = document.getElementById('simWaiveEast');
    const waiveCorner = document.getElementById('simWaiveCorner');
    const waiveMortgage = document.getElementById('simWaiveMortgage');

    function updateSimCalculations() {
        let currentRate = parseFloat(rateRange.value) || standardEffectiveRate;
        const spotDisc = parseFloat(spotRange.value) || 0;

        if (waiveEast && waiveEast.checked) currentRate = Math.max(0, currentRate - 200);
        if (waiveCorner && waiveCorner.checked) currentRate = Math.max(0, currentRate - 500);
        if (waiveMortgage && waiveMortgage.checked) currentRate = Math.max(0, currentRate - 300);

        document.getElementById('simRateDisplay').textContent = fmt(currentRate);
        document.getElementById('simSpotDiscountDisplay').textContent = fmt(spotDisc);

        const totalDealAmount = Math.max(0, Math.round((plotAreaYds * currentRate) - spotDisc));
        const standardTotalAmount = Math.round(plotAreaYds * standardEffectiveRate);
        const totalSavings = Math.max(0, standardTotalAmount - totalDealAmount);

        document.getElementById('simTotalDealVal').textContent = fmt(totalDealAmount);
        document.getElementById('simTotalSavingsVal').textContent = fmt(totalSavings);

        const marginPct = Math.round((totalDealAmount / standardTotalAmount) * 100);
        const marginBadge = document.getElementById('simMarginBadge');
        if (marginBadge) {
            if (marginPct >= 90) {
                marginBadge.className = 'margin-badge margin-high';
                marginBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> High Margin (${marginPct}%)`;
            } else if (marginPct >= 78) {
                marginBadge.className = 'margin-badge margin-mod';
                marginBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Moderate Margin (${marginPct}%)`;
            } else {
                marginBadge.className = 'margin-badge margin-low';
                marginBadge.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Tight Margin (${marginPct}%)`;
            }
        }

        return { netRate: currentRate, totalAmount: totalDealAmount };
    }

    [rateRange, spotRange, waiveEast, waiveCorner, waiveMortgage].forEach(el => {
        if (el) el.addEventListener('input', updateSimCalculations);
    });

    const applyQuoteBtn = document.getElementById('btnApplyDealToQuote');
    if (applyQuoteBtn) {
        applyQuoteBtn.addEventListener('click', () => {
            const terms = updateSimCalculations();
            modalBackdrop.classList.remove('show');
            if (typeof exportPriceQuote === 'function') exportPriceQuote(plotNo, terms);
        });
    }
}

function updateStatistics() {
    const totalCount = plotData.length || 131;
    if (statTotalPlots) statTotalPlots.textContent = totalCount;
    
    let counts = {
        'EVERYONES': 0,
        'AVAILABLE': 0,
        'PREM KUMAR': 0,
        'SURESH': 0,
        'SOUMITH': 0
    };

    plotData.forEach(p => {
        const s = String(p.plot_status || '').toUpperCase().trim();
        if (String(p.plot_no) === '1' || s === 'EVERYONES' || s === "EVERYONE'S" || s === 'EVERYONE') {
            counts['EVERYONES']++;
        } else if (s === 'PREM KUMAR' || s === 'PREMKUMAR' || s === 'PREM' || s === 'MORTGAGE' || s === 'HOLD') {
            counts['PREM KUMAR']++;
        } else if (s === 'SURESH' || s === 'REGISTERED') {
            counts['SURESH']++;
        } else if (s === 'SOUMITH' || s === 'SOLD' || s === 'BOOKED' || s === 'CLUB HOUSE') {
            counts['SOUMITH']++;
        } else {
            counts['AVAILABLE']++;
        }
    });

    if (statAvailablePlots) statAvailablePlots.textContent = counts['AVAILABLE'];
    if (statPremKumarPlots) statPremKumarPlots.textContent = counts['PREM KUMAR'];
    if (statSureshPlots) statSureshPlots.textContent = counts['SURESH'];
    if (statSoumithPlots) statSoumithPlots.textContent = counts['SOUMITH'];
    
    // Render Sidebar Legend items
    if (statusLegendList) {
        statusLegendList.innerHTML = `
            <div class="legend-item ${activeStatusFilters.has('EVERYONES') ? 'active' : ''}" id="legend-EVERYONES" style="--legend-color: #8b5cf6;">
                <div class="legend-label-group">
                    <div class="legend-color-dot" style="background-color: #8b5cf6;"></div>
                    <span class="legend-name">EVERYONES</span>
                </div>
                <span class="legend-count">${counts['EVERYONES']}</span>
            </div>
            <div class="legend-item ${activeStatusFilters.has('AVAILABLE') ? 'active' : ''}" id="legend-AVAILABLE" style="--legend-color: #10b981;">
                <div class="legend-label-group">
                    <div class="legend-color-dot" style="background-color: #10b981;"></div>
                    <span class="legend-name">AVAILABLE</span>
                </div>
                <span class="legend-count">${counts['AVAILABLE']}</span>
            </div>
            <div class="legend-item ${activeStatusFilters.has('PREM KUMAR') ? 'active' : ''}" id="legend-PREM_KUMAR" style="--legend-color: #f97316;">
                <div class="legend-label-group">
                    <div class="legend-color-dot" style="background-color: #f97316;"></div>
                    <span class="legend-name">PREM KUMAR</span>
                </div>
                <span class="legend-count">${counts['PREM KUMAR']}</span>
            </div>
            <div class="legend-item ${activeStatusFilters.has('SURESH') ? 'active' : ''}" id="legend-SURESH" style="--legend-color: #facc15;">
                <div class="legend-label-group">
                    <div class="legend-color-dot" style="background-color: #facc15;"></div>
                    <span class="legend-name">SURESH</span>
                </div>
                <span class="legend-count">${counts['SURESH']}</span>
            </div>
            <div class="legend-item ${activeStatusFilters.has('SOUMITH') ? 'active' : ''}" id="legend-SOUMITH" style="--legend-color: #3b82f6;">
                <div class="legend-label-group">
                    <div class="legend-color-dot" style="background-color: #3b82f6;"></div>
                    <span class="legend-name">SOUMITH</span>
                </div>
                <span class="legend-count">${counts['SOUMITH']}</span>
            </div>
        `;
    }

    // Render Floating Card Items
    const floatingLegendBody = document.getElementById('floatingLegendBody');
    if (floatingLegendBody) {
        floatingLegendBody.innerHTML = `
            <div class="floating-legend-item ${activeStatusFilters.has('EVERYONES') ? 'active' : ''}" data-status="EVERYONES" style="--status-color: #8b5cf6;">
                <div class="label-group"><span class="color-dot" style="background-color: #8b5cf6;"></span><span>EVERYONES</span></div>
                <span class="count-badge">${counts['EVERYONES']}</span>
            </div>
            <div class="floating-legend-item ${activeStatusFilters.has('AVAILABLE') ? 'active' : ''}" data-status="AVAILABLE" style="--status-color: #10b981;">
                <div class="label-group"><span class="color-dot" style="background-color: #10b981;"></span><span>AVAILABLE</span></div>
                <span class="count-badge">${counts['AVAILABLE']}</span>
            </div>
            <div class="floating-legend-item ${activeStatusFilters.has('PREM KUMAR') ? 'active' : ''}" data-status="PREM KUMAR" style="--status-color: #f97316;">
                <div class="label-group"><span class="color-dot" style="background-color: #f97316;"></span><span>PREM KUMAR</span></div>
                <span class="count-badge">${counts['PREM KUMAR']}</span>
            </div>
            <div class="floating-legend-item ${activeStatusFilters.has('SURESH') ? 'active' : ''}" data-status="SURESH" style="--status-color: #facc15;">
                <div class="label-group"><span class="color-dot" style="background-color: #facc15;"></span><span>SURESH</span></div>
                <span class="count-badge">${counts['SURESH']}</span>
            </div>
            <div class="floating-legend-item ${activeStatusFilters.has('SOUMITH') ? 'active' : ''}" data-status="SOUMITH" style="--status-color: #3b82f6;">
                <div class="label-group"><span class="color-dot" style="background-color: #3b82f6;"></span><span>SOUMITH</span></div>
                <span class="count-badge">${counts['SOUMITH']}</span>
            </div>
        `;

        floatingLegendBody.querySelectorAll('.floating-legend-item').forEach(item => {
            const st = item.dataset.status;
            item.addEventListener('click', () => {
                if (activeStatusFilters.has(st)) {
                    activeStatusFilters.delete(st);
                    item.classList.remove('active');
                } else {
                    activeStatusFilters.add(st);
                    item.classList.add('active');
                }
                applyFilters();
            });
        });
    }

    const simCloseBtn = document.getElementById('dealSimulatorCloseBtn');
    const simBackdrop = document.getElementById('dealSimulatorModalBackdrop');
    if (simCloseBtn) {
        simCloseBtn.addEventListener('click', () => {
            simBackdrop.classList.remove('show');
        });
    }
    if (simBackdrop) {
        simBackdrop.addEventListener('click', (e) => {
            if (e.target === simBackdrop) simBackdrop.classList.remove('show');
        });
    }

    // Attach form listeners for Sidebar Legend selections
    ['EVERYONES', 'AVAILABLE', 'PREM KUMAR', 'SURESH', 'SOUMITH'].forEach(status => {
        const itemKey = status.replace(' ', '_');
        const item = document.getElementById(`legend-${itemKey}`);
        if (item) {
            item.addEventListener('click', () => {
                if (activeStatusFilters.has(status)) {
                    activeStatusFilters.delete(status);
                    item.classList.remove('active');
                } else {
                    activeStatusFilters.add(status);
                    item.classList.add('active');
                }
                applyFilters();
            });
        }
    });
}

// ----------------------------------------------------
// Coordinate Mapper (Admin Mode Only)
// ----------------------------------------------------

function setupMapper() {
    toggleMapperBtn.addEventListener('click', () => {
        isMapperMode = !isMapperMode;
        if (isMapperMode) {
            toggleMapperBtn.textContent = 'Stop';
            toggleMapperBtn.style.color = 'var(--status-mortgage)';
            mapperPanel.style.display = 'block';
            buildMapperPlotList();
            highlightActiveMapperButton();
            mapTip.innerHTML = `<i class="fa-solid fa-map-pin" style="color: var(--accent);"></i> Click on the Layout drawing to place Plot #${activeMapperPlot}`;
        } else {
            toggleMapperBtn.textContent = 'Start';
            toggleMapperBtn.style.color = 'var(--accent)';
            mapperPanel.style.display = 'none';
            mapTip.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> Drag to Pan &bull; Scroll or Pinch to Zoom`;
        }
    });

    mapperActivePlot.addEventListener('input', () => {
        const val = parseInt(mapperActivePlot.value);
        if (val >= 1 && val <= 131) {
            activeMapperPlot = val;
            highlightActiveMapperButton();
            if (isMapperMode) {
                mapTip.innerHTML = `<i class="fa-solid fa-map-pin" style="color: var(--accent);"></i> Click on the Layout drawing to place Plot #${activeMapperPlot}`;
            }
        }
    });

    // Capture click on map container directly (1024x646 coordinates)
    mapContainer.addEventListener('click', (e) => {
        if (!isMapperMode) return;
        
        // Get absolute coordinates on the 1024x646 scale
        const rect = mapImage.getBoundingClientRect();
        const clickX = Math.round((e.clientX - rect.left) / zoomScale);
        const clickY = Math.round((e.clientY - rect.top) / zoomScale);
        
        // Save direct coordinates without scaling (fresh project!)
        plotCoordinates[activeMapperPlot] = {
            left: clickX,
            top: clickY
        };
        
        renderPlotDots();
        
        const activeBtn = document.getElementById(`mapper-btn-${activeMapperPlot}`);
        if (activeBtn) {
            activeBtn.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            activeBtn.style.color = 'var(--status-available)';
            activeBtn.style.borderColor = 'var(--status-available)';
        }
        
        // Auto-advance up to plot 131
        if (activeMapperPlot < 131) {
            activeMapperPlot++;
            mapperActivePlot.value = activeMapperPlot;
            highlightActiveMapperButton();
            mapTip.innerHTML = `<i class="fa-solid fa-map-pin" style="color: var(--accent);"></i> Click on the Layout drawing to place Plot #${activeMapperPlot}`;
        }
    });

    mapperExportBtn.addEventListener('click', () => {
        const coordsStr = "const plotCoordinates = " + JSON.stringify(plotCoordinates, null, 4) + ";";
        
        // Create popup with exported code
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,7,10,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;';
        
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:16px;width:90%;max-width:550px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);text-align:left;display:flex;flex-direction:column;gap:16px;';
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding-bottom:12px;">
                <span style="font-family:var(--font-heading);font-weight:700;font-size:16px;color:#fff;">Export coordinates config</span>
                <button id="closeExportPopup" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:20px;">&times;</button>
            </div>
            <p style="font-size:12px;color:var(--text-secondary);line-height:1.4;">
                Copy all coordinates code below and replace the entire content inside <b>plot_coords.js</b> file.
            </p>
            <textarea readonly style="width:100%;height:250px;background:var(--bg-tertiary);border:1px solid var(--border-color);color:#a7f3d0;padding:12px;border-radius:8px;font-family:monospace;font-size:11px;outline:none;resize:none;">${coordsStr}</textarea>
            <button id="copyExportCode" class="admin-login-btn" style="background:var(--accent);color:#fff;border:none;font-weight:700;padding:12px;border-radius:8px;cursor:pointer;">
                <i class="fa-solid fa-copy"></i> Copy to Clipboard
            </button>
        `;
        
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        document.getElementById('closeExportPopup').addEventListener('click', () => overlay.remove());
        
        document.getElementById('copyExportCode').addEventListener('click', () => {
            navigator.clipboard.writeText(coordsStr).then(() => {
                alert('Copied to clipboard successfully!');
            });
        });
    });
}

function buildMapperPlotList() {
    mapperPlotList.innerHTML = '';
    for (let i = 1; i <= 131; i++) {
        const btn = document.createElement('button');
        btn.id = `mapper-btn-${i}`;
        btn.style.cssText = 'background:rgba(255,255,255,0.02);border:1px solid var(--border-color);color:var(--text-secondary);font-size:10px;font-weight:700;padding:6px 0;border-radius:4px;cursor:pointer;transition:all 0.15s;';
        btn.textContent = i;
        
        // Style green if already mapped
        if (plotCoordinates[i]) {
            btn.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            btn.style.color = 'var(--status-available)';
            btn.style.borderColor = 'var(--status-available)';
        }
        
        btn.addEventListener('click', () => {
            activeMapperPlot = i;
            mapperActivePlot.value = i;
            highlightActiveMapperButton();
            mapTip.innerHTML = `<i class="fa-solid fa-map-pin" style="color: var(--accent);"></i> Click on the Layout drawing to place Plot #${activeMapperPlot}`;
        });
        
        mapperPlotList.appendChild(btn);
    }
}

function highlightActiveMapperButton() {
    for (let i = 1; i <= 131; i++) {
        const btn = document.getElementById(`mapper-btn-${i}`);
        if (btn) {
            if (i === activeMapperPlot) {
                btn.style.borderColor = 'var(--accent)';
                btn.style.boxShadow = '0 0 8px var(--accent-glow)';
                btn.style.color = '#fff';
            } else {
                btn.style.boxShadow = 'none';
                if (plotCoordinates[i]) {
                    btn.style.borderColor = 'var(--status-available)';
                    btn.style.color = 'var(--status-available)';
                } else {
                    btn.style.borderColor = 'var(--border-color)';
                    btn.style.color = 'var(--text-secondary)';
                }
            }
        }
    }
}

// ----------------------------------------------------
// Mobile responsive navigation
// ----------------------------------------------------

function setupMobileSidebar() {
    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.add('show');
    });
    sidebarCloseBtn.addEventListener('click', () => {
        sidebar.classList.remove('show');
    });
    sidebar.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
            if (e.target.closest('.suggestion-item') || e.target.closest('.filter-pill') || e.target.closest('.legend-item')) {
                sidebar.classList.remove('show');
            }
        }
    });
}

// ----------------------------------------------------
// Admin Mode Implementation
// ----------------------------------------------------

function setupAdmin() {
    const staffBtn = document.getElementById('staffLoginBtn');
    if (staffBtn) {
        staffBtn.addEventListener('click', () => {
            if (isAdminLoggedIn) return;
            loginModalBackdrop.classList.add('show');
            loginError.style.display = 'none';
            loginForm.reset();
        });
    }

    const tabStaff = document.getElementById('tabStaffLogin');
    const tabDirector = document.getElementById('tabDirectorLogin');
    const loginModalTitle = document.getElementById('loginModalTitle');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginUsernameLabel = document.getElementById('loginUsernameLabel');

    if (tabStaff && tabDirector) {
        tabStaff.addEventListener('click', () => {
            tabStaff.classList.add('active');
            tabDirector.classList.remove('active');
            tabStaff.style.background = 'var(--accent)';
            tabStaff.style.color = '#fff';
            tabDirector.style.background = 'transparent';
            tabDirector.style.color = 'var(--text-secondary)';
            if (loginModalTitle) loginModalTitle.innerHTML = '<i class="fa-solid fa-user-shield"></i> Staff Login';
            if (loginSubmitBtn) loginSubmitBtn.textContent = 'Login as Staff';
            if (loginUsernameLabel) loginUsernameLabel.textContent = 'Staff Username';
            loginUsername.placeholder = 'Enter staff username';
            loginError.style.display = 'none';
        });

        tabDirector.addEventListener('click', () => {
            tabDirector.classList.add('active');
            tabStaff.classList.remove('active');
            tabDirector.style.background = 'linear-gradient(135deg, #eab308, #ca8a04)';
            tabDirector.style.color = '#000';
            tabStaff.style.background = 'transparent';
            tabStaff.style.color = 'var(--text-secondary)';
            if (loginModalTitle) loginModalTitle.innerHTML = '<i class="fa-solid fa-crown" style="color: #facc15;"></i> Director Login';
            if (loginSubmitBtn) loginSubmitBtn.textContent = 'Login as Director';
            if (loginUsernameLabel) loginUsernameLabel.textContent = 'Director Login ID';
            loginUsername.placeholder = 'Enter Director ID (aspireality avatar)';
            loginError.style.display = 'none';
        });
    }

    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const togglePasswordIcon = document.getElementById('togglePasswordIcon');
    if (togglePasswordBtn && loginPassword) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = loginPassword.type === 'password';
            loginPassword.type = isPassword ? 'text' : 'password';
            if (togglePasswordIcon) {
                togglePasswordIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
        });
    }

    if (loginModalCloseBtn) {
        loginModalCloseBtn.addEventListener('click', () => {
            loginModalBackdrop.classList.remove('show');
        });
    }

    if (loginModalBackdrop) {
        loginModalBackdrop.addEventListener('click', (e) => {
            if (e.target === loginModalBackdrop) {
                loginModalBackdrop.classList.remove('show');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = loginUsername.value.trim().toLowerCase();
            const password = loginPassword.value;

            if (username === 'aspireality avatar' && password === 'rudravatar123@asp') {
                userRole = 'director';
                isAdminLoggedIn = true;
                isDirectorLoggedIn = true;
                isStaffLoggedIn = false;
                sessionStorage.setItem('userRole', 'director');
                sessionStorage.setItem('isAdminLoggedIn', 'true');
                loginModalBackdrop.classList.remove('show');
                setupAdminState();
                renderPlotDots();
                alert('Welcome, Director! Full access enabled.');
            } else if (username === 'admin' && password === 'admin') {
                userRole = 'staff';
                isAdminLoggedIn = true;
                isDirectorLoggedIn = false;
                isStaffLoggedIn = true;
                sessionStorage.setItem('userRole', 'staff');
                sessionStorage.setItem('isAdminLoggedIn', 'true');
                loginModalBackdrop.classList.remove('show');
                setupAdminState();
                renderPlotDots();
                alert('Welcome, Staff! Staff mode enabled.');
            } else {
                loginError.style.display = 'block';
            }
        });
    }
}

function setupAdminState() {
    if (!sidebarFooter) return;

    if (isAdminLoggedIn) {
        if (mapperSection) mapperSection.style.display = 'block';

        const roleBadgeHtml = isDirectorLoggedIn 
            ? `<div style="text-align: center; background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(202, 138, 4, 0.3)); border: 1px solid #facc15; color: #facc15; padding: 6px; border-radius: 8px; font-weight: 800; font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px;"><i class="fa-solid fa-crown"></i> Director Mode</div>`
            : `<div style="text-align: center; background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #60a5fa; padding: 6px; border-radius: 8px; font-weight: 800; font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px;"><i class="fa-solid fa-user-shield"></i> Staff Mode</div>`;

        sidebarFooter.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 0 4px;">
                ${roleBadgeHtml}
                <button class="admin-login-btn" id="exportDbBtn" style="background-color: var(--accent); color: #fff; border: none; font-weight: 700; cursor: pointer; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; font-size: 13px;">
                    <i class="fa-solid fa-download"></i> Export data.json
                </button>
                <button class="admin-login-btn" id="resetDbBtn" style="background-color: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border-color); font-weight: 600; cursor: pointer; padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; font-size: 11px;">
                    <i class="fa-solid fa-rotate-left"></i> Reset to Default
                </button>
                <button class="admin-login-btn" id="logoutBtn" style="background-color: var(--status-mortgage); color: #fff; border: none; font-weight: 700; cursor: pointer; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; font-size: 13px;">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Logout
                </button>
            </div>
        `;

        document.getElementById('exportDbBtn').addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(plotData, null, 4));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "data.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });

        document.getElementById('resetDbBtn').addEventListener('click', () => {
            if (confirm('Discard all local custom changes and reset the layout back to standard sheet data?')) {
                localStorage.removeItem('aspire_avatar2_data');
                window.location.reload();
            }
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            userRole = null;
            isAdminLoggedIn = false;
            isDirectorLoggedIn = false;
            isStaffLoggedIn = false;
            sessionStorage.removeItem('userRole');
            sessionStorage.removeItem('isAdminLoggedIn');
            alert('Logged out successfully.');
            window.location.reload();
        });

        let banner = document.getElementById('adminBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'adminBanner';
            banner.style.cssText = 'background: linear-gradient(90deg, #b45309, #d97706); color: #fff; text-align: center; padding: 8px; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; z-index: 1000; position: relative;';
            banner.innerHTML = `<i class="fa-solid fa-user-shield"></i> ADMINISTRATOR MODE ACTIVE &bull; Click any plot card to edit details, or use the Coordinate Mapper`;
            document.body.insertBefore(banner, document.body.firstChild);
        }
    } else {
        if (mapperSection) mapperSection.style.display = 'none';

        sidebarFooter.innerHTML = `
            <button class="admin-login-btn" id="staffLoginBtn" style="border: none; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-lock"></i> Staff Login
            </button>
        `;

        const banner = document.getElementById('adminBanner');
        if (banner) banner.remove();

        const staffBtn = document.getElementById('staffLoginBtn');
        if (staffBtn) {
            staffBtn.addEventListener('click', () => {
                loginModalBackdrop.classList.add('show');
                loginError.style.display = 'none';
                loginForm.reset();
            });
        }
    }
}

function openPlotEditForm(plotNo) {
    const item = plotData.find(p => String(p.plot_no) === String(plotNo)) || {
        plot_no: plotNo,
        plot_size: '',
        facing: 'East',
        plot_status: 'AVAILABLE',
        dim_north: '-',
        dim_south: '-',
        dim_east: '-',
        dim_west: '-',
        customer_name: '',
        reference_name: ''
    };

    modalBody.innerHTML = `
        <div class="edit-plot-form" style="display: flex; flex-direction: column; gap: 12px; text-align: left; max-height: 70vh; overflow-y: auto; padding-right: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 8px;">
                <span style="font-weight: 700; color: var(--accent); font-size: 16px;"><i class="fa-solid fa-edit"></i> Edit Plot #${item.plot_no}</span>
                <button id="cancelEditBtn" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-xmark"></i> Cancel
                </button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Plot Status</label>
                <select id="editStatus" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none; width: 100%;">
                    <option value="EVERYONES" ${item.plot_status === 'EVERYONES' ? 'selected' : ''}>EVERYONES (Violet)</option>
                    <option value="AVAILABLE" ${item.plot_status === 'AVAILABLE' ? 'selected' : ''}>AVAILABLE (Green)</option>
                    <option value="PREM KUMAR" ${item.plot_status === 'PREM KUMAR' ? 'selected' : ''}>PREM KUMAR (Orange)</option>
                    <option value="SURESH" ${item.plot_status === 'SURESH' ? 'selected' : ''}>SURESH (Yellow)</option>
                    <option value="SOUMITH" ${item.plot_status === 'SOUMITH' ? 'selected' : ''}>SOUMITH (Blue)</option>
                </select>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Plot Size (Sq. Yards)</label>
                <input type="text" id="editSize" value="${item.plot_size || ''}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none;">
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Facing Direction</label>
                <select id="editFacing" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none; width: 100%;">
                    <option value="East" ${item.facing === 'East' ? 'selected' : ''}>East</option>
                    <option value="West" ${item.facing === 'West' ? 'selected' : ''}>West</option>
                    <option value="North" ${item.facing === 'North' ? 'selected' : ''}>North</option>
                    <option value="South" ${item.facing === 'South' ? 'selected' : ''}>South</option>
                    <option value="North-East" ${item.facing === 'North-East' ? 'selected' : ''}>North-East</option>
                    <option value="North-West" ${item.facing === 'North-West' ? 'selected' : ''}>North-West</option>
                    <option value="South-East" ${item.facing === 'South-East' ? 'selected' : ''}>South-East</option>
                    <option value="South-West" ${item.facing === 'South-West' ? 'selected' : ''}>South-West</option>
                    <option value="East (Cross)" ${item.facing === 'East (Cross)' ? 'selected' : ''}>East (Cross)</option>
                    <option value="West (Cross)" ${item.facing === 'West (Cross)' ? 'selected' : ''}>West (Cross)</option>
                    <option value="North (Cross)" ${item.facing === 'North (Cross)' ? 'selected' : ''}>North (Cross)</option>
                </select>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; color: var(--text-secondary);">North Boundary</label>
                    <input type="text" id="editNorth" value="${item.dim_north || '-'}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; color: var(--text-secondary);">South Boundary</label>
                    <input type="text" id="editSouth" value="${item.dim_south || '-'}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; color: var(--text-secondary);">East Boundary</label>
                    <input type="text" id="editEast" value="${item.dim_east || '-'}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; color: var(--text-secondary);">West Boundary</label>
                    <input type="text" id="editWest" value="${item.dim_west || '-'}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none;">
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Customer Name</label>
                <input type="text" id="editCustomer" value="${item.customer_name || ''}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none;" placeholder="Full name">
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Reference / Share</label>
                <input type="text" id="editReference" value="${item.reference_name || ''}" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none;" placeholder="Developer / Land Owner">
            </div>
            
            <button id="savePlotEditBtn" class="admin-login-btn" style="background: var(--status-available); color: #fff; border: none; font-weight: 700; width: 100%; margin-top: 10px; padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-save"></i> Save Changes
            </button>
        </div>
    `;

    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        openPlotModal(plotNo);
    });

    document.getElementById('savePlotEditBtn').addEventListener('click', () => {
        savePlotEdits(plotNo);
    });
}

function savePlotEdits(plotNo) {
    const editStatus = document.getElementById('editStatus').value;
    const editSize = document.getElementById('editSize').value.trim();
    const editFacing = document.getElementById('editFacing').value;
    const editNorth = document.getElementById('editNorth').value.trim();
    const editSouth = document.getElementById('editSouth').value.trim();
    const editEast = document.getElementById('editEast').value.trim();
    const editWest = document.getElementById('editWest').value.trim();
    const editCustomer = document.getElementById('editCustomer').value.trim();
    const editReference = document.getElementById('editReference').value.trim();

    let idx = plotData.findIndex(p => String(p.plot_no) === String(plotNo));

    const updatedPlot = {
        plot_no: String(plotNo),
        plot_size: editSize,
        facing: editFacing,
        plot_status: editStatus,
        dim_north: editNorth,
        dim_south: editSouth,
        dim_east: editEast,
        dim_west: editWest,
        customer_name: editCustomer,
        reference_name: editReference
    };

    if (idx !== -1) {
        plotData[idx] = updatedPlot;
    } else {
        plotData.push(updatedPlot);
    }

    localStorage.setItem('aspire_avatar2_data', JSON.stringify(plotData));

    renderPlotDots();
    updateStatistics();
    openPlotModal(plotNo);
}
