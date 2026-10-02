/**
 * Tada Layout 3D Digital Interactive Model (Three.js)
 * Implements real-time 3D visualization, interactive plot parcels, 
 * lighting modes, camera presets, raycasting, status filters, and plot inspection.
 */

(function () {
    'use strict';

    // Module State
    let scene, camera, renderer, controls;
    let groundMesh, layoutTexture, layoutWorldGroup, satelliteMesh, wideSatelliteMesh;
    const plotMeshes = {};       // plotNo -> THREE.Mesh
    const plotLabels = {};       // plotNo -> THREE.Sprite
    const plotGroups = {};       // plotNo -> THREE.Group
    let lights = {};
    let currentLightingMode = 'day';
    let isAutoRotating = false;
    let hoveredPlotMesh = null;
    let selectedPlotNo = null;
    let animFrameId = null;
    let isModalOpen = false;
    let activeFilterStatus = 'ALL';
    let isXRayMode = false;
    let isBlueprintVisible = true;

    // Street Lights and Vehicles State
    let streetLightsGroup = null;
    const streetLightMats = {};
    const streetLightGeos = {};
    const streetLightDownwardLights = [];
    let vehiclesGroup = null;
    const vehiclesList = [];
    let vehicleHeadlightMaterial = null;
    let vehicleTaillightMaterial = null;
    let lastFrameTime = performance.now();

    // First-Person Walk Mode State (Free open walking simulator, FPS Pointer Lock & continuous free drag)
    let isWalkModeActive = false;
    let isPointerLocked = false;
    let walkYaw = -Math.PI / 2; // Facing East down the Central Boulevard
    let walkPitch = -0.02;
    const walkKeys = {};
    let walkBobTimer = 0;
    let walkCurrentSpeed = 0;
    const walkTouchDir = { x: 0, z: 0 };
    let preWalkCamPos = null;
    let preWalkTarget = null;
    let preWalkFov = 45;
    let isWalkDragging = false;
    let walkDragPrev = { x: 0, y: 0 };

    // 3D House Customization State (plotNo -> 'villa' | 'duplex' | 'bungalow' | 'open')
    const customPlotStyles = {};
    let globalDefaultStyle = 'villa';

    // Camera animation state
    let isCameraAnimating = false;
    let cameraStartPos = null;
    let cameraEndPos = null;
    let targetStartPos = null;
    let targetEndPos = null;
    let cameraAnimProgress = 1;
    const CAMERA_ANIM_SPEED = 0.045;

    // Highlight beacon
    let beaconRing = null;
    let beaconLight = null;

    // Constants
    const LAYOUT_WIDTH = 240;
    const LAYOUT_HEIGHT = 180;
    const BASE_ELEVATION = 0.8;

    // Camera Presets Data (Plain numeric arrays so no THREE is required at parse time)
    const CAMERA_PRESETS_DATA = {
        overview: { pos: [0, 130, 140], target: [0, 0, 0] },
        isometric: { pos: [120, 110, 120], target: [0, 0, 0] },
        lowAngle: { pos: [0, 22, 100], target: [0, 4, -20] },
        topDown: { pos: [0, 190, 0.01], target: [0, 0, 0] }
    };

    function getCameraPreset(key) {
        const item = CAMERA_PRESETS_DATA[key] || CAMERA_PRESETS_DATA.overview;
        if (typeof THREE === 'undefined') return item;
        return {
            pos: new THREE.Vector3(item.pos[0], item.pos[1], item.pos[2]),
            target: new THREE.Vector3(item.target[0], item.target[1], item.target[2])
        };
    }

    /**
     * Helper to get plot details from existing data sources
     */
    function getPlotDetails(plotNo) {
        if (typeof plotData !== 'undefined' && Array.isArray(plotData)) {
            const found = plotData.find(p => String(p.plot_no) === String(plotNo));
            if (found) return found;
        }
        if (typeof plotDataRawTada !== 'undefined' && Array.isArray(plotDataRawTada)) {
            const found = plotDataRawTada.find(p => String(p.plot_no) === String(plotNo));
            if (found) return found;
        }
        return {
            plot_no: plotNo,
            plot_size: 'N/A',
            facing: 'East',
            plot_status: 'AVAILABLE',
            reference_name: 'ASPIREALTY'
        };
    }

    function getPlotStatus(detail, plotNo) {
        if (typeof getPlotEffectiveStatus === 'function') {
            return getPlotEffectiveStatus(detail);
        }
        return (detail && detail.plot_status) ? detail.plot_status.toUpperCase().trim() : 'AVAILABLE';
    }

    function getPlotColor(status, plotNo, detail) {
        if (typeof getStatusColor === 'function') {
            return getStatusColor(status, plotNo, detail);
        }
        const s = String(status || '').toUpperCase();
        if (s === 'SOLD' || s === 'BOOKED') return '#1d4ed8';
        if (s === 'HOLD') return '#8b5cf6';
        if (s === 'MORTGAGE') return '#f97316';
        if (s === 'REGISTERED') return '#ff0000';
        return '#059669';
    }

    /**
     * Create Billboard Canvas Sprite for Plot Number Badge
     */
    function createPlotNumberSprite(plotNo, hexColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Draw pill shape background with dark sleek glass fill
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.beginPath();
        const r = 36;
        const x = 20, y = 16, w = 216, h = 96;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        // Prominent border colored with plot status
        ctx.lineWidth = 8;
        ctx.strokeStyle = hexColor || '#38bdf8';
        ctx.stroke();

        // Bold Crisp White Number
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 52px "Plus Jakarta Sans", Outfit, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(plotNo), 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(5.2, 2.6, 1);
        sprite.renderOrder = 999;
        sprite.userData = { plotNo };
        return sprite;
    }

    /**
     * Create a procedural architectural fallback texture for ground
     */
    function createProceduralGroundTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1536;
        const ctx = canvas.getContext('2d');

        // Transparent background so satellite terrain shows through
        ctx.clearRect(0, 0, 2048, 1536);

        // Main Avenue Roads
        ctx.fillStyle = '#334155';
        ctx.fillRect(160, 660, 1728, 80); // Main East-West Road
        ctx.fillRect(960, 120, 100, 1280); // Main North-South Road

        // Road markings
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(160, 700);
        ctx.lineTo(1888, 700);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1010, 120);
        ctx.lineTo(1010, 1400);
        ctx.stroke();
        ctx.setLineDash([]);

        // Road Text Labels
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('40 FEET MAIN ROAD', 550, 700);
        ctx.fillText('40 FEET MAIN ROAD', 1450, 700);

        // Draw Plot Parcels & numbers from plotCoordinates
        const coordsSource = (typeof plotCoordinates !== 'undefined') ? plotCoordinates : {};
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0284c7';
        ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        Object.keys(coordsSource).forEach(pNo => {
            const c = coordsSource[pNo];
            if (!c) return;
            const px = (c.left / 1024) * 2048;
            const py = (c.top / 768) * 1536;
            const w = 48;
            const h = 36;
            ctx.fillStyle = '#f0f9ff';
            ctx.fillRect(px - w/2, py - h/2, w, h);
            ctx.strokeRect(px - w/2, py - h/2, w, h);
            ctx.fillStyle = '#0369a1';
            ctx.fillText(pNo, px, py);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    /**
     * Initialize Three.js Scene, Camera, Renderer, Lights, and Ground
     */
    function initThreeScene() {
        if (typeof THREE === 'undefined') {
            console.error('Three.js library is not loaded.');
            return false;
        }

        const container = document.getElementById('threeCanvasContainer');
        if (!container) return false;

        // Container dimensions with fallback
        let w = container.clientWidth;
        let h = container.clientHeight;
        if (!w || !h || w === 0 || h === 0) {
            const viewport = document.getElementById('modal3DViewport') || container.parentElement;
            w = (viewport && viewport.clientWidth > 0) ? viewport.clientWidth : Math.floor(window.innerWidth * 0.92);
            h = (viewport && viewport.clientHeight > 0) ? viewport.clientHeight : Math.floor(window.innerHeight * 0.85);
        }
        const aspect = (w && h) ? w / h : (window.innerWidth / window.innerHeight);

        // Clean container
        container.innerHTML = '';

        // 1. Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 450, 2200);

        // 2. Camera
        const overviewPreset = getCameraPreset('overview');
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 4000);
        camera.position.copy(overviewPreset.pos);

        // 3. Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if (THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }
        container.appendChild(renderer.domElement);

        // 4. OrbitControls
        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.maxPolarAngle = Math.PI / 2 - 0.02;
            controls.minDistance = 1.0;
            controls.maxDistance = 600;
            controls.target.copy(overviewPreset.target);
        }

        // 5. Lighting
        setupLighting();

        // 6. Layout World Group (Rotated by -7.30° to match calibrated KMZ layout)
        layoutWorldGroup = new THREE.Group();
        layoutWorldGroup.rotation.y = THREE.MathUtils.degToRad(-7.30);
        scene.add(layoutWorldGroup);

        // 7. Ground Layout Plane, Google Satellite Map & Surrounding Terrain
        setupGroundAndEnvironment();

        // 8. 3D Plots
        build3DPlots();

        // 9. Street Lights along all layout roads
        setupStreetLights();

        // 10. Moving Vehicles on layout roads
        setupVehicles();

        // 11. Highlight Beacon (Spotlight & Ring)
        setupBeacon();

        // 12. Event Listeners for Raycasting & Resize
        setupEventListeners(container);

        return true;
    }

    /**
     * Setup Lights and Lighting Modes
     */
    function setupLighting() {
        lights.ambient = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(lights.ambient);

        lights.hemi = new THREE.HemisphereLight(0xe0f2fe, 0x166534, 0.35);
        scene.add(lights.hemi);

        lights.sun = new THREE.DirectionalLight(0xfffdf5, 0.95);
        lights.sun.position.set(80, 140, 100);
        lights.sun.castShadow = true;
        lights.sun.shadow.mapSize.width = 2048;
        lights.sun.shadow.mapSize.height = 2048;
        lights.sun.shadow.camera.near = 10;
        lights.sun.shadow.camera.far = 350;
        const d = 140;
        lights.sun.shadow.camera.left = -d;
        lights.sun.shadow.camera.right = d;
        lights.sun.shadow.camera.top = d;
        lights.sun.shadow.camera.bottom = -d;
        lights.sun.shadow.bias = -0.0005;
        scene.add(lights.sun);

        lights.nightLightsGroup = new THREE.Group();
        const streetLampColors = [0x38bdf8, 0x818cf8, 0xa855f7, 0x38bdf8];
        const lampPositions = [
            [-60, 4, -40], [60, 4, -40], [-60, 4, 40], [60, 4, 40], [0, 4, 0]
        ];
        lampPositions.forEach((pos, idx) => {
            const pLight = new THREE.PointLight(streetLampColors[idx % streetLampColors.length], 0, 80);
            pLight.position.set(pos[0], pos[1], pos[2]);
            lights.nightLightsGroup.add(pLight);
        });
        scene.add(lights.nightLightsGroup);
    }

    /**
     * Apply Lighting Presets (Day, Sunset, Cyber Night)
     */
    function applyLightingMode(mode) {
        currentLightingMode = mode;
        if (!scene || !lights.sun) return;

        if (mode === 'day') {
            scene.background.set(0x87ceeb);
            if (scene.fog) scene.fog.color.set(0x87ceeb);
            lights.ambient.color.set(0xffffff);
            lights.ambient.intensity = 0.45;
            lights.hemi.color.set(0xe0f2fe);
            lights.hemi.groundColor.set(0x166534);
            lights.hemi.intensity = 0.35;
            lights.sun.color.set(0xfffdf5);
            lights.sun.intensity = 0.95;
            lights.sun.position.set(80, 140, 100);
            lights.nightLightsGroup.children.forEach(l => l.intensity = 0);
            updatePlotEmissives(0.12);
        } else if (mode === 'sunset') {
            scene.background.set(0xfdba74);
            scene.fog.color.set(0xfed7aa);
            lights.ambient.color.set(0xfed7aa);
            lights.ambient.intensity = 0.55;
            lights.hemi.color.set(0xfb923c);
            lights.hemi.groundColor.set(0x78350f);
            lights.hemi.intensity = 0.5;
            lights.sun.color.set(0xf97316);
            lights.sun.intensity = 1.5;
            lights.sun.position.set(130, 60, -90);
            lights.nightLightsGroup.children.forEach(l => l.intensity = 0.3);
            updatePlotEmissives(0.15);
        } else if (mode === 'night') {
            scene.background.set(0x020617);
            scene.fog.color.set(0x0f172a);
            lights.ambient.color.set(0x1e293b);
            lights.ambient.intensity = 0.35;
            lights.hemi.color.set(0x1e1b4b);
            lights.hemi.groundColor.set(0x020617);
            lights.hemi.intensity = 0.3;
            lights.sun.color.set(0x38bdf8);
            lights.sun.intensity = 0.4;
            lights.sun.position.set(-60, 100, -70);
            lights.nightLightsGroup.children.forEach(l => l.intensity = 1.8);
            updatePlotEmissives(0.55);
        }

        // Update terrain and ground colors for realistic sunset and night ambiance
        const groundTint = (mode === 'night') ? 0x1e293b : (mode === 'sunset' ? 0xfed7aa : 0xffffff);
        if (wideSatelliteMesh && wideSatelliteMesh.material) wideSatelliteMesh.material.color.set(groundTint);
        if (satelliteMesh && satelliteMesh.material) satelliteMesh.material.color.set(groundTint);
        if (groundMesh && groundMesh.material) {
            groundMesh.material.color.set(mode === 'night' ? 0x64748b : (mode === 'sunset' ? 0xfed7aa : 0xffffff));
        }

        // Update street lights emissives & downward road illumination
        if (streetLightMats.lens) {
            streetLightMats.lens.emissiveIntensity = (mode === 'night') ? 3.0 : (mode === 'sunset' ? 2.0 : 0.85);
        }
        if (streetLightDownwardLights && streetLightDownwardLights.length > 0) {
            const dlIntensity = (mode === 'night') ? 1.6 : (mode === 'sunset' ? 0.6 : 0.0);
            streetLightDownwardLights.forEach(pl => pl.intensity = dlIntensity);
        }

        // Update vehicle lights emissives
        if (vehicleHeadlightMaterial) {
            vehicleHeadlightMaterial.emissiveIntensity = (mode === 'night') ? 3.5 : (mode === 'sunset' ? 2.4 : 1.2);
        }
        if (vehicleTaillightMaterial) {
            vehicleTaillightMaterial.emissiveIntensity = (mode === 'night') ? 3.0 : (mode === 'sunset' ? 2.2 : 1.2);
        }


    }

    function updatePlotEmissives(intensity) {
        Object.values(plotMeshes).forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.emissiveIntensity = intensity;
            }
        });
    }

    /**
     * Setup Ground Blueprint Plane, Surrounding Terrain & Walls
     */
    function setupGroundAndEnvironment() {
        const texLoader = new THREE.TextureLoader();
        if (window.location && window.location.protocol === 'file:') {
            texLoader.setCrossOrigin('');
        }

        // 1. Vast Outer Landscape Terrain (Far horizon surrounding Tada)
        const outerGeo = new THREE.PlaneGeometry(4500, 4500);
        const outerMat = new THREE.MeshBasicMaterial({
            color: 0x142417, // Natural satellite terrain green-earth tone
            side: THREE.DoubleSide
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.rotation.x = -Math.PI / 2;
        outerMesh.position.set(159.02, -0.26, 215.86);
        outerMesh.renderOrder = 0;
        scene.add(outerMesh);

        // 2. Wide Regional Esri Satellite Terrain Plane (Covers entire 4.7 km landscape)
        const wideSatGeo = new THREE.PlaneGeometry(2384, 2274, 16, 16);
        const wideSatMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        wideSatelliteMesh = new THREE.Mesh(wideSatGeo, wideSatMat);
        wideSatelliteMesh.rotation.x = -Math.PI / 2;
        wideSatelliteMesh.position.set(159.02, -0.20, 215.86);
        wideSatelliteMesh.renderOrder = 1;
        scene.add(wideSatelliteMesh);

        function applyWideSatTexture(tex) {
            if (!tex || !wideSatelliteMesh) return;
            const maxAniso = (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy)
                ? renderer.capabilities.getMaxAnisotropy() : 8;
            tex.anisotropy = maxAniso;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (THREE.sRGBEncoding) {
                tex.encoding = THREE.sRGBEncoding;
            }
            tex.needsUpdate = true;
            wideSatelliteMesh.material.map = tex;
            wideSatelliteMesh.renderOrder = 1;
            wideSatelliteMesh.material.needsUpdate = true;
        }

        // Priority 1: Wide satellite from embedded Base64 (instant offline/local load)
        if (typeof TADA_SATELLITE_WIDE_B64 !== 'undefined' && TADA_SATELLITE_WIDE_B64) {
            texLoader.load(TADA_SATELLITE_WIDE_B64, (tex) => {
                applyWideSatTexture(tex);
                console.log('✅ Loaded Wide Regional Esri Satellite terrain via embedded Base64.');
            });
        }
        // Priority 2: Wide satellite external image fallback
        texLoader.load('tada_satellite_wide.webp?v=1.9.2', applyWideSatTexture);

        // 3. Ultra High-Res Local Tada Esri Satellite Plane (Feathered edge seamlessly blends into wide terrain)
        const satGeo = new THREE.PlaneGeometry(447, 426.4, 16, 16);
        const satMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true
        });
        satelliteMesh = new THREE.Mesh(satGeo, satMat);
        satelliteMesh.rotation.x = -Math.PI / 2;
        satelliteMesh.position.set(10.03, -0.12, 2.68);
        satelliteMesh.renderOrder = 2;
        scene.add(satelliteMesh);

        function applySatTexture(tex) {
            if (!tex || !satelliteMesh) return;
            const maxAniso = (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy)
                ? renderer.capabilities.getMaxAnisotropy() : 8;
            tex.anisotropy = maxAniso;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (THREE.sRGBEncoding) {
                tex.encoding = THREE.sRGBEncoding;
            }
            tex.needsUpdate = true;
            satelliteMesh.material.map = tex;
            satelliteMesh.material.transparent = true;
            satelliteMesh.material.opacity = 1.0;
            satelliteMesh.material.depthWrite = false;
            satelliteMesh.material.depthTest = true;
            satelliteMesh.renderOrder = 2;
            satelliteMesh.material.needsUpdate = true;
        }

        // Priority 1: Instant load from embedded satellite base64 (local file:// & offline guaranteed)
        if (typeof TADA_SATELLITE_TEXTURE_B64 !== 'undefined' && TADA_SATELLITE_TEXTURE_B64) {
            texLoader.load(TADA_SATELLITE_TEXTURE_B64, (tex) => {
                applySatTexture(tex);
                console.log('✅ Loaded High-Res Tada Esri Satellite terrain via embedded Base64 URI.');
            });
        }

        // Priority 2: External Esri Satellite image files
        texLoader.load(
            'tada_satellite_ground.webp?v=1.9.2',
            (tex) => {
                applySatTexture(tex);
                console.log('✅ Loaded Esri satellite terrain: tada_satellite_ground.webp');
            },
            undefined,
            () => {
                texLoader.load('tada_satellite_ground.jpg?v=1.9.2', applySatTexture);
            }
        );

        // 4. Blueprint Layout Ground Plane (Inside rotated layoutWorldGroup)
        const layoutGeo = new THREE.PlaneGeometry(LAYOUT_WIDTH, LAYOUT_HEIGHT, 16, 16);
        const fallbackTex = createProceduralGroundTexture();
        const layoutMat = new THREE.MeshBasicMaterial({
            map: fallbackTex,
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -4
        });

        groundMesh = new THREE.Mesh(layoutGeo, layoutMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = 0.08;
        groundMesh.renderOrder = 10;
        groundMesh.receiveShadow = false;
        layoutWorldGroup.add(groundMesh);

        function applyLayoutTexture(tex) {
            if (!tex || !groundMesh) return;
            const maxAniso = (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) 
                ? renderer.capabilities.getMaxAnisotropy() : 8;
            tex.anisotropy = maxAniso;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (THREE.sRGBEncoding) {
                tex.encoding = THREE.sRGBEncoding;
            }
            tex.needsUpdate = true;
            layoutTexture = tex;
            groundMesh.material.transparent = true;
            groundMesh.material.opacity = 1.0;
            groundMesh.material.depthWrite = false;
            groundMesh.material.depthTest = true;
            groundMesh.material.polygonOffset = true;
            groundMesh.material.polygonOffsetFactor = -2;
            groundMesh.material.polygonOffsetUnits = -4;
            groundMesh.renderOrder = 10;
            groundMesh.material.map = tex;
            groundMesh.material.needsUpdate = true;
        }

        // Priority 1: Load from embedded Base64 (100% works locally on file:// without CORS and offline)
        if (typeof TADA_LAYOUT_TEXTURE_B64 !== 'undefined' && TADA_LAYOUT_TEXTURE_B64) {
            texLoader.load(TADA_LAYOUT_TEXTURE_B64, (tex) => {
                applyLayoutTexture(tex);
                console.log('✅ Loaded Tada 3D Blueprint layout via embedded Base64 URI.');
            });
        }

        // Priority 2: External texture fallback/supplement (Loads transparent map_layout_3d)
        texLoader.load(
            'map_layout_3d.webp?v=1.9.1',
            (tex) => {
                applyLayoutTexture(tex);
                console.log('✅ Loaded Tada 3D Blueprint layout: map_layout_3d.webp');
            },
            undefined,
            () => {
                texLoader.load(
                    'map_layout_3d.jpg?v=1.9.1',
                    (texJpg) => {
                        applyLayoutTexture(texJpg);
                        console.log('✅ Loaded Tada 3D Blueprint layout: map_layout_3d.jpg');
                    },
                    undefined,
                    () => {
                        console.log('Using procedural layout grid fallback.');
                    }
                );
            }
        );
    }

    /**
     * Build 3D Plots from 2D Coordinates
     */
    function build3DPlots() {
        const coordsSource = (typeof plotCoordinates !== 'undefined') ? plotCoordinates : {};
        const plotNumbers = Object.keys(coordsSource);

        if (plotNumbers.length === 0) {
            console.warn('3D Layout: No plotCoordinates found.');
            return;
        }

        const cornerStoneGeo = new THREE.BoxGeometry(0.35, 0.6, 0.35);
        const cornerStoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

        plotNumbers.forEach(plotNo => {
            const coord = coordsSource[plotNo];
            if (!coord || typeof coord.left !== 'number' || typeof coord.top !== 'number') return;

            const normX = coord.left / 1024 - 0.5;
            const normZ = coord.top / 768 - 0.5;
            const posX = normX * LAYOUT_WIDTH;
            const posZ = normZ * LAYOUT_HEIGHT;

            const detail = getPlotDetails(plotNo);
            const status = getPlotStatus(detail, plotNo);
            const colorHex = getPlotColor(status, plotNo, detail);
            const colorThree = new THREE.Color(colorHex);

            const areaSqYd = parseFloat(detail.plot_size) || 200;
            const sizeFactor = Math.min(Math.max(areaSqYd / 200, 0.85), 2.2);
            const pWidth = 3.6 * sizeFactor;
            const pDepth = 2.8 * sizeFactor;

            // 3D House Dimensions
            const houseW = pWidth * 0.72;
            const houseD = pDepth * 0.68;
            const houseH = 1.35;
            const plinthH = 0.16;
            const roofH = 1.05;

            const plotGroup = new THREE.Group();
            plotGroup.position.set(posX, 0, posZ);

            // 1. Plot Foundation Plinth / Base
            const plinthGeo = new THREE.BoxGeometry(pWidth * 0.94, plinthH, pDepth * 0.94);
            const plinthMat = new THREE.MeshStandardMaterial({
                color: 0x334155,
                roughness: 0.85
            });
            const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
            plinthMesh.position.y = plinthH / 2 + 0.08;
            plinthMesh.receiveShadow = true;
            plotGroup.add(plinthMesh);

            // 2. Main 3D Architecture Model (Customizable: Villa, Duplex, Bungalow, Open Plot)
            const style = customPlotStyles[plotNo] || globalDefaultStyle || 'villa';
            const houseMesh = createPlotArchitectureMesh(plotNo, detail, status, colorHex, pWidth, pDepth, style, plotGroup);
            plotGroup.add(houseMesh);
            plotMeshes[plotNo] = houseMesh;

            // Plot Survey Corner Stones
            const hw = pWidth / 2;
            const hd = pDepth / 2;
            const corners = [
                [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]
            ];
            corners.forEach(([cx, cz]) => {
                const stone = new THREE.Mesh(cornerStoneGeo, cornerStoneMat);
                stone.position.set(cx, 0.25, cz);
                plotGroup.add(stone);
            });

            // Plot Number Sprite Floating Above Roof Peak
            const labelSprite = createPlotNumberSprite(plotNo, colorHex);
            labelSprite.position.set(0, plinthH + houseH + roofH + 1.25, 0);
            labelSprite.renderOrder = 999;
            plotGroup.add(labelSprite);
            plotLabels[plotNo] = labelSprite;

            layoutWorldGroup.add(plotGroup);
            plotGroups[plotNo] = plotGroup;
        });
    }


    /**
     * Create Architecture Mesh for a Plot based on selected style ('villa', 'duplex', 'bungalow', 'open')
     */
    function createPlotArchitectureMesh(plotNo, detail, status, colorHex, pWidth, pDepth, styleKey, plotGroup) {
        const style = styleKey || customPlotStyles[plotNo] || globalDefaultStyle || 'villa';
        const colorThree = new THREE.Color(colorHex);
        const roofColor = colorThree.clone().multiplyScalar(0.70);
        const plinthH = 0.16;

        let mainMesh;
        let roofMesh = null;
        let totalH = plinthH + 1.2;
        let defaultY = 0;

        if (style === 'open') {
            // Open Residential Plot: Green lawn turf plinth + perimeter boundary walls + entry pillars
            const lawnH = 0.22;
            const lawnGeo = new THREE.BoxGeometry(pWidth * 0.90, lawnH, pDepth * 0.90);
            const lawnMat = new THREE.MeshStandardMaterial({
                color: 0x16a34a,
                roughness: 0.8,
                metalness: 0.05,
                emissive: 0x14532d,
                emissiveIntensity: 0.15
            });
            mainMesh = new THREE.Mesh(lawnGeo, lawnMat);
            defaultY = plinthH + lawnH / 2 + 0.08;
            mainMesh.position.y = defaultY;

            // Perimeter low boundary wall (0.35m high)
            const wallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
            const wallThick = 0.12;
            const wallH = 0.35;
            const wL = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, pDepth * 0.88), wallMat);
            wL.position.set(-pWidth * 0.44, wallH / 2 + lawnH / 2, 0);
            mainMesh.add(wL);

            const wR = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, pDepth * 0.88), wallMat);
            wR.position.set(pWidth * 0.44, wallH / 2 + lawnH / 2, 0);
            mainMesh.add(wR);

            const wB = new THREE.Mesh(new THREE.BoxGeometry(pWidth * 0.88, wallH, wallThick), wallMat);
            wB.position.set(0, wallH / 2 + lawnH / 2, -pDepth * 0.44);
            mainMesh.add(wB);

            // Front entry gate posts with status beacon
            const postGeo = new THREE.BoxGeometry(0.28, 0.65, 0.28);
            const postMat = new THREE.MeshStandardMaterial({ color: colorThree, emissive: colorThree, emissiveIntensity: 0.3 });
            const pL = new THREE.Mesh(postGeo, postMat);
            pL.position.set(-pWidth * 0.22, 0.32, pDepth * 0.44);
            mainMesh.add(pL);

            const pR = new THREE.Mesh(postGeo, postMat);
            pR.position.set(pWidth * 0.22, 0.32, pDepth * 0.44);
            mainMesh.add(pR);

            totalH = plinthH + lawnH + 0.65;

        } else if (style === 'duplex') {
            // Contemporary 2-Tier Stacked Duplex with cantilever & rooftop pergola terrace
            const houseW = pWidth * 0.74;
            const houseD = pDepth * 0.70;
            const floor1H = 0.95;
            const floor2H = 0.90;

            const houseMat = new THREE.MeshStandardMaterial({
                color: colorThree,
                roughness: 0.48,
                metalness: 0.08,
                emissive: colorThree,
                emissiveIntensity: 0.14
            });

            // Ground Floor
            const f1Geo = new THREE.BoxGeometry(houseW, floor1H, houseD);
            mainMesh = new THREE.Mesh(f1Geo, houseMat);
            defaultY = plinthH + floor1H / 2 + 0.08;
            mainMesh.position.y = defaultY;

            // Cantilevered Upper Floor (shifted slightly)
            const f2Geo = new THREE.BoxGeometry(houseW * 0.82, floor2H, houseD * 0.82);
            const f2Mat = new THREE.MeshStandardMaterial({
                color: colorThree.clone().lerp(new THREE.Color(0xffffff), 0.25),
                roughness: 0.42,
                emissive: colorThree,
                emissiveIntensity: 0.12
            });
            const f2Mesh = new THREE.Mesh(f2Geo, f2Mat);
            f2Mesh.position.set(-houseW * 0.06, floor1H / 2 + floor2H / 2, -houseD * 0.06);
            f2Mesh.castShadow = true;
            mainMesh.add(f2Mesh);

            // Rooftop Pergola Beams
            const pergolaMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
            for (let i = -2; i <= 2; i++) {
                const b = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.65, 0.08, 0.08), pergolaMat);
                b.position.set(-houseW * 0.06, floor1H / 2 + floor2H + 0.40, -houseD * 0.06 + (i * houseD * 0.12));
                mainMesh.add(b);
            }

            // Glass Balcony Railing
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                roughness: 0.1,
                metalness: 0.7,
                transparent: true,
                opacity: 0.65
            });
            const bal = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.78, 0.32, 0.04), glassMat);
            bal.position.set(0, floor1H / 2 + 0.16, houseD / 2 + 0.02);
            mainMesh.add(bal);

            // Panoramic Front Window
            const winMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x38bdf8, emissiveIntensity: 0.3 });
            const win = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.38, 0.55, 0.04), winMat);
            win.position.set(houseW * 0.15, 0, houseD / 2 + 0.02);
            mainMesh.add(win);

            totalH = plinthH + floor1H + floor2H + 0.5;

        } else if (style === 'bungalow') {
            // Classic Single-Floor Sprawling Estate Bungalow with Columned Veranda
            const houseW = pWidth * 0.80;
            const houseD = pDepth * 0.76;
            const houseH = 1.05;
            const roofH = 0.80;

            const houseMat = new THREE.MeshStandardMaterial({
                color: colorThree,
                roughness: 0.55,
                metalness: 0.05,
                emissive: colorThree,
                emissiveIntensity: 0.12
            });
            const houseGeo = new THREE.BoxGeometry(houseW, houseH, houseD);
            mainMesh = new THREE.Mesh(houseGeo, houseMat);
            defaultY = plinthH + houseH / 2 + 0.08;
            mainMesh.position.y = defaultY;

            // Wide Overhanging Hipped Tiled Roof
            const rGeo = new THREE.ConeGeometry(Math.sqrt(Math.pow(houseW * 0.62, 2) + Math.pow(houseD * 0.62, 2)), roofH, 4);
            rGeo.rotateY(Math.PI / 4);
            const rMat = new THREE.MeshStandardMaterial({
                color: roofColor,
                roughness: 0.45,
                emissive: roofColor,
                emissiveIntensity: 0.10
            });
            roofMesh = new THREE.Mesh(rGeo, rMat);
            roofMesh.position.set(0, houseH / 2 + roofH / 2, 0);
            roofMesh.castShadow = true;
            mainMesh.add(roofMesh);

            // Front Veranda Porch with 4 White Columns
            const colMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
            const colGeo = new THREE.CylinderGeometry(0.08, 0.08, houseH * 0.88, 8);
            for (let c = -1.5; c <= 1.5; c += 1.0) {
                const col = new THREE.Mesh(colGeo, colMat);
                col.position.set(c * (houseW * 0.22), -houseH * 0.06, houseD / 2 + 0.28);
                mainMesh.add(col);
            }
            // Veranda Roof Overhang
            const vRoof = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.84, 0.08, 0.38), rMat);
            vRoof.position.set(0, houseH / 2 - 0.02, houseD / 2 + 0.18);
            mainMesh.add(vRoof);

            // Front Arched Door
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
            const door = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.20, 0.68, 0.04), doorMat);
            door.position.set(0, -houseH / 2 + 0.34, houseD / 2 + 0.02);
            mainMesh.add(door);

            totalH = plinthH + houseH + roofH;

        } else {
            // Default 'villa': Architectural 2-story Villa with pitched roof & chimney
            const houseW = pWidth * 0.72;
            const houseD = pDepth * 0.68;
            const houseH = 1.35;
            const roofH = 1.05;

            const houseMat = new THREE.MeshStandardMaterial({
                color: colorThree,
                roughness: 0.52,
                metalness: 0.05,
                emissive: colorThree,
                emissiveIntensity: 0.14,
                transparent: true,
                opacity: 0.96,
                depthWrite: true
            });
            const houseGeo = new THREE.BoxGeometry(houseW, houseH, houseD);
            mainMesh = new THREE.Mesh(houseGeo, houseMat);
            defaultY = plinthH + houseH / 2 + 0.08;
            mainMesh.position.y = defaultY;

            // Pitched Hip Roof
            const roofRadius = Math.sqrt(Math.pow(houseW * 0.58, 2) + Math.pow(houseD * 0.58, 2));
            const roofGeo = new THREE.ConeGeometry(roofRadius, roofH, 4);
            roofGeo.rotateY(Math.PI / 4);
            const rMat = new THREE.MeshStandardMaterial({
                color: roofColor,
                roughness: 0.45,
                metalness: 0.05,
                emissive: roofColor,
                emissiveIntensity: 0.08,
                transparent: true,
                opacity: 0.96,
                depthWrite: true
            });
            roofMesh = new THREE.Mesh(roofGeo, rMat);
            roofMesh.position.set(0, houseH / 2 + roofH / 2, 0);
            roofMesh.castShadow = true;
            roofMesh.renderOrder = 21;
            mainMesh.add(roofMesh);

            // Door
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
            const door = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.24, 0.75, 0.06), doorMat);
            door.position.set(0, -houseH / 2 + 0.38, houseD / 2 + 0.03);
            mainMesh.add(door);

            // Windows
            const winMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.2, metalness: 0.6, emissive: 0x38bdf8, emissiveIntensity: 0.25 });
            const winL = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.20, 0.42, 0.05), winMat);
            winL.position.set(-houseW * 0.27, -0.05, houseD / 2 + 0.03);
            mainMesh.add(winL);
            const winR = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.20, 0.42, 0.05), winMat);
            winR.position.set(houseW * 0.27, -0.05, houseD / 2 + 0.03);
            mainMesh.add(winR);

            // Chimney
            const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.60, 0.32), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 }));
            chimney.position.set(houseW * 0.24, houseH / 2 + roofH * 0.52, -houseD * 0.15);
            mainMesh.add(chimney);

            totalH = plinthH + houseH + roofH;
        }

        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        mainMesh.renderOrder = 20;

        mainMesh.userData = {
            plotNo,
            detail,
            status,
            baseColorHex: colorHex,
            baseColor: colorThree.clone(),
            roofColor: roofColor.clone(),
            roofMesh: roofMesh,
            defaultY: defaultY,
            pWidth,
            pDepth,
            pHeight: totalH,
            parentGroup: plotGroup,
            styleKey: style
        };
        if (roofMesh) roofMesh.userData = { plotNo, parentMesh: mainMesh };

        return mainMesh;
    }

    /**
     * Rebuild a single plot's 3D model with a chosen architectural style
     */
    function rebuildPlotModel(plotNo, styleKey) {
        const oldMesh = plotMeshes[plotNo];
        const group = plotGroups[plotNo];
        if (!oldMesh || !group) return;

        customPlotStyles[plotNo] = styleKey;
        const u = oldMesh.userData;

        // Animate out scale
        group.remove(oldMesh);
        if (oldMesh.geometry) oldMesh.geometry.dispose();

        const newMesh = createPlotArchitectureMesh(plotNo, u.detail, u.status, u.baseColorHex, u.pWidth, u.pDepth, styleKey, group);
        group.add(newMesh);
        plotMeshes[plotNo] = newMesh;

        // Update plot label height
        if (plotLabels[plotNo]) {
            plotLabels[plotNo].position.y = newMesh.userData.pHeight + 1.25;
        }

        // Quick pop-in animation
        newMesh.scale.set(0.2, 0.2, 0.2);
        let scale = 0.2;
        const growInterval = setInterval(() => {
            scale += 0.2;
            if (scale >= 1.0) {
                scale = 1.0;
                clearInterval(growInterval);
            }
            newMesh.scale.set(scale, scale, scale);
        }, 16);
    }

    /**
     * Apply selected house style to all plots across the entire layout
     */
    function applyHouseStyleToAll(styleKey) {
        globalDefaultStyle = styleKey;
        Object.keys(plotMeshes).forEach(plotNo => {
            rebuildPlotModel(plotNo, styleKey);
        });
        console.log(`✅ Applied architectural house style '${styleKey}' to all 131 plots.`);
    }



    /**
     * Free Open First-Person Walk Simulator (FPS Pointer Lock, 360-deg drag look, direction-aligned WASD)
     */
    function enterWalkMode() {
        if (isWalkModeActive || !camera || !controls) return;
        isWalkModeActive = true;

        // Remember orbit state to restore upon exit
        preWalkCamPos = camera.position.clone();
        preWalkTarget = controls.target.clone();
        preWalkFov = camera.fov;

        controls.enabled = false;

        // Natural human wide-angle FOV (72 deg gives full immersive peripheral vision)
        camera.fov = 72;
        camera.updateProjectionMatrix();

        // Spawn player on Central 40' Boulevard facing East down the scenic avenue
        camera.position.set(-45.0, 1.85, -10.70);
        walkYaw = -Math.PI / 2;
        walkPitch = -0.02;
        walkCurrentSpeed = 0;
        camera.rotation.set(walkPitch, walkYaw, 0, 'YXZ');

        // Update UI
        const walkBtn = document.getElementById('threeWalkModeBtn');
        if (walkBtn) walkBtn.classList.add('active');

        document.querySelectorAll('.btn-cam-preset').forEach(b => b.classList.remove('active'));

        const hud = document.getElementById('threeWalkHud');
        if (hud) hud.classList.add('active');

        const reticle = document.getElementById('threeWalkReticle');
        if (reticle) reticle.classList.add('show');

        const guide = document.getElementById('threeControlsGuide');
        if (guide) guide.style.display = 'none';

        // Check if mobile/touch
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const dpad = document.getElementById('threeWalkTouchDpad');
        if (dpad && isTouch) dpad.classList.add('show');

        // Temporarily hide floating plot number billboard sprites for an immersive street view
        Object.values(plotLabels).forEach(lbl => {
            if (lbl) lbl.visible = false;
        });

        // Set cursor to crosshair for FPS exploration
        const container = document.getElementById('threeCanvasContainer');
        if (container) container.style.cursor = 'crosshair';

        console.log('🚶 Free Walk Simulator: Activated. Drag mouse to look freely in 360 deg, or click to lock mouse. WASD = Move where you look.');
    }

    function exitWalkMode() {
        if (!isWalkModeActive) return;
        isWalkModeActive = false;

        // Release pointer lock if active
        if (document.pointerLockElement) {
            try { document.exitPointerLock(); } catch(e) {}
        }

        // Restore orbit camera FOV
        if (camera) {
            camera.fov = preWalkFov || 45;
            camera.updateProjectionMatrix();
        }

        // Restore floating plot numbers
        Object.values(plotLabels).forEach(lbl => {
            if (lbl) lbl.visible = true;
        });

        if (controls) {
            controls.enabled = true;
            if (preWalkCamPos && preWalkTarget) {
                camera.position.copy(preWalkCamPos);
                controls.target.copy(preWalkTarget);
            } else {
                const preset = getCameraPreset('overview');
                camera.position.copy(preset.pos);
                controls.target.copy(preset.target);
            }
            controls.update();
        }

        const walkBtn = document.getElementById('threeWalkModeBtn');
        if (walkBtn) walkBtn.classList.remove('active');

        const hud = document.getElementById('threeWalkHud');
        if (hud) hud.classList.remove('active');

        const reticle = document.getElementById('threeWalkReticle');
        if (reticle) reticle.classList.remove('show');

        const guide = document.getElementById('threeControlsGuide');
        if (guide) guide.style.display = 'flex';

        const dpad = document.getElementById('threeWalkTouchDpad');
        if (dpad) dpad.classList.remove('show');

        const overBtn = document.querySelector('.btn-cam-preset[data-preset="overview"]');
        if (overBtn) overBtn.classList.add('active');

        const container = document.getElementById('threeCanvasContainer');
        if (container) container.style.cursor = 'grab';

        console.log('🚶 Walk Mode: Exited to Orbit Controls.');
    }

    function updateWalkMode(delta) {
        if (!isWalkModeActive || !camera) return;

        const dt = Math.min(0.08, Math.max(0.001, delta));

        // Smooth keyboard turning (Q / E or ArrowLeft / ArrowRight)
        const turnSpeed = 2.4;
        let didTurn = false;
        if (walkKeys['KeyQ'] || walkKeys['ArrowLeft']) {
            walkYaw += turnSpeed * dt;
            didTurn = true;
        }
        if (walkKeys['KeyE'] || walkKeys['ArrowRight']) {
            walkYaw -= turnSpeed * dt;
            didTurn = true;
        }
        if (didTurn) {
            camera.rotation.set(walkPitch, walkYaw, 0, 'YXZ');
        }

        // Determine input direction
        let moveForward = 0;
        let moveSide = 0;

        if (walkKeys['KeyW'] || (walkKeys['ArrowUp'] && !walkKeys['KeyW'])) moveForward += 1;
        if (walkKeys['KeyS'] || (walkKeys['ArrowDown'] && !walkKeys['KeyS'])) moveForward -= 1;
        if (walkKeys['KeyA']) moveSide -= 1;
        if (walkKeys['KeyD']) moveSide += 1;

        // Add virtual touch D-pad
        moveForward += walkTouchDir.z;
        moveSide += walkTouchDir.x;

        const isMoving = (moveForward !== 0 || moveSide !== 0);
        const isSprinting = (walkKeys['ShiftLeft'] || walkKeys['ShiftRight']);
        const targetSpeed = isMoving ? (isSprinting ? 18.0 : 10.0) : 0.0;

        // Fluid acceleration / deceleration ramp
        const accelRate = isMoving ? 16.0 : 20.0;
        walkCurrentSpeed += (targetSpeed - walkCurrentSpeed) * Math.min(1.0, accelRate * dt);

        if (walkCurrentSpeed > 0.05 && isMoving) {
            const len = Math.sqrt(moveForward * moveForward + moveSide * moveSide) || 1;
            const normF = moveForward / len;
            const normS = moveSide / len;

            // Free walking aligned 100% to current camera facing horizontal direction
            const fX = -Math.sin(walkYaw);
            const fZ = -Math.cos(walkYaw);
            const rX = Math.cos(walkYaw);
            const rZ = -Math.sin(walkYaw);

            const moveX = (fX * normF + rX * normS) * walkCurrentSpeed;
            const moveZ = (fZ * normF + rZ * normS) * walkCurrentSpeed;

            camera.position.x += moveX * dt;
            camera.position.z += moveZ * dt;

            // Natural human walking bobbing
            walkBobTimer += dt * (isSprinting ? 13.0 : 10.0);
            const bobOffset = Math.sin(walkBobTimer) * (isSprinting ? 0.05 : 0.035);
            camera.position.y = 1.85 + bobOffset;
        } else {
            camera.position.y += (1.85 - camera.position.y) * Math.min(1.0, 12.0 * dt);
        }

        // Open layout boundaries: Explore freely everywhere across the venture
        camera.position.x = Math.max(-500, Math.min(500, camera.position.x));
        camera.position.z = Math.max(-500, Math.min(500, camera.position.z));
    }

    function setupWalkInputListeners(container) {
        window.addEventListener('keydown', (e) => {
            if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.code === 'Escape' && isWalkModeActive) {
                if (document.pointerLockElement) {
                    try { document.exitPointerLock(); } catch(err) {}
                    return; // First escape unlocks pointer, second exits walk
                }
                exitWalkMode();
                return;
            }
            if (isWalkModeActive) {
                walkKeys[e.code] = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (isWalkModeActive) {
                walkKeys[e.code] = false;
            }
        });

        // Pointer Lock State Changes
        document.addEventListener('pointerlockchange', () => {
            isPointerLocked = (document.pointerLockElement === container || (renderer && document.pointerLockElement === renderer.domElement));
            const hint = document.getElementById('threeWalkLockHint');
            if (hint) {
                hint.textContent = isPointerLocked ? 'Free Look Active (Esc to unlock)' : 'Click / Drag';
            }
            if (container) {
                container.style.cursor = isPointerLocked ? 'none' : 'crosshair';
            }
        });

        if (container) {
            // Click to activate FPS Pointer Lock if not locked
            container.addEventListener('click', (e) => {
                if (isWalkModeActive) {
                    if (!document.pointerLockElement && container.requestPointerLock) {
                        try { container.requestPointerLock(); } catch(err) {}
                    }
                }
            });

            // Mouse Drag Look (works freely across window without needing pointer lock)
            container.addEventListener('mousedown', (e) => {
                if (isWalkModeActive && e.button === 0) {
                    isWalkDragging = true;
                    walkDragPrev.x = e.clientX;
                    walkDragPrev.y = e.clientY;
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (!isWalkModeActive) return;

                // Mode A: FPS Pointer Lock Active (Real-time 1:1 camera look)
                if (isPointerLocked || document.pointerLockElement === container || (renderer && document.pointerLockElement === renderer.domElement)) {
                    const movementX = e.movementX || e.mozMovementX || 0;
                    const movementY = e.movementY || e.mozMovementY || 0;
                    const sens = 0.0022;

                    walkYaw -= movementX * sens;
                    walkPitch -= movementY * sens;
                    walkPitch = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, walkPitch));
                    camera.rotation.set(walkPitch, walkYaw, 0, 'YXZ');
                    return;
                }

                // Mode B: Free Continuous Drag Look
                if (isWalkDragging) {
                    const dx = e.clientX - walkDragPrev.x;
                    const dy = e.clientY - walkDragPrev.y;
                    walkDragPrev.x = e.clientX;
                    walkDragPrev.y = e.clientY;

                    const sens = 0.0036;
                    walkYaw -= dx * sens;
                    walkPitch -= dy * sens;
                    walkPitch = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, walkPitch));
                    camera.rotation.set(walkPitch, walkYaw, 0, 'YXZ');
                }
            });

            window.addEventListener('mouseup', () => {
                isWalkDragging = false;
            });

            // Touch drag look on mobile / tablet
            container.addEventListener('touchstart', (e) => {
                if (isWalkModeActive && e.touches.length === 1) {
                    isWalkDragging = true;
                    walkDragPrev.x = e.touches[0].clientX;
                    walkDragPrev.y = e.touches[0].clientY;
                }
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (isWalkModeActive && isWalkDragging && e.touches.length === 1) {
                    const dx = e.touches[0].clientX - walkDragPrev.x;
                    const dy = e.touches[0].clientY - walkDragPrev.y;
                    walkDragPrev.x = e.touches[0].clientX;
                    walkDragPrev.y = e.touches[0].clientY;

                    const sens = 0.0048;
                    walkYaw -= dx * sens;
                    walkPitch -= dy * sens;
                    walkPitch = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, walkPitch));
                    camera.rotation.set(walkPitch, walkYaw, 0, 'YXZ');
                }
            }, { passive: true });

            container.addEventListener('touchend', () => {
                isWalkDragging = false;
            });
        }
    }


    /**
     * Setup Architectural LED Street Lights along all layout roads
     */
    function setupStreetLights() {
        if (streetLightsGroup) {
            layoutWorldGroup.remove(streetLightsGroup);
            streetLightsGroup = null;
        }

        streetLightsGroup = new THREE.Group();
        streetLightDownwardLights.length = 0;

        // Shared geometries for high-end architectural street lights
        streetLightGeos.base = new THREE.CylinderGeometry(0.20, 0.26, 0.18, 12);
        streetLightGeos.pole = new THREE.CylinderGeometry(0.065, 0.10, 4.0, 12);

        // Elegant curved gooseneck cantilever arm sweeping out over the road
        const armCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 3.88, 0),
            new THREE.Vector3(0, 4.45, 0.22),
            new THREE.Vector3(0, 4.60, 0.70),
            new THREE.Vector3(0, 4.45, 1.25)
        ]);
        streetLightGeos.arm = new THREE.TubeGeometry(armCurve, 14, 0.045, 8, false);

        // Modern aerodynamic teardrop luminaire head
        streetLightGeos.head = new THREE.BoxGeometry(0.34, 0.10, 0.80);
        streetLightGeos.lens = new THREE.PlaneGeometry(0.26, 0.62);

        // Shared materials
        streetLightMats.base = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
        streetLightMats.pole = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.22 });
        streetLightMats.head = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.15 });
        streetLightMats.lens = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfff8e7,
            emissiveIntensity: (currentLightingMode === 'night') ? 3.2 : (currentLightingMode === 'sunset' ? 2.2 : 1.2),
            roughness: 0.1
        });

        function createSingleStreetLight(armAngle) {
            const lightObj = new THREE.Group();

            // 1. Concrete foundation collar at curb
            const baseMesh = new THREE.Mesh(streetLightGeos.base, streetLightMats.base);
            baseMesh.position.y = 0.09;
            lightObj.add(baseMesh);

            // 2. Vertical tapered dark metallic pole
            const poleMesh = new THREE.Mesh(streetLightGeos.pole, streetLightMats.pole);
            poleMesh.position.y = 2.08;
            lightObj.add(poleMesh);

            // 3. Arched Gooseneck Cantilever Arm facing the road
            const armPivot = new THREE.Group();
            armPivot.rotation.y = armAngle || 0;

            const armMesh = new THREE.Mesh(streetLightGeos.arm, streetLightMats.pole);
            armPivot.add(armMesh);

            // 4. Modern Luminaire Head (positioned at end of arched arm, slightly tilted down towards road)
            const headMesh = new THREE.Mesh(streetLightGeos.head, streetLightMats.head);
            headMesh.position.set(0, 4.40, 1.35);
            headMesh.rotation.x = Math.PI / 16; // 11 degree downward tilt facing road
            armPivot.add(headMesh);

            // 5. High-Efficacy LED Light Panel
            const lensMesh = new THREE.Mesh(streetLightGeos.lens, streetLightMats.lens);
            lensMesh.rotation.x = Math.PI / 2 + Math.PI / 16;
            lensMesh.position.set(0, 4.34, 1.35);
            armPivot.add(lensMesh);

            lightObj.add(armPivot);
            return lightObj;
        }

        // Exactly 2 architectural street lights per road at the ENDS of each road on curbs, facing inward over the road (10 roads = 20 lights)
        const streetLightPositions = [
            // Road 1: Central 40' Main Road (Center Z = -10.7) - West End and East End
            { x: -75.0, z: -12.8, armAngle: 0 },         // West End (North curb, arm points South +Z over road)
            { x: 92.0,  z: -8.6,  armAngle: Math.PI },   // East End (South curb, arm points North -Z over road)

            // Road 2: Southern 40' Road (Center Z = 66.5) - West End and East End
            { x: -26.0, z: 64.8, armAngle: 0 },          // West End (North curb, arm points South +Z over road)
            { x: 78.0,  z: 67.0, armAngle: Math.PI },    // East End (South curb, arm points North -Z over road)

            // Road 3: Avenue 1 (Center X = -67.0) - North End and South End
            { x: -68.5, z: -44.0, armAngle: Math.PI / 2 },  // North End (West curb, arm points East +X over road)
            { x: -65.5, z: 16.0,  armAngle: -Math.PI / 2 }, // South End (East curb, arm points West -X over road)

            // Road 4: Avenue 2 (Center X = -45.0) - North End and South End
            { x: -46.5, z: -44.0, armAngle: Math.PI / 2 },  // North End (West curb, arm points East +X over road)
            { x: -43.5, z: 16.0,  armAngle: -Math.PI / 2 }, // South End (East curb, arm points West -X over road)

            // Road 5: Avenue 3 (Center X = -21.8) - North End and South End
            { x: -23.2, z: -44.0, armAngle: Math.PI / 2 },  // North End (West curb, arm points East +X over road)
            { x: -20.4, z: 62.0,  armAngle: -Math.PI / 2 }, // South End (East curb, arm points West -X over road)

            // Road 6: Avenue 4 (Central Avenue, Center X = 0.35) - North End and South End
            { x: -0.4, z: -44.0, armAngle: Math.PI / 2 },   // North End (West curb, arm points East +X over road)
            { x: 1.6,  z: 62.0,  armAngle: -Math.PI / 2 },  // South End (East curb, arm points West -X over road)

            // Road 7: Avenue 5 (Center X = 23.5) - North End and South End
            { x: 22.2, z: -44.0, armAngle: Math.PI / 2 },   // North End (West curb, arm points East +X over road)
            { x: 24.8, z: 62.0,  armAngle: -Math.PI / 2 },  // South End (East curb, arm points West -X over road)

            // Road 8: Avenue 6 (Center X = 47.0) - North End and South End
            { x: 45.6, z: -44.0, armAngle: Math.PI / 2 },   // North End (West curb, arm points East +X over road)
            { x: 48.4, z: 62.0,  armAngle: -Math.PI / 2 },  // South End (East curb, arm points West -X over road)

            // Road 9: Avenue 7 (Center X = 70.0) - North End and South End
            { x: 68.6, z: -44.0, armAngle: Math.PI / 2 },   // North End (West curb, arm points East +X over road)
            { x: 71.4, z: -13.0, armAngle: -Math.PI / 2 },  // South End (East curb, arm points West -X over road)

            // Road 10: Eastern 60' Road (Center X = 98.0) - North End and South End
            { x: 97.5, z: -44.0, armAngle: Math.PI / 2 },   // North End (West curb, arm points East +X over road)
            { x: 97.4, z: -14.0, armAngle: -Math.PI / 2 }   // South End (East curb, arm points West -X over road)
        ];

        // Instantiate street lights
        streetLightPositions.forEach(pos => {
            const pole = createSingleStreetLight(pos.armAngle);
            pole.position.set(pos.x, 0.08, pos.z);
            streetLightsGroup.add(pole);
        });

        // Strategic downward road illumination point lights pool at road ends (smooth, lightweight)
        const downwardPositions = [
            [-75.0, 4.2, -10.7], [92.0, 4.2, -10.7],
            [-26.0, 4.2, 66.5],  [78.0, 4.2, 66.5],
            [-45.0, 4.2, -44.0], [0.35, 4.2, -44.0], [23.5, 4.2, -44.0], [47.0, 4.2, -44.0]
        ];

        const initialDlIntensity = (currentLightingMode === 'night') ? 1.6 : (currentLightingMode === 'sunset' ? 0.6 : 0.0);
        downwardPositions.forEach(p => {
            const dl = new THREE.PointLight(0xfff7ed, initialDlIntensity, 28, 1.8);
            dl.position.set(p[0], p[1], p[2]);
            streetLightsGroup.add(dl);
            streetLightDownwardLights.push(dl);
        });

        layoutWorldGroup.add(streetLightsGroup);
        console.log(`✅ Placed exactly 2 architectural street lights per road on curbs, facing directly over the road.`);
    }

    /**
     * Setup Moving Vehicles (Cars, SUVs, EVs, Vans) strictly on black layout roads
     */
    function setupVehicles() {
        if (vehiclesGroup) {
            layoutWorldGroup.remove(vehiclesGroup);
            vehiclesGroup = null;
        }

        vehiclesGroup = new THREE.Group();
        vehiclesList.length = 0;

        // Shared vehicle lights materials
        const initialHeadlightIntensity = (currentLightingMode === 'night') ? 3.5 : (currentLightingMode === 'sunset' ? 2.4 : 1.2);
        const initialTaillightIntensity = (currentLightingMode === 'night') ? 3.0 : (currentLightingMode === 'sunset' ? 2.2 : 1.2);

        vehicleHeadlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfef08a,
            emissiveIntensity: initialHeadlightIntensity,
            roughness: 0.1
        });

        vehicleTaillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff1e1e,
            emissiveIntensity: initialTaillightIntensity,
            roughness: 0.1
        });

        function createVehicleModel(config) {
            const group = new THREE.Group();
            const type = config.type || 'sedan';
            const color = config.color || 0xdc2626;

            const bodyW = (type === 'suv' || type === 'van') ? 1.85 : 1.7;
            const bodyL = (type === 'van') ? 4.2 : 3.8;
            const bodyH = (type === 'suv') ? 1.25 : (type === 'van' ? 1.4 : 1.05);

            // 1. Lower chassis / body
            const chassisGeo = new THREE.BoxGeometry(bodyW, bodyH * 0.48, bodyL);
            const paintMat = new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.72,
                roughness: 0.28
            });
            const chassis = new THREE.Mesh(chassisGeo, paintMat);
            chassis.position.y = bodyH * 0.28 + 0.12;
            chassis.castShadow = true;
            group.add(chassis);

            // 2. Cabin / Glass Greenhouse
            const cabinW = bodyW * 0.84;
            const cabinL = (type === 'van') ? bodyL * 0.72 : bodyL * 0.52;
            const cabinH = bodyH * 0.55;
            const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x0f172a,
                metalness: 0.9,
                roughness: 0.1,
                transparent: true,
                opacity: 0.92
            });
            const cabin = new THREE.Mesh(cabinGeo, glassMat);
            const cabinZ = (type === 'van') ? -bodyL * 0.05 : -bodyL * 0.06;
            cabin.position.set(0, bodyH * 0.65 + 0.12, cabinZ);
            cabin.castShadow = true;
            group.add(cabin);

            // 3. Cabin Roof Top (car paint)
            const roofGeo = new THREE.BoxGeometry(cabinW * 0.96, 0.08, cabinL * 0.92);
            const roof = new THREE.Mesh(roofGeo, paintMat);
            roof.position.set(0, bodyH * 0.65 + cabinH / 2 + 0.16, cabinZ);
            group.add(roof);

            // 4. Wheels
            const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
            wheelGeo.rotateZ(Math.PI / 2);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });

            const wheels = [];
            const xOffset = bodyW / 2 + 0.02;
            const zFront = bodyL * 0.30;
            const zRear = -bodyL * 0.30;
            const wheelY = 0.32;

            const wheelPositions = [
                [-xOffset, wheelY, zFront],
                [xOffset, wheelY, zFront],
                [-xOffset, wheelY, zRear],
                [xOffset, wheelY, zRear]
            ];

            wheelPositions.forEach(([wx, wy, wz]) => {
                const wheelGroup = new THREE.Group();
                wheelGroup.position.set(wx, wy, wz);
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.23, 8), rimMat);
                rim.rotateZ(Math.PI / 2);
                wheelGroup.add(tire);
                wheelGroup.add(rim);
                group.add(wheelGroup);
                wheels.push(tire);
            });

            // 5. Front Headlights (facing +Z forward)
            const headLightGeo = new THREE.BoxGeometry(0.38, 0.15, 0.1);
            const headL = new THREE.Mesh(headLightGeo, vehicleHeadlightMaterial);
            headL.position.set(-bodyW * 0.34, bodyH * 0.32 + 0.12, bodyL / 2 + 0.04);
            const headR = new THREE.Mesh(headLightGeo, vehicleHeadlightMaterial);
            headR.position.set(bodyW * 0.34, bodyH * 0.32 + 0.12, bodyL / 2 + 0.04);
            group.add(headL);
            group.add(headR);

            // Subtle forward light projection beam (facing +Z)
            const beamGeo = new THREE.ConeGeometry(1.0, 4.2, 10);
            beamGeo.rotateX(-Math.PI / 2);
            beamGeo.translate(0, 0, 2.1);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xfef08a,
                transparent: true,
                opacity: 0.12,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.position.set(0, bodyH * 0.30, bodyL / 2 + 0.2);
            group.add(beamMesh);

            // 6. Rear Taillights (facing -Z rear)
            const tailLightGeo = new THREE.BoxGeometry(0.38, 0.14, 0.08);
            const tailL = new THREE.Mesh(tailLightGeo, vehicleTaillightMaterial);
            tailL.position.set(-bodyW * 0.34, bodyH * 0.34 + 0.12, -bodyL / 2 - 0.04);
            const tailR = new THREE.Mesh(tailLightGeo, vehicleTaillightMaterial);
            tailR.position.set(bodyW * 0.34, bodyH * 0.34 + 0.12, -bodyL / 2 - 0.04);
            group.add(tailL);
            group.add(tailR);

            group.userData = { wheels, beamMesh };
            return group;
        }

        // Vehicle specifications and distinct routes strictly on black road corridors
        const vehicleConfigs = [
            // 1. Pearl White Modern SUV on Central 40' Boulevard (Eastbound Right Lane)
            {
                name: 'Pearl White SUV',
                type: 'suv',
                color: 0xf8fafc,
                speed: 13.5,
                waypoints: [
                    { x: -70.08, z: -9.84 },
                    { x: 87.89,  z: -9.84 },
                    { x: 87.89,  z: -11.60 },
                    { x: -70.08, z: -11.60 }
                ]
            },
            // 2. Sport Crimson Metallic Sedan on Central 40' Boulevard (Westbound Lane Offset)
            {
                name: 'Sport Crimson Sedan',
                type: 'sedan',
                color: 0xdc2626,
                speed: 14.8,
                waypoints: [
                    { x: 34.92,  z: -11.60 },
                    { x: -70.08, z: -11.60 },
                    { x: -70.08, z: -9.84 },
                    { x: 87.89,  z: -9.84 },
                    { x: 87.89,  z: -11.60 }
                ]
            },
            // 3. Emerald Green Electric Car on Avenue 2 (X = -45.0)
            {
                name: 'Emerald EV',
                type: 'sedan',
                color: 0x059669,
                speed: 11.5,
                waypoints: [
                    { x: -44.41, z: -41.84 },
                    { x: -44.41, z: 30.00 },
                    { x: -45.70, z: 30.00 },
                    { x: -45.70, z: -42.07 }
                ]
            },
            // 4. Obsidian Luxury Black SUV on Central Avenue 4 (X = 0.23)
            {
                name: 'Obsidian SUV',
                type: 'suv',
                color: 0x111827,
                speed: 12.0,
                waypoints: [
                    { x: 0.23, z: 30.00 },
                    { x: 0.23, z: -42.07 }
                ]
            },
            // 5. Sunset Amber Gold Crossover on Avenue 5 (X = 23.44)
            {
                name: 'Amber Crossover',
                type: 'sedan',
                color: 0xd97706,
                speed: 12.5,
                waypoints: [
                    { x: 23.44, z: -42.07 },
                    { x: 23.44, z: 30.00 }
                ]
            },
            // 6. City Delivery Van on Southern 40' Road (Z = 66.45)
            {
                name: 'City Delivery Van',
                type: 'van',
                color: 0xe2e8f0,
                speed: 11.0,
                waypoints: [
                    { x: -20.04, z: 66.45 },
                    { x: 69.96,  z: 66.45 }
                ]
            },
            // 7. Royal Blue Sedan on Avenue 7 (X = 69.96)
            {
                name: 'Royal Blue Sedan',
                type: 'sedan',
                color: 0x1d4ed8,
                speed: 12.5,
                waypoints: [
                    { x: 69.96, z: -42.19 },
                    { x: 69.96, z: -20.04 }
                ]
            }
        ];

        vehicleConfigs.forEach(cfg => {
            const mesh = createVehicleModel(cfg);
            const startWp = cfg.waypoints[0];
            mesh.position.set(startWp.x, 0.08, startWp.z);
            vehiclesGroup.add(mesh);

            vehiclesList.push({
                mesh: mesh,
                waypoints: cfg.waypoints,
                targetIndex: 1 % cfg.waypoints.length,
                speed: cfg.speed,
                currentYaw: 0
            });
        });

        layoutWorldGroup.add(vehiclesGroup);
        console.log(`✅ Deployed ${vehiclesList.length} animated vehicles actively moving across layout roads.`);
    }

    /**
     * Helper to smoothly interpolate angles avoiding 360-degree wrapping jumps
     */
    function lerpAngle(start, end, amount) {
        let diff = (end - start) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        return start + diff * amount;
    }

    /**
     * Update Moving Vehicles Positions, Orientations, and Wheel Rotations in Animation Loop
     */
    function updateVehicles(deltaTime) {
        if (!vehiclesList || vehiclesList.length === 0) return;

        vehiclesList.forEach(v => {
            const currentWp = v.waypoints[v.targetIndex];
            const mesh = v.mesh;
            const dx = currentWp.x - mesh.position.x;
            const dz = currentWp.z - mesh.position.z;
            const dist = Math.hypot(dx, dz);

            if (dist < 1.4) {
                // Reached waypoint: advance to next waypoint
                v.targetIndex = (v.targetIndex + 1) % v.waypoints.length;
            } else {
                // Compute desired heading angle (+Z is forward direction)
                const targetYaw = Math.atan2(dx, dz);
                v.currentYaw = lerpAngle(v.currentYaw, targetYaw, Math.min(deltaTime * 6.5, 0.35));
                mesh.rotation.y = v.currentYaw;

                // Move forward along current heading
                const step = v.speed * deltaTime;
                mesh.position.x += Math.sin(v.currentYaw) * step;
                mesh.position.z += Math.cos(v.currentYaw) * step;

                // Rotate wheels proportionally to movement
                if (mesh.userData && mesh.userData.wheels) {
                    mesh.userData.wheels.forEach(tire => {
                        tire.rotation.x += step * 2.5;
                    });
                }
            }
        });
    }

    /**
     * Setup Visual Beacon (Spotlight & Pulse Ring for Selected Plot)
     */
    function setupBeacon() {
        const ringGeo = new THREE.RingGeometry(2.5, 3.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        beaconRing = new THREE.Mesh(ringGeo, ringMat);
        beaconRing.rotation.x = -Math.PI / 2;
        beaconRing.position.y = 0.1;
        beaconRing.visible = false;
        scene.add(beaconRing);

        beaconLight = new THREE.PointLight(0x38bdf8, 0, 40);
        beaconLight.position.y = 6;
        scene.add(beaconLight);
    }

    /**
     * Event Listeners for Raycasting, Click, and Resize
     */
    function setupEventListeners(container) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        function getCanvasRelativeCoords(e) {
            const rect = container.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
                clientX: e.clientX,
                clientY: e.clientY
            };
        }

        container.addEventListener('mousemove', (e) => {
            if (isWalkModeActive) {
                if (hoveredPlotMesh) {
                    unhoverPlot(hoveredPlotMesh);
                    hoveredPlotMesh = null;
                }
                hide3DTooltip();
                return;
            }
            const coords = getCanvasRelativeCoords(e);
            mouse.x = coords.x;
            mouse.y = coords.y;

            raycaster.setFromCamera(mouse, camera);
            const meshArray = Object.values(plotMeshes);
            const intersects = raycaster.intersectObjects(meshArray, true);

            if (intersects.length > 0) {
                let hit = intersects[0].object;
                while (hit && !hit.userData.plotNo && hit.parent) {
                    hit = hit.parent;
                }
                if (hit && hit.userData.parentMesh) {
                    hit = hit.userData.parentMesh;
                }
                if (hit && hit.userData.plotNo) {
                    container.style.cursor = 'pointer';

                    if (hoveredPlotMesh !== hit) {
                        unhoverPlot(hoveredPlotMesh);
                        hoverPlot(hit);
                        hoveredPlotMesh = hit;
                    }
                    show3DTooltip(hit.userData, coords.clientX, coords.clientY);
                    return;
                }
            }

            container.style.cursor = 'grab';
            if (hoveredPlotMesh) {
                unhoverPlot(hoveredPlotMesh);
                hoveredPlotMesh = null;
            }
            hide3DTooltip();
        });

        container.addEventListener('mouseleave', () => {
            if (hoveredPlotMesh) {
                unhoverPlot(hoveredPlotMesh);
                hoveredPlotMesh = null;
            }
            hide3DTooltip();
        });

        container.addEventListener('click', (e) => {
            if (isWalkModeActive) return; // Prevent clicking plots / snapping camera while walking
            const coords = getCanvasRelativeCoords(e);
            mouse.x = coords.x;
            mouse.y = coords.y;

            raycaster.setFromCamera(mouse, camera);
            const meshArray = Object.values(plotMeshes);
            const intersects = raycaster.intersectObjects(meshArray, true);

            if (intersects.length > 0) {
                let hit = intersects[0].object;
                while (hit && !hit.userData.plotNo && hit.parent) {
                    hit = hit.parent;
                }
                if (hit && hit.userData.parentMesh) {
                    hit = hit.userData.parentMesh;
                }
                if (hit && hit.userData.plotNo) {
                    selectPlot(hit.userData.plotNo, true);
                }
            }
        });

        window.addEventListener('resize', onWindowResize);
        setupWalkInputListeners(container);
    }

    function onWindowResize() {
        const container = document.getElementById('threeCanvasContainer');
        if (!container || !renderer || !camera) return;
        let w = container.clientWidth;
        let h = container.clientHeight;
        if (!w || !h || w === 0 || h === 0) {
            const viewport = document.getElementById('modal3DViewport') || container.parentElement;
            w = (viewport && viewport.clientWidth > 0) ? viewport.clientWidth : Math.floor(window.innerWidth * 0.92);
            h = (viewport && viewport.clientHeight > 0) ? viewport.clientHeight : Math.floor(window.innerHeight * 0.85);
        }
        if (w === 0 || h === 0) return;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    /**
     * Hover Visual Effects
     */
    function hoverPlot(mesh) {
        if (!mesh) return;
        mesh.position.y = mesh.userData.defaultY + 0.45;
        if (mesh.material) {
            mesh.material.emissiveIntensity = 0.40;
        }
        if (mesh.userData.roofMesh && mesh.userData.roofMesh.material) {
            mesh.userData.roofMesh.material.emissiveIntensity = 0.28;
        }
    }

    function unhoverPlot(mesh) {
        if (!mesh) return;
        mesh.position.y = mesh.userData.defaultY;
        if (mesh.material) {
            mesh.material.emissiveIntensity = (currentLightingMode === 'night') ? 0.55 : 0.14;
        }
        if (mesh.userData.roofMesh && mesh.userData.roofMesh.material) {
            mesh.userData.roofMesh.material.emissiveIntensity = (currentLightingMode === 'night') ? 0.45 : 0.08;
        }
    }

    /**
     * Select Plot in 3D: Move Camera, Light Beacon, Open Drawer
     */
    function selectPlot(plotNo, smoothFocus = true) {
        const mesh = plotMeshes[plotNo];
        if (!mesh) return;

        selectedPlotNo = plotNo;
        const u = mesh.userData;
        const group = u.parentGroup;

        if (beaconRing && group) {
            const worldPos = new THREE.Vector3();
            group.getWorldPosition(worldPos);
            beaconRing.position.set(worldPos.x, 0.15, worldPos.z);
            beaconRing.visible = true;
            beaconLight.position.set(worldPos.x, 8, worldPos.z);
            beaconLight.color.set(u.baseColor);
            beaconLight.intensity = 2.5;
        }

        populate3DInspectDrawer(u.detail, plotNo, u.status, u.baseColorHex);

        if (smoothFocus && group) {
            const worldPos = new THREE.Vector3();
            group.getWorldPosition(worldPos);
            const offset = new THREE.Vector3(15, 22, 22);
            animateCameraTo(worldPos.clone().add(offset), worldPos);
        }
    }

    /**
     * Smooth Camera Glide Animation
     */
    function animateCameraTo(newCamPos, newTargetPos) {
        if (!camera || !controls) return;
        cameraStartPos = camera.position.clone();
        cameraEndPos = newCamPos.clone();
        targetStartPos = controls.target.clone();
        targetEndPos = newTargetPos.clone();
        cameraAnimProgress = 0;
        isCameraAnimating = true;
    }

    /**
     * Filter Plots in 3D (All, Available, Sold, Hold, Mortgage, Registered)
     */
    function filter3DPlots(status) {
        activeFilterStatus = String(status || 'ALL').toUpperCase();

        Object.keys(plotMeshes).forEach(plotNo => {
            const mesh = plotMeshes[plotNo];
            const label = plotLabels[plotNo];
            const group = plotGroups[plotNo];
            if (!mesh) return;

            const plotStatus = String(mesh.userData.status || '').toUpperCase();
            const pNum = parseInt(plotNo, 10);
            const isAspirealty = (pNum >= 1 && pNum <= 79 && ![18, 23, 24, 25, 39].includes(pNum));

            let match = false;
            if (activeFilterStatus === 'ALL') {
                match = true;
            } else if (activeFilterStatus === 'AVAILABLE' && (plotStatus === 'AVAILABLE' || (!isAspirealty && plotStatus === 'ASPIREALTY'))) {
                match = true;
            } else if (activeFilterStatus === 'ASPIREALTY' && (isAspirealty || plotStatus === 'ASPIREALTY')) {
                match = true;
            } else if (activeFilterStatus === plotStatus) {
                match = true;
            }

            if (match) {
                mesh.material.opacity = 0.96;
                mesh.material.color.copy(mesh.userData.baseColor);
                if (mesh.userData.roofMesh && mesh.userData.roofMesh.material) {
                    mesh.userData.roofMesh.material.opacity = 0.96;
                    mesh.userData.roofMesh.material.color.copy(mesh.userData.roofColor);
                }
                if (label) label.visible = true;
                if (group) group.visible = true;
            } else {
                mesh.material.opacity = 0.18;
                mesh.material.color.set(0x334155);
                if (mesh.userData.roofMesh && mesh.userData.roofMesh.material) {
                    mesh.userData.roofMesh.material.opacity = 0.18;
                    mesh.userData.roofMesh.material.color.set(0x1e293b);
                }
                if (label) label.visible = false;
            }
        });
    }

    /**
     * Render & Animation Loop
     */
    function startAnimationLoop() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        lastFrameTime = performance.now();

        function animate() {
            if (!isModalOpen) return;
            animFrameId = requestAnimationFrame(animate);

            const now = performance.now();
            const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
            lastFrameTime = now;

            // Animate moving vehicles across layout roads
            updateVehicles(delta);

            // First-person walkthrough camera simulation
            if (isWalkModeActive) {
                updateWalkMode(delta);
            }

            if (isCameraAnimating) {
                cameraAnimProgress += CAMERA_ANIM_SPEED;
                if (cameraAnimProgress >= 1) {
                    cameraAnimProgress = 1;
                    isCameraAnimating = false;
                }
                const t = 1 - Math.pow(1 - cameraAnimProgress, 3);
                camera.position.lerpVectors(cameraStartPos, cameraEndPos, t);
                if (controls) controls.target.lerpVectors(targetStartPos, targetEndPos, t);
            }

            if (isAutoRotating && !isCameraAnimating && controls) {
                controls.autoRotate = true;
                controls.autoRotateSpeed = 1.2;
            } else if (controls) {
                controls.autoRotate = false;
            }

            if (beaconRing && beaconRing.visible) {
                const time = performance.now() * 0.003;
                const s = 1 + Math.sin(time) * 0.15;
                beaconRing.scale.set(s, s, 1);
            }

            if (controls) controls.update();
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }

        animate();
    }

    /**
     * Tooltip DOM handling
     */
    function show3DTooltip(userData, clientX, clientY) {
        const tooltip = document.getElementById('threePlotTooltip');
        if (!tooltip) return;

        const d = userData.detail || {};
        const plotNo = userData.plotNo;
        const status = userData.status;
        const color = userData.baseColorHex;
        const size = (!d.plot_size || d.plot_size === 'N/A') ? 'N/A' : d.plot_size + ' Sq. Yds';
        const facing = d.facing || 'East';

        tooltip.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 800; font-size: 14px; color: #fff;">Plot #${plotNo}</span>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${color}; color: #fff;">${status}</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                <div>📐 Area: <strong style="color: #f8fafc;">${size}</strong></div>
                <div>🧭 Facing: <strong style="color: #f8fafc;">${facing}</strong></div>
            </div>
            <div style="font-size: 9.5px; color: #38bdf8; margin-top: 5px; font-weight: 600;">
                <i class="fa-solid fa-hand-pointer"></i> Click plot to inspect & action
            </div>
        `;

        tooltip.style.left = `${clientX + 16}px`;
        tooltip.style.top = `${clientY + 16}px`;
        tooltip.style.display = 'block';
    }

    function hide3DTooltip() {
        const tooltip = document.getElementById('threePlotTooltip');
        if (tooltip) tooltip.style.display = 'none';
    }

    /**
     * Populate Floating Quick Inspect Drawer
     */
    function populate3DInspectDrawer(detail, plotNo, status, colorHex) {
        const drawer = document.getElementById('threeInspectDrawer');
        if (!drawer) return;

        const size = (!detail || !detail.plot_size || detail.plot_size === 'N/A') ? 'N/A' : detail.plot_size + ' Sq. Yards';
        const facing = (detail && detail.facing) ? detail.facing : 'N/A';
        const refName = (detail && detail.reference_name) ? detail.reference_name : 'ASPIREALTY';
        const dimN = (detail && detail.dim_north) ? detail.dim_north : '-';
        const dimS = (detail && detail.dim_south) ? detail.dim_south : '-';
        const dimE = (detail && detail.dim_east) ? detail.dim_east : '-';
        const dimW = (detail && detail.dim_west) ? detail.dim_west : '-';

        const titleEl = document.getElementById('threeInspectPlotTitle');
        if (titleEl) {
            titleEl.innerHTML = `
                <span>Plot #${plotNo}</span>
                <span class="status-badge" style="--badge-color: ${colorHex}; --badge-glow: ${colorHex}; font-size: 10.5px; padding: 2px 8px;">${status}</span>
            `;
        }

        const bodyEl = document.getElementById('threeInspectDetailsBody');
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="detail-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font-size: 12px;">
                    <span style="color: var(--text-secondary);">Plot Area</span>
                    <strong style="color: var(--text-primary); font-weight: 700;">${size}</strong>
                </div>
                <div class="detail-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font-size: 12px;">
                    <span style="color: var(--text-secondary);">Facing</span>
                    <strong style="color: var(--text-primary); font-weight: 700;">${facing}</strong>
                </div>
                <div class="detail-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font-size: 12px;">
                    <span style="color: var(--text-secondary);">Reference</span>
                    <strong style="color: #60a5fa; font-weight: 700;">${refName}</strong>
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary);">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #94a3b8;">Dimensions:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; background: rgba(0,0,0,0.25); padding: 6px; border-radius: 6px;">
                        <div>N: <strong style="color: #fff;">${dimN}</strong></div>
                        <div>S: <strong style="color: #fff;">${dimS}</strong></div>
                        <div>E: <strong style="color: #fff;">${dimE}</strong></div>
                        <div>W: <strong style="color: #fff;">${dimW}</strong></div>
                    </div>
                </div>

                <!-- 3D House Customization Section -->
                <div class="house-style-section">
                    <div class="house-style-title">
                        <span><i class="fa-solid fa-house-chimney" style="color: #38bdf8;"></i> House Style Customizer</span>
                        <span style="font-size: 9.5px; color: #94a3b8;">Real-Time 3D</span>
                    </div>
                    <div class="house-style-grid">
                        <div class="house-style-card ${(customPlotStyles[plotNo] || globalDefaultStyle || 'villa') === 'villa' ? 'active' : ''}" data-style="villa" title="Modern Villa with pitched hip roof & panoramic windows">
                            <i class="fa-solid fa-hotel house-style-icon"></i>
                            <div class="house-style-name">Modern Villa</div>
                            <div class="house-style-desc">Gabled Roof & Porch</div>
                        </div>
                        <div class="house-style-card ${(customPlotStyles[plotNo] || globalDefaultStyle) === 'duplex' ? 'active' : ''}" data-style="duplex" title="Contemporary Duplex with cantilevered floor & rooftop pergola">
                            <i class="fa-solid fa-building house-style-icon"></i>
                            <div class="house-style-name">Luxury Duplex</div>
                            <div class="house-style-desc">2-Tier & Pergola</div>
                        </div>
                        <div class="house-style-card ${(customPlotStyles[plotNo] || globalDefaultStyle) === 'bungalow' ? 'active' : ''}" data-style="bungalow" title="Sprawling Estate Bungalow with wrap-around columned veranda">
                            <i class="fa-solid fa-house-chimney-window house-style-icon"></i>
                            <div class="house-style-name">Bungalow</div>
                            <div class="house-style-desc">Porch & Columns</div>
                        </div>
                        <div class="house-style-card ${(customPlotStyles[plotNo] || globalDefaultStyle) === 'open' ? 'active' : ''}" data-style="open" title="Open Residential Plot with green turf lawn & boundary wall">
                            <i class="fa-solid fa-vector-square house-style-icon"></i>
                            <div class="house-style-name">Open Plot</div>
                            <div class="house-style-desc">Fenced Lawn Turf</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <button class="three-drawer-btn" id="threeApplyStyleToAllBtn" style="background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #7dd3fc; font-size: 10.5px; padding: 6px;">
                            <i class="fa-solid fa-city"></i> Apply Style to All 131 Plots
                        </button>
                    </div>
                </div>
            `;

            // Attach House Style click listeners
            bodyEl.querySelectorAll('.house-style-card').forEach(card => {
                card.addEventListener('click', () => {
                    const newStyle = card.dataset.style;
                    bodyEl.querySelectorAll('.house-style-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    rebuildPlotModel(plotNo, newStyle);
                });
            });

            const applyAllBtn = document.getElementById('threeApplyStyleToAllBtn');
            if (applyAllBtn) {
                applyAllBtn.onclick = () => {
                    const activeCard = bodyEl.querySelector('.house-style-card.active');
                    const st = activeCard ? activeCard.dataset.style : 'villa';
                    applyHouseStyleToAll(st);
                };
            }
        }

        const openFullModalBtn = document.getElementById('threeOpenFullPlotModalBtn');
        if (openFullModalBtn) {
            openFullModalBtn.onclick = () => {
                if (typeof openPlotModal === 'function') {
                    openPlotModal(plotNo);
                }
            };
        }

        const view2DBtn = document.getElementById('threeViewIn2DBtn');
        if (view2DBtn) {
            view2DBtn.onclick = () => {
                close3DLayoutModal();
                if (typeof focusOnPlot === 'function') {
                    focusOnPlot(plotNo);
                }
                if (typeof openPlotModal === 'function') {
                    openPlotModal(plotNo);
                }
            };
        }

        drawer.classList.add('open');
    }

    /**
     * UI Modal Open/Close Controls
     */
    function open3DLayoutModal(targetPlotNo = null) {
        const backdrop = document.getElementById('modal3DLayoutBackdrop');
        if (!backdrop) return;

        backdrop.style.display = 'flex';
        backdrop.classList.add('show');
        isModalOpen = true;

        // Use requestAnimationFrame so browser computes dimensions first
        requestAnimationFrame(() => {
            if (!renderer) {
                const ok = initThreeScene();
                if (!ok) {
                    console.warn('Three.js scene init delayed.');
                    return;
                }
            }

            onWindowResize();
            startAnimationLoop();

            if (targetPlotNo) {
                setTimeout(() => {
                    selectPlot(String(targetPlotNo), true);
                }, 200);
            } else {
                if (controls && camera) {
                    const preset = getCameraPreset('overview');
                    camera.position.copy(preset.pos);
                    controls.target.copy(preset.target);
                    controls.update();
                }
            }
        });
    }

    function close3DLayoutModal() {
        const backdrop = document.getElementById('modal3DLayoutBackdrop');
        if (backdrop) {
            backdrop.classList.remove('show');
            backdrop.style.display = 'none';
        }
        isModalOpen = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        hide3DTooltip();
        const drawer = document.getElementById('threeInspectDrawer');
        if (drawer) drawer.classList.remove('open');
    }

    /**
     * Toggle visibility of ground blueprint layout plane
     */
    function toggleBlueprintLayout() {
        isBlueprintVisible = !isBlueprintVisible;
        if (groundMesh) {
            groundMesh.visible = isBlueprintVisible;
        }
        const btn = document.getElementById('threeToggleLayoutBtn');
        if (btn) btn.classList.toggle('active', isBlueprintVisible);
    }

    /**
     * Toggle X-Ray mode to see underlying blueprint details through 3D plots
     */
    function toggleXRayMode() {
        isXRayMode = !isXRayMode;
        const targetOpacity = isXRayMode ? 0.35 : 0.96;
        Object.values(plotMeshes).forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.opacity = targetOpacity;
                mesh.material.transparent = true;
                mesh.material.needsUpdate = true;
                if (mesh.userData.roofMesh && mesh.userData.roofMesh.material) {
                    mesh.userData.roofMesh.material.opacity = targetOpacity;
                    mesh.userData.roofMesh.material.transparent = true;
                    mesh.userData.roofMesh.material.needsUpdate = true;
                }
            }
        });
        const btn = document.getElementById('threeXRayBtn');
        if (btn) btn.classList.toggle('active', isXRayMode);
    }

    let isPlotsVisible = true;

    /**
     * Toggle visibility of 3D plot parcels to view bare layout map
     */
    function togglePlotsVisibility() {
        isPlotsVisible = !isPlotsVisible;
        Object.values(plotMeshes).forEach(mesh => {
            if (mesh) mesh.visible = isPlotsVisible;
        });
        Object.values(plotLabels).forEach(label => {
            if (label) label.visible = isPlotsVisible;
        });
        const btn = document.getElementById('threeSoloLayoutBtn');
        if (btn) btn.classList.toggle('active', !isPlotsVisible);
    }

    /**
     * Setup Modal Controls (Buttons, Presets, Filters, Lighting, Search)
     */
    function setupModalUI() {
        // Open Button from Header
        const openBtn = document.getElementById('open3DModalBtn');
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                open3DLayoutModal();
            });
        }

        // Open Button from Sidebar
        const sidebarLaunchBtn = document.getElementById('sidebarLaunch3DBtn');
        if (sidebarLaunchBtn) {
            sidebarLaunchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                open3DLayoutModal();
            });
        }

        // Close Button
        const closeBtn = document.getElementById('modal3DCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', close3DLayoutModal);
        }

        // Drawer Close Button
        const drawerCloseBtn = document.getElementById('threeInspectCloseBtn');
        if (drawerCloseBtn) {
            drawerCloseBtn.addEventListener('click', () => {
                const drawer = document.getElementById('threeInspectDrawer');
                if (drawer) drawer.classList.remove('open');
                if (beaconRing) beaconRing.visible = false;
                if (beaconLight) beaconLight.intensity = 0;
            });
        }

        // Camera Presets
        document.querySelectorAll('.btn-cam-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                if (isWalkModeActive) exitWalkMode();
                document.querySelectorAll('.btn-cam-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const presetKey = btn.dataset.preset;
                const preset = getCameraPreset(presetKey);
                if (preset) {
                    animateCameraTo(preset.pos, preset.target);
                }
            });
        });

        // First-Person Walk Mode Button
        const walkModeBtn = document.getElementById('threeWalkModeBtn');
        if (walkModeBtn) {
            walkModeBtn.addEventListener('click', () => {
                if (isWalkModeActive) {
                    exitWalkMode();
                } else {
                    enterWalkMode();
                }
            });
        }

        // Exit Walk Mode Button in HUD
        const exitWalkBtn = document.getElementById('threeExitWalkBtn');
        if (exitWalkBtn) {
            exitWalkBtn.addEventListener('click', exitWalkMode);
        }

        // Touch D-Pad for Mobile Walk
        const touchUp = document.getElementById('touchWalkUp');
        const touchDown = document.getElementById('touchWalkDown');
        const touchLeft = document.getElementById('touchWalkLeft');
        const touchRight = document.getElementById('touchWalkRight');

        function bindTouchDir(el, x, z) {
            if (!el) return;
            const setDir = (active) => {
                walkTouchDir.x = active ? x : 0;
                walkTouchDir.z = active ? z : 0;
            };
            el.addEventListener('mousedown', () => setDir(true));
            el.addEventListener('mouseup', () => setDir(false));
            el.addEventListener('mouseleave', () => setDir(false));
            el.addEventListener('touchstart', (e) => { e.preventDefault(); setDir(true); }, { passive: false });
            el.addEventListener('touchend', (e) => { e.preventDefault(); setDir(false); }, { passive: false });
        }
        bindTouchDir(touchUp, 0, 1);
        bindTouchDir(touchDown, 0, -1);
        bindTouchDir(touchLeft, -1, 0);
        bindTouchDir(touchRight, 1, 0);

        // Lighting Mode Buttons
        document.querySelectorAll('.btn-light-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-light-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyLightingMode(btn.dataset.mode);
            });
        });

        // Blueprint Layout Toggle Button
        const toggleLayoutBtn = document.getElementById('threeToggleLayoutBtn');
        if (toggleLayoutBtn) {
            toggleLayoutBtn.addEventListener('click', toggleBlueprintLayout);
        }

        // X-Ray Mode Toggle Button
        const xRayBtn = document.getElementById('threeXRayBtn');
        if (xRayBtn) {
            xRayBtn.addEventListener('click', toggleXRayMode);
        }

        // Layout Only (Hide/Show Plots) Button
        const soloBtn = document.getElementById('threeSoloLayoutBtn');
        if (soloBtn) {
            soloBtn.addEventListener('click', togglePlotsVisibility);
        }

        // Auto-Rotate Toggle
        const autoRotateBtn = document.getElementById('threeAutoRotateBtn');
        if (autoRotateBtn) {
            autoRotateBtn.addEventListener('click', () => {
                isAutoRotating = !isAutoRotating;
                autoRotateBtn.classList.toggle('active', isAutoRotating);
            });
        }

        // Reset View
        const resetViewBtn = document.getElementById('threeResetViewBtn');
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                const preset = getCameraPreset('overview');
                animateCameraTo(preset.pos, preset.target);
            });
        }

        // Fullscreen Toggle
        const fullScreenBtn = document.getElementById('threeFullscreenBtn');
        if (fullScreenBtn) {
            fullScreenBtn.addEventListener('click', () => {
                const modal = document.getElementById('modal3DLayout');
                if (!document.fullscreenElement) {
                    if (modal && modal.requestFullscreen) modal.requestFullscreen();
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            });
        }

        // 3D Status Filter Pills
        document.querySelectorAll('.three-filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.three-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                filter3DPlots(pill.dataset.status);
            });
        });

        // 3D Plot Search / Jump Input
        const plotSearchInput = document.getElementById('threePlotSearchInput');
        if (plotSearchInput) {
            plotSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const plotNo = plotSearchInput.value.trim();
                    if (plotMeshes[plotNo]) {
                        selectPlot(plotNo, true);
                    } else {
                        plotSearchInput.classList.add('error');
                        setTimeout(() => plotSearchInput.classList.remove('error'), 1000);
                    }
                }
            });
        }

        // Keyboard Shortcut: Key '3' opens 3D view; 'Escape' closes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isModalOpen) {
                close3DLayoutModal();
            } else if ((e.key === '3' || e.key === '#') && !isModalOpen && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                open3DLayoutModal();
            }
        });

        console.log('✅ Tada Layout 3D Engine ready. Press "3" or click "3D Interactive View" to launch.');
    }

    // Initialize UI on DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupModalUI);
    } else {
        setupModalUI();
    }

    // Public API exposed to window
    window.open3DLayoutModal = open3DLayoutModal;
    window.close3DLayoutModal = close3DLayoutModal;
    window.focus3DPlot = selectPlot;
    window.toggle3DBlueprint = toggleBlueprintLayout;
    window.toggle3DXRay = toggleXRayMode;
    window.enter3DWalkMode = enterWalkMode;
    window.exit3DWalkMode = exitWalkMode;
    window.customizePlotHouseStyle = rebuildPlotModel;
    window.applyHouseStyleToAllPlots = applyHouseStyleToAll;
    window.get3DCameraState = function() {
        if (!camera) return null;
        return {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            fov: camera.fov,
            controlsEnabled: controls ? controls.enabled : false
        };
    };

})();
