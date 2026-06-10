import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CityMarker({ city, screenX, screenY, isVisible, isActive, onClick, showLabel }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -50%)',
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: 20,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      {/* Glassmorphism label — floats above the dot, visible only in detail view */}
      <AnimatePresence>
        {showLabel && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 7px)',
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              background: 'rgba(15, 15, 20, 0.4)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 4,
              padding: '2px 6px',
              color: '#fff',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.5,
              fontFamily: 'MiSans, Montserrat, Inter, -apple-system, sans-serif',
              lineHeight: 1.3,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {city.name}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glowing dot — smaller in global mode, normal in detail */}
      <div
        onClick={onClick}
        className="city-marker-dot"
        style={{
          width: showLabel ? 7 : 5,
          height: showLabel ? 7 : 5,
          borderRadius: '50%',
          background: '#ffffff',
          cursor: 'pointer',
          position: 'relative',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          animation: 'marker-breathe 2.4s ease-in-out infinite',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.6)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      />
    </div>
  );
}
