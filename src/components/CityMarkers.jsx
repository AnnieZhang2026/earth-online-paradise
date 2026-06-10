import React, { useEffect, useState, useRef } from 'react';
import CityMarker from './CityMarker';

const ELEVATION = 200; // meters above ellipsoid

export default function CityMarkers({ viewer, cities, onCityClick, showLabels }) {
  const [markers, setMarkers] = useState([]);
  const prevRef = useRef([]);

  useEffect(() => {
    if (!viewer) return;

    const update = () => {
      try {
        const scene = viewer.scene;
        if (!scene) return;
        const newMarkers = [];
        let changed = false;

        for (let i = 0; i < cities.length; i++) {
          const city = cities[i];
          const cartesian = Cesium.Cartesian3.fromDegrees(city.lng, city.lat, ELEVATION);
          const windowPos = Cesium.SceneTransforms.worldToWindowCoordinates(scene, cartesian);

          const visible = !!windowPos;
          const x = windowPos ? windowPos.x : 0;
          const y = windowPos ? windowPos.y : 0;

          newMarkers.push({ name: city.name, color: city.color, x, y, visible });

          const prev = prevRef.current[i];
          if (!prev || prev.x !== x || prev.y !== y || prev.visible !== visible) {
            changed = true;
          }
        }

        if (changed) {
          prevRef.current = newMarkers;
          setMarkers(newMarkers);
        }
      } catch (_) { /* viewer teardown — safe to ignore */ }
    };

    viewer.scene.postRender.addEventListener(update);
    return () => {
      try { viewer.scene.postRender.removeEventListener(update); } catch (_) { /* viewer already destroyed */ }
    };
  }, [viewer, cities]);

  return (
    <>
      {/* CSS keyframes for breathing glow */}
      <style>{`
        @keyframes marker-breathe {
          0%, 100% {
            box-shadow:
              0 0 4px #ffffff,
              0 0 10px rgba(255, 255, 255, 0.55);
          }
          50% {
            box-shadow:
              0 0 7px #ffffff,
              0 0 18px rgba(255, 255, 255, 0.3);
          }
        }
      `}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 15,
          overflow: 'hidden',
        }}
      >
        {markers.map((m) => (
          <CityMarker
            key={m.name}
            city={m}
            screenX={m.x}
            screenY={m.y}
            isVisible={m.visible}
            showLabel={showLabels}
            onClick={() => onCityClick(m.name)}
          />
        ))}
      </div>
    </>
  );
}
