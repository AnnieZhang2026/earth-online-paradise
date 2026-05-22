import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import { motion } from 'framer-motion';

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
  const [entryAnimDone, setEntryAnimDone] = useState(false);
  const angleRef = useRef(0);
  const lastTickRef = useRef(performance.now());
  const autoRotateRef = useRef(true);
  const rafRef = useRef(null);
  const [showHint, setShowHint] = useState(false);

  // Keep autoRotateRef in sync
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  // Main Cesium setup
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    window.CESIUM_BASE_URL = import.meta.env.BASE_URL + 'cesium/';

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

    // Transparent sky
    viewer.scene.skyBox = undefined;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);

    // Star particles
    const starPoints = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1e9;
      starPoints.add({
        position: new Cesium.Cartesian3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)),
        pixelSize: 0.8 + Math.random() * 1.8,
        color: Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.5 + Math.random() * 0.5),
      });
    }

    // Satellite imagery
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'Esri',
      })
    );

    // Entry animation: start far in space
    const startDest = Cesium.Cartesian3.fromDegrees(119, 31, 55000000);
    viewer.camera.setView({
      destination: startDest,
      orientation: { heading: 0, pitch: -Math.PI / 2.8, roll: 0 },
    });

    // City entities — static points with labels above
    CITIES.forEach((city, idx) => {
      viewer.entities.add({
        name: city.name,
        position: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 0),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString(city.color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(1e2, 1.5, 3e7, 0.4),
        },
        label: {
          text: city.name,
          font: '600 15px PingFang SC, Microsoft YaHei, Arial, sans-serif',
          fillColor: Cesium.Color.fromCssColorString(city.color),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.65),
          backgroundPadding: new Cesium.Cartesian2(8, 4),
          scaleByDistance: new Cesium.NearFarScalar(1e2, 1.0, 3e7, 0.5),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          translucencyByDistance: new Cesium.NearFarScalar(3e7, 1.0, 6e7, 0.0),
        },
        cityIndex: idx,
      });
    });

    // Click to stop auto-rotate
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((event) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && Cesium.defined(picked.id)) {
        const entity = picked.id;
        if (entity.cityIndex !== undefined) {
          const city = CITIES[entity.cityIndex];
          setActiveCity(city);
          setAutoRotate(false);
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 800000),
            orientation: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
            duration: 1.5,
            complete: () => { if (goToCity) goToCity(city.name); },
          });
          return;
        }
      }
      // Clicked on globe (not a city) — stop rotation
      setAutoRotate(false);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Auto-rotate ticker
    const startTime = performance.now();
    lastTickRef.current = startTime;

    const tick = (time) => {
      if (!viewerRef.current) return;
      const dt = (time - lastTickRef.current) / 16.666;
      lastTickRef.current = time;

      if (autoRotateRef.current) {
        // Slowly rotate Earth (20s per revolution)
        angleRef.current += 0.00031416 * Math.min(dt, 2.0);
        const centerLng = 119 + (activeView === VIEW_MODES.DETAIL ? 0 : 0);
        const camLng = centerLng + (angleRef.current * 180 / Math.PI) * (activeView === VIEW_MODES.DETAIL ? 0.3 : 1.0);
        const camLat = activeView === VIEW_MODES.DETAIL ? 31 : 29;

        viewerRef.current.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(camLng, camLat, activeView === VIEW_MODES.DETAIL ? 15000000 : 28000000),
          orientation: { heading: 0, pitch: activeView === VIEW_MODES.DETAIL ? -Math.PI / 3 : -Math.PI / 2.8, roll: 0 },
        });
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
  }, []);

  // Switch view mode
  const switchView = useCallback((mode) => {
    setActiveView(mode);
    setAutoRotate(true);
    if (!viewerRef.current) return;

    if (mode === VIEW_MODES.GLOBAL) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(119, 29, 28000000),
        orientation: { heading: 0, pitch: -Math.PI / 2.8, roll: 0 },
        duration: 2.0,
      });
    } else {
      // DETAIL: Nanjing-focused arc view
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(119, 31, 15000000),
        orientation: { heading: 0, pitch: -Math.PI / 3, roll: 0 },
        duration: 2.0,
      });
    }
  }, []);

  const sidebarWidth = 260;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'radial-gradient(ellipse at 50% 50%, #0a183d 0%, #000 100%)' }}>

      {/* Cesium Globe */}
      <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'absolute', inset: 0 }} />

      {/* Top-left admin button */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, display: 'flex', gap: 10 }}>
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

      {/* Bottom view-mode toggles */}
      <div style={{
        position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 20, zIndex: 15,
        background: 'rgba(0,0,0,0.5)', borderRadius: 30,
        padding: '12px 28px', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={() => switchView(VIEW_MODES.GLOBAL)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px',
            background: activeView === VIEW_MODES.GLOBAL ? 'rgba(255,255,255,0.18)' : 'transparent',
            border: `1px solid ${activeView === VIEW_MODES.GLOBAL ? 'rgba(255,255,255,0.4)' : 'transparent'}`,
            borderRadius: 20, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.3s', fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 12, height: 12, borderRadius: '50%', background: '#4f8cff',
            boxShadow: '0 0 6px #4f8cff', flexShrink: 0,
          }} />
          全局视角
        </button>

        <button
          onClick={() => switchView(VIEW_MODES.DETAIL)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px',
            background: activeView === VIEW_MODES.DETAIL ? 'rgba(255,255,255,0.18)' : 'transparent',
            border: `1px solid ${activeView === VIEW_MODES.DETAIL ? 'rgba(255,255,255,0.4)' : 'transparent'}`,
            borderRadius: 20, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.3s', fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 12, height: 12, borderRadius: '50%', background: '#ffd93d',
            boxShadow: '0 0 6px #ffd93d', flexShrink: 0,
          }} />
          弧形视角
        </button>
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
