/**
 * Tada Layout 3D Digital Interactive Model (Three.js)
 * Implements real-time 3D visualization, interactive plot parcels, 
 * lighting modes, camera presets, raycasting, status filters, and plot inspection.
 */

(function () {
    'use strict';

    // Module State
    let scene, camera, renderer, controls;
    let groundMesh, layoutTexture, layoutWorldGroup, satelliteMesh;
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
            plot_size: '200',
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
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw pill shape background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        const r = 18;
        const x = 14, y = 10, w = 100, h = 44;
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

        // Border colored with status
        ctx.lineWidth = 4;
        ctx.strokeStyle = hexColor || '#38bdf8';
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Plus Jakarta Sans", Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(plotNo), 64, 32);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(3.4, 1.7, 1);
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
        camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 3500);
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
            controls.minDistance = 10;
            controls.maxDistance = 1400;
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

        // 8. Highlight Beacon (Spotlight & Ring)
        setupBeacon();

        // 9. Event Listeners for Raycasting & Resize
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
        const outerGeo = new THREE.PlaneGeometry(2400, 2400);
        const outerMat = new THREE.MeshBasicMaterial({
            color: 0x162a1c, // Natural satellite terrain green-earth tone
            side: THREE.DoubleSide
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.rotation.x = -Math.PI / 2;
        outerMesh.position.set(10.03, -0.25, 2.68);
        scene.add(outerMesh);

        // 2. Real Esri Satellite World Imagery Terrain Plane (Centered on calibrated Tada coordinates)
        const satGeo = new THREE.PlaneGeometry(447, 426.4, 16, 16);
        const satMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        satelliteMesh = new THREE.Mesh(satGeo, satMat);
        satelliteMesh.rotation.x = -Math.PI / 2;
        satelliteMesh.position.set(10.03, -0.15, 2.68);
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
            satelliteMesh.material.needsUpdate = true;
        }

        // Priority 1: Instant load from embedded satellite base64 (local file:// & offline guaranteed)
        if (typeof TADA_SATELLITE_TEXTURE_B64 !== 'undefined' && TADA_SATELLITE_TEXTURE_B64) {
            texLoader.load(TADA_SATELLITE_TEXTURE_B64, (tex) => {
                applySatTexture(tex);
                console.log('✅ Loaded Esri World Imagery satellite terrain via embedded Base64 URI.');
            });
        }

        // Priority 2: External Esri Satellite image files
        texLoader.load(
            'tada_satellite_ground.webp?v=1.9.1',
            (tex) => {
                applySatTexture(tex);
                console.log('✅ Loaded Esri satellite terrain: tada_satellite_ground.webp');
            },
            undefined,
            () => {
                texLoader.load('tada_satellite_ground.jpg?v=1.9.1', applySatTexture);
            }
        );

        // 3. Blueprint Layout Ground Plane (Inside rotated layoutWorldGroup)
        const layoutGeo = new THREE.PlaneGeometry(LAYOUT_WIDTH, LAYOUT_HEIGHT, 16, 16);
        const fallbackTex = createProceduralGroundTexture();
        const layoutMat = new THREE.MeshBasicMaterial({
            map: fallbackTex,
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });

        groundMesh = new THREE.Mesh(layoutGeo, layoutMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = 0;
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
            const pHeight = BASE_ELEVATION;

            const plotGroup = new THREE.Group();
            plotGroup.position.set(posX, 0, posZ);

            const parcelGeo = new THREE.BoxGeometry(pWidth, pHeight, pDepth);
            const parcelMat = new THREE.MeshStandardMaterial({
                color: colorThree,
                roughness: 0.55,
                metalness: 0.05,
                emissive: colorThree,
                emissiveIntensity: 0.14,
                transparent: true,
                opacity: 0.96,
                depthWrite: true
            });

            const parcelMesh = new THREE.Mesh(parcelGeo, parcelMat);
            parcelMesh.position.y = pHeight / 2 + 0.08;
            parcelMesh.castShadow = true;
            parcelMesh.receiveShadow = true;

            parcelMesh.userData = {
                plotNo,
                detail,
                status,
                baseColorHex: colorHex,
                baseColor: colorThree.clone(),
                defaultY: pHeight / 2 + 0.08,
                pWidth,
                pDepth,
                pHeight,
                parentGroup: plotGroup
            };

            plotGroup.add(parcelMesh);
            plotMeshes[plotNo] = parcelMesh;

            const edgesGeo = new THREE.EdgesGeometry(parcelGeo);
            const edgesMat = new THREE.LineBasicMaterial({
                color: 0x064e3b, // Dark rich outline for contrast instead of washed-out white
                transparent: true,
                opacity: 0.55
            });
            const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
            parcelMesh.add(wireframe);

            const hw = pWidth / 2;
            const hd = pDepth / 2;
            const corners = [
                [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]
            ];
            corners.forEach(([cx, cz]) => {
                const stone = new THREE.Mesh(cornerStoneGeo, cornerStoneMat);
                stone.position.set(cx, pHeight + 0.2, cz);
                plotGroup.add(stone);
            });

            const labelSprite = createPlotNumberSprite(plotNo, colorHex);
            labelSprite.position.set(0, pHeight + 1.88, 0);
            plotGroup.add(labelSprite);
            plotLabels[plotNo] = labelSprite;

            layoutWorldGroup.add(plotGroup);
            plotGroups[plotNo] = plotGroup;
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
            const coords = getCanvasRelativeCoords(e);
            mouse.x = coords.x;
            mouse.y = coords.y;

            raycaster.setFromCamera(mouse, camera);
            const meshArray = Object.values(plotMeshes);
            const intersects = raycaster.intersectObjects(meshArray, false);

            if (intersects.length > 0) {
                const hit = intersects[0].object;
                container.style.cursor = 'pointer';

                if (hoveredPlotMesh !== hit) {
                    unhoverPlot(hoveredPlotMesh);
                    hoverPlot(hit);
                    hoveredPlotMesh = hit;
                }
                show3DTooltip(hit.userData, coords.clientX, coords.clientY);
            } else {
                container.style.cursor = 'grab';
                if (hoveredPlotMesh) {
                    unhoverPlot(hoveredPlotMesh);
                    hoveredPlotMesh = null;
                }
                hide3DTooltip();
            }
        });

        container.addEventListener('mouseleave', () => {
            if (hoveredPlotMesh) {
                unhoverPlot(hoveredPlotMesh);
                hoveredPlotMesh = null;
            }
            hide3DTooltip();
        });

        container.addEventListener('click', (e) => {
            const coords = getCanvasRelativeCoords(e);
            mouse.x = coords.x;
            mouse.y = coords.y;

            raycaster.setFromCamera(mouse, camera);
            const meshArray = Object.values(plotMeshes);
            const intersects = raycaster.intersectObjects(meshArray, false);

            if (intersects.length > 0) {
                const hit = intersects[0].object;
                selectPlot(hit.userData.plotNo, true);
            }
        });

        window.addEventListener('resize', onWindowResize);
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
        mesh.position.y = mesh.userData.defaultY + 0.6;
        if (mesh.material) {
            mesh.material.emissiveIntensity = 0.45;
        }
    }

    function unhoverPlot(mesh) {
        if (!mesh) return;
        mesh.position.y = mesh.userData.defaultY;
        if (mesh.material) {
            mesh.material.emissiveIntensity = (currentLightingMode === 'night') ? 0.55 : 0.14;
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
                mesh.material.opacity = 0.95;
                mesh.material.color.copy(mesh.userData.baseColor);
                if (label) label.visible = true;
                if (group) group.visible = true;
            } else {
                mesh.material.opacity = 0.18;
                mesh.material.color.set(0x334155);
                if (label) label.visible = false;
            }
        });
    }

    /**
     * Render & Animation Loop
     */
    function startAnimationLoop() {
        if (animFrameId) cancelAnimationFrame(animFrameId);

        function animate() {
            if (!isModalOpen) return;
            animFrameId = requestAnimationFrame(animate);

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
        const size = d.plot_size || 'N/A';
        const facing = d.facing || 'East';

        tooltip.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 800; font-size: 14px; color: #fff;">Plot #${plotNo}</span>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${color}; color: #fff;">${status}</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                <div>📐 Area: <strong style="color: #f8fafc;">${size} Sq. Yds</strong></div>
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

        const size = (detail && detail.plot_size) ? detail.plot_size + ' Sq. Yards' : 'N/A';
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
            `;
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
        const targetOpacity = isXRayMode ? 0.38 : 0.95;
        Object.values(plotMeshes).forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.opacity = targetOpacity;
                mesh.material.transparent = true;
                mesh.material.needsUpdate = true;
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
                document.querySelectorAll('.btn-cam-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const presetKey = btn.dataset.preset;
                const preset = getCameraPreset(presetKey);
                if (preset) {
                    animateCameraTo(preset.pos, preset.target);
                }
            });
        });

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

})();
