import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import CityMarkers from '../components/CityMarkers';

// City data — 南京, 上海, 杭州
const CITIES = [
  { name: '南京', lng: 118.7967, lat: 32.0603, color: '#4f8cff' },
  { name: '上海', lng: 121.4737, lat: 31.2304, color: '#ff6b6b' },
  { name: '杭州', lng: 120.1552, lat: 30.2741, color: '#ffd93d' },
];

// View modes
const VIEW_MODES = {
  GLOBAL: 'global',   // See all 3 cities
  DETAIL: 'detail',  // Focused on Nanjing with arc
};

export default function GlobePage({ goToCity, openAdmin }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [activeView, setActiveView] = useState(VIEW_MODES.GLOBAL);
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeCity, setActiveCity] = useState(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [entryAnimDone, setEntryAnimDone] = useState(false);
  const angleRef = useRef(0);
  const lastTickRef = useRef(performance.now());
  const autoRotateRef = useRef(true);
  const rafRef = useRef(null);
  const starPointsRef = useRef(null);
  const starOriginsRef = useRef(null);
  const starAngleAccumRef = useRef(0);
  const userDraggingRef = useRef(false);
  const baseLngRef = useRef(119);
  const baseLatRef = useRef(0);
  const activeViewRef = useRef(VIEW_MODES.GLOBAL);
  const [showHint, setShowHint] = useState(false);

  // Keep refs in sync with state
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  // Main Cesium setup
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    try {
    const viewer = new Cesium.Viewer(containerRef.current, {
      contextOptions: { webgl: { alpha: true } },
      baseLayerPicker: false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      homeButton: false,
      geocoder: false,
      sceneModePicker: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      vrButton: false,
      creditContainer: document.createElement('div'),
    });

    viewerRef.current = viewer;
    viewer.cesiumWidget.creditContainer.style.display = 'none';
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.show = true;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.preloadSiblings = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5;
    viewer.scene.globe.tileCacheSize = 1000;
    viewer.clock.shouldAnimate = true;

    // Easier camera drag — lower inertia, faster rotate
    const sc = viewer.scene.screenSpaceCameraController;
    sc.inertiaTranslate = 0.6;
    sc.inertiaZoom = 0.6;
    sc.inertiaSpin = 0.5;
    sc.minimumZoomDistance = 5000000;
    sc.maximumZoomDistance = 80000000;

    // Transparent sky
    viewer.scene.skyBox = undefined;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);

    // Star particles
    const starPoints = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const starOrigins = [];
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1e9;
      const pos = new Cesium.Cartesian3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
      starOrigins.push(pos);
      starPoints.add({
        position: pos.clone(),
        pixelSize: 0.8 + Math.random() * 1.8,
        color: Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.5 + Math.random() * 0.5),
      });
    }
    starPointsRef.current = starPoints;
    starOriginsRef.current = starOrigins;

    // Globe base color — visible even before imagery loads
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a2f5a');

    // Local earth texture as reliable base layer
    const earthUrl = import.meta.env.BASE_URL + 'earthmap.jpg';
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.SingleTileImageryProvider({
        url: earthUrl,
        credit: '',
      })
    );

    // Moon — solid sphere with texture via canvas
    const moonOrbitR = 15000000;
    const moonRadius = 800000;
    const moonPos = new Cesium.CallbackProperty(() => {
      const angle = starAngleAccumRef.current;
      return new Cesium.Cartesian3(
        moonOrbitR * Math.cos(angle),
        -moonOrbitR * Math.sin(angle),
        2000000
      );
    }, false);
    // Glow layers — inner-to-outer with breathing
    const glowStartTime = performance.now();
    // Inner glow (tight, bright)
    viewer.entities.add({
      position: moonPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(moonRadius * 1.06, moonRadius * 1.06, moonRadius * 1.06),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const t = (performance.now() - glowStartTime) / 1000;
            const alpha = 0.28 + 0.06 * Math.sin(t * 1.0);
            return Cesium.Color.fromCssColorString('#ffffff').withAlpha(alpha);
          }, false)
        ),
        fill: true,
        outline: false,
        slicePartitions: 32,
        stackPartitions: 32,
      },
    });
    // Mid glow
    viewer.entities.add({
      position: moonPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(moonRadius * 1.15, moonRadius * 1.15, moonRadius * 1.15),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const t = (performance.now() - glowStartTime) / 1000;
            const alpha = 0.16 + 0.05 * Math.sin(t * 1.0 + 0.5);
            return Cesium.Color.fromCssColorString('#ffe8a0').withAlpha(alpha);
          }, false)
        ),
        fill: true,
        outline: false,
        slicePartitions: 32,
        stackPartitions: 32,
      },
    });
    // Outer glow (broad, faint)
    viewer.entities.add({
      position: moonPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(moonRadius * 1.35, moonRadius * 1.35, moonRadius * 1.35),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const t = (performance.now() - glowStartTime) / 1000;
            const alpha = 0.07 + 0.03 * Math.sin(t * 1.0 + 1.0);
            return Cesium.Color.fromCssColorString('#ffe8a0').withAlpha(alpha);
          }, false)
        ),
        fill: true,
        outline: false,
        slicePartitions: 32,
        stackPartitions: 32,
      },
    });
    // Moon sphere
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 512;
    moonCanvas.height = 256;
    const mCtx = moonCanvas.getContext('2d');
    const moonTextureImg = new Image();
    moonTextureImg.crossOrigin = 'anonymous';
    moonTextureImg.onload = () => {
      mCtx.drawImage(moonTextureImg, 0, 0, 512, 256);
      moonEntity.ellipsoid.material = new Cesium.ImageMaterialProperty({
        image: moonCanvas,
      });
    };
    moonTextureImg.src = import.meta.env.BASE_URL + 'moon.png';
    // Fallback: draw a moon-like gradient while image loads
    const grad = mCtx.createRadialGradient(256, 128, 20, 256, 128, 256);
    grad.addColorStop(0, '#fffef5');
    grad.addColorStop(0.4, '#f5e6c8');
    grad.addColorStop(0.7, '#c8b898');
    grad.addColorStop(1, '#8a7a60');
    mCtx.fillStyle = grad;
    mCtx.fillRect(0, 0, 512, 256);
    const moonEntity = viewer.entities.add({
      position: moonPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(moonRadius, moonRadius, moonRadius),
        material: new Cesium.ImageMaterialProperty({
          image: moonCanvas,
        }),
        fill: true,
        outline: false,
        slicePartitions: 64,
        stackPartitions: 64,
      },
    });

    // Start with a proper global view centered on China
    baseLngRef.current = 119;
    baseLatRef.current = 0;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(119, 0, 35000000),
      orientation: {
        heading: 0,
        pitch: -Math.PI / 2.05,
        roll: 0,
      },
    });

    // Signal that the viewer is ready so React overlays can mount
    setViewerReady(true);

    // City markers are now rendered by the CityMarkers React component (see JSX below).

    // Click on globe (not a marker) — stop auto-rotation
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction(() => {
      setAutoRotate(false);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Track user dragging — pause rotation during drag, resume after
    viewer.camera.moveStart.addEventListener(() => {
      userDraggingRef.current = true;
      if (autoRotateRef.current) {
        // Temporarily pause rotation so user can drag freely
        autoRotateRef.current = false;
      }
    });
    viewer.camera.moveEnd.addEventListener(() => {
      if (userDraggingRef.current) {
        // Snapshot current position as new rotation base
        const cc = viewer.camera.positionCartographic;
        baseLngRef.current = Cesium.Math.toDegrees(cc.longitude);
        baseLatRef.current = Cesium.Math.toDegrees(cc.latitude);
        angleRef.current = 0;
        // Resume auto-rotation after drag in global mode
        if (!autoRotateRef.current && activeViewRef.current === VIEW_MODES.GLOBAL) {
          autoRotateRef.current = true;
          setAutoRotate(true);
        }
      }
      userDraggingRef.current = false;
    });

    // Auto-rotate ticker
    const startTime = performance.now();
    lastTickRef.current = startTime;

    const tick = (time) => {
      if (!viewerRef.current) return;
      const dt = (time - lastTickRef.current) / 16.666;
      lastTickRef.current = time;

      if (autoRotateRef.current) {
        // Slowly rotate Earth (20s per revolution, constant speed)
        angleRef.current += 0.00031416 * Math.min(dt, 2.0);
        const rotSpeed = (activeView === VIEW_MODES.DETAIL ? 0.3 : 1.0);
        const camLng = baseLngRef.current + (angleRef.current * 180 / Math.PI) * rotSpeed;

        viewerRef.current.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(camLng, baseLatRef.current, activeView === VIEW_MODES.DETAIL ? 5000000 : 35000000),
          orientation: { heading: 0, pitch: activeView === VIEW_MODES.DETAIL ? -Math.PI / 3 : -Math.PI / 2.05, roll: 0 },
        });
      } else {
        // Rotate starfield around vertical (Z) axis
        starAngleAccumRef.current += 0.0015 * Math.min(dt, 2.0);
        const a = starAngleAccumRef.current;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        const sp = starPointsRef.current;
        const origins = starOriginsRef.current;
        if (sp && origins) {
          for (let i = 0; i < origins.length; i++) {
            const o = origins[i];
            const p = sp.get(i);
            p.position = new Cesium.Cartesian3(
              o.x * cosA + o.y * sinA,
              -o.x * sinA + o.y * cosA,
              o.z
            );
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Entry animation end — fly to global view after delay
    setTimeout(() => {
      setEntryAnimDone(true);
      setActiveView(VIEW_MODES.GLOBAL);
    }, 2000);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null; }
    };
    } catch (e) {
      console.error('Cesium init error:', e);
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div style="color:red;padding:40px;font-family:monospace;"><h2>Cesium Init Error</h2><pre>' + e.message + '</pre><pre style="font-size:12px;color:#999;">' + e.stack + '</pre></div>';
      }
    }
  }, []);

  // Switch view mode
  const switchView = useCallback((mode) => {
    if (mode === activeView) return; // Already in this view, do nothing
    setActiveView(mode);
    setAutoRotate(mode === VIEW_MODES.GLOBAL);
    if (!viewerRef.current) return;

    if (mode === VIEW_MODES.GLOBAL) {
      setAutoRotate(false);
      autoRotateRef.current = false;
      // Fly from current position to global distance, keeping same side of Earth
      const cc = viewerRef.current.camera.positionCartographic;
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          Cesium.Math.toDegrees(cc.longitude),
          Cesium.Math.toDegrees(cc.latitude),
          35000000
        ),
        orientation: { heading: 0, pitch: -Math.PI / 2.05, roll: 0 },
        duration: 2.0,
        complete: () => {
          const cc = viewerRef.current.camera.positionCartographic;
          baseLngRef.current = Cesium.Math.toDegrees(cc.longitude);
          baseLatRef.current = Cesium.Math.toDegrees(cc.latitude);
          angleRef.current = 0;
          autoRotateRef.current = true;
          setAutoRotate(true);
        },
      });
    } else {
      // DETAIL: Nanjing-focused arc view
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(119, 31, 5000000),
        orientation: { heading: 0, pitch: -Math.PI / 3, roll: 0 },
        duration: 2.0,
      });
    }
  }, [activeView]);

  const handleCityClick = useCallback((cityName) => {
    const city = CITIES.find(c => c.name === cityName);
    if (!city || !viewerRef.current) return;
    setActiveCity(city);
    setAutoRotate(false);
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 800000),
      orientation: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
      duration: 1.5,
      complete: () => { if (goToCity) goToCity(city.name); },
    });
  }, [goToCity]);

  const sidebarWidth = 260;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'radial-gradient(ellipse at 50% 50%, #0a183d 0%, #000 100%)' }}>

      {/* Cesium Globe */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

      {/* React-rendered city markers (glowing dots + glassmorphism labels) */}
      {viewerReady && (
        <CityMarkers
          viewer={viewerRef.current}
          cities={CITIES}
          onCityClick={handleCityClick}
          showLabels={activeView !== VIEW_MODES.GLOBAL}
        />
      )}

      {/* Bottom-right admin button */}
      <div style={{ position: 'absolute', bottom: 30, right: 30, zIndex: 10, display: 'flex', gap: 10 }}>
        <button onClick={openAdmin} style={{
          padding: '10px 20px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 30,
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          fontFamily: 'inherit',
        }}>
          📍 管理地点
        </button>
      </div>

      {/* Top-right auto-rotate hint */}
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 10,
            background: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: '10px 18px',
            color: 'rgba(255,255,255,0.7)', fontSize: 13, backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          点击地球暂停旋转
        </motion.div>
      )}

      {/* Bottom view-mode toggle dots */}
      <div style={{
        position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 40, zIndex: 15, alignItems: 'center',
      }}>
        {/* Global view dot */}
        <button
          onClick={() => switchView(VIEW_MODES.GLOBAL)}
          aria-label="全局视角"
          style={{
            width: activeView === VIEW_MODES.GLOBAL ? 10 : 6,
            height: activeView === VIEW_MODES.GLOBAL ? 10 : 6,
            borderRadius: '50%',
            background: activeView === VIEW_MODES.GLOBAL ? '#fff' : 'rgba(255,255,255,0.45)',
            boxShadow: activeView === VIEW_MODES.GLOBAL
              ? '0 0 4px 2px rgba(255,255,255,0.9), 0 0 10px 4px rgba(255,255,255,0.4), 0 0 20px 8px rgba(255,255,255,0.15)'
              : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: 0,
          }}
        />

        {/* Arc view dot */}
        <button
          onClick={() => switchView(VIEW_MODES.DETAIL)}
          aria-label="弧形视角"
          style={{
            width: activeView === VIEW_MODES.DETAIL ? 10 : 6,
            height: activeView === VIEW_MODES.DETAIL ? 10 : 6,
            borderRadius: '50%',
            background: activeView === VIEW_MODES.DETAIL ? '#fff' : 'rgba(255,255,255,0.45)',
            boxShadow: activeView === VIEW_MODES.DETAIL
              ? '0 0 4px 2px rgba(255,255,255,0.9), 0 0 10px 4px rgba(255,255,255,0.4), 0 0 20px 8px rgba(255,255,255,0.15)'
              : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: 0,
          }}
        />
      </div>

      {/* City sidebar */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: `${sidebarWidth}px`, height: '100vh',
        background: 'rgba(5, 8, 20, 0.88)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        transform: 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 12, display: 'flex', flexDirection: 'column',
        padding: '30px 20px', boxSizing: 'border-box',
      }}>
        <h2 style={{ color: '#fff', margin: '0 0 24px 0', fontSize: '1.2rem', fontWeight: 800, letterSpacing: 2 }}>
          选择地点
        </h2>
        {CITIES.map((city) => (
          <button
            key={city.name}
            onClick={() => {
              setActiveCity(city);
              setAutoRotate(false);
              if (!viewerRef.current) return;
              viewerRef.current.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 800000),
                orientation: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
                duration: 1.5,
                complete: () => { if (goToCity) goToCity(city.name); },
              });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              width: '100%', padding: '14px 16px', margin: '6px 0',
              background: activeCity?.name === city.name ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: `1px solid ${activeCity?.name === city.name ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: city.color, flexShrink: 0 }} />
            {city.name}
          </button>
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, lineHeight: 1.6 }}>
            右上角「管理地点」<br />可上传城市照片
          </p>
        </div>
      </div>
    </div>
  );
}
