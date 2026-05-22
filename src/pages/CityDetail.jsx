import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { listFilesInDir, getJsDelivrUrl } from '../lib/githubApi';

// City coordinates
const CITY_DATA = {
  南京: { lng: 118.7967, lat: 32.0603, desc: '六朝古都，秦淮河畔' },
  上海: { lng: 121.4737, lat: 31.2304, desc: '东方明珠，浦江夜色' },
  杭州: { lng: 120.1552, lat: 30.2741, desc: '西子湖畔，人间天堂' },
};

export default function CityDetail({ cityName, goBack }) {
  const [scrollY, setScrollY] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState([]); // { url }
  const [mainImage, setMainImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [cityData, setCityData] = useState({ desc: '' });

  // Load images from GitHub
  useEffect(() => {
    const loadImages = async () => {
      setLoading(true);
      const folder = `public/images/cities/${cityName}`;

      const res = await listFilesInDir(folder);
      if (res.success && res.files.length > 0) {
        const urls = res.files.map(f => getJsDelivrUrl(`${folder}/${f.name}`));
        setMainImage(urls[0]);
        setImages(urls.slice(1));
      } else {
        // Fallback placeholder
        setMainImage(`https://picsum.photos/seed/${cityName}/1200/800`);
        setImages(
          Array.from({ length: 4 }, (_, i) =>
            `https://picsum.photos/seed/${cityName}${i}/600/400`
          )
        );
      }

      if (CITY_DATA[cityName]) {
        setCityData(CITY_DATA[cityName]);
      }

      setLoading(false);
    };

    if (cityName) loadImages();
  }, [cityName]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedImage ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [selectedImage]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!selectedImage) return;
      if (e.key === 'Escape') setSelectedImage(null);
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedImage, currentImageIndex]);

  const allImages = [mainImage, ...images].filter(Boolean);

  const navigate = (dir) => {
    const next = (currentImageIndex + dir + allImages.length) % allImages.length;
    setCurrentImageIndex(next);
    setSelectedImage(allImages[next]);
  };

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1525 40%, #111d35 100%)',
        color: '#fff',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>加载中...</div>
          <div style={{ fontSize: '1rem', opacity: 0.5 }}>{cityName}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="city-detail" style={{ width: '100%', height: '100%', overflowY: 'auto', background: '#0a0f1a' }}>

      {/* Back button */}
      <button className="back-btn" onClick={goBack} style={{
        position: 'fixed', top: 30, left: 30, zIndex: 100,
        padding: '12px 24px', borderRadius: 30, border: 'none',
        background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 15,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        backdropFilter: 'blur(16px)', fontFamily: 'inherit',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        返回
      </button>

      {/* Hero section */}
      <div style={{
        position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-20%', width: '140%', height: '140%',
          backgroundImage: `url("${mainImage}")`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          transform: `translateY(${scrollY * 0.4}px)`,
          cursor: selectedImage ? 'default' : 'pointer',
          filter: 'brightness(0.6)',
        }} onClick={() => setSelectedImage(mainImage)} />

        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 40%, rgba(10,15,26,0.8) 80%, #0a0f1a 100%)',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          style={{ position: 'relative', zIndex: 5, textAlign: 'center', color: '#fff', maxWidth: '80%' }}
        >
          <h1 style={{
            fontSize: 'clamp(3rem, 10vw, 6rem)', fontWeight: 900, margin: '0 0 16px 0',
            letterSpacing: '-2px', textShadow: '0 4px 30px rgba(0,0,0,0.5)',
          }}>
            {cityName}
          </h1>
          {cityData.desc && (
            <p style={{ fontSize: '1.3rem', opacity: 0.85, fontWeight: 300, letterSpacing: 2 }}>
              {cityData.desc}
            </p>
          )}
        </motion.div>

        <div style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          color: '#fff', textAlign: 'center', zIndex: 10,
          animation: 'bounce 2s infinite',
        }}>
          <span style={{ display: 'block', marginBottom: 8, fontSize: 14, opacity: 0.7 }}>向下滑动</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
          </svg>
        </div>
      </div>

      {/* Gallery */}
      <div style={{ background: '#fff', padding: '80px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px' }}>
          <h2 style={{ fontSize: '2.8rem', textAlign: 'center', margin: '0 0 60px 0', color: '#333', fontWeight: 800 }}>
            精彩瞬间
          </h2>

          {images.length > 0 ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 30,
            }}>
              {images.map((img, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: idx * 0.08 }}
                  viewport={{ once: true }}
                  onClick={() => { setSelectedImage(img); setCurrentImageIndex(idx + 1); }}
                  style={{
                    borderRadius: 16, overflow: 'hidden',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                    cursor: 'pointer', transition: 'transform 0.3s',
                  }}
                >
                  <img
                    src={img}
                    alt={`${cityName} ${idx + 1}`}
                    style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '1.1rem',
              letterSpacing: 1,
            }}>
              暂无照片，点击右上角「管理地点」上传吧～
            </div>
          )}
        </div>
      </div>

      {/* Image viewer modal */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 1001,
            }}
          >
            ×
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
            style={{
              position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
              width: 50, height: 50, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ‹
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); navigate(1); }}
            style={{
              position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
              width: 50, height: 50, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ›
          </button>

          <img
            src={selectedImage}
            alt="查看"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain',
              borderRadius: 12, boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            }}
          />

          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.7)', fontSize: 14,
            background: 'rgba(0,0,0,0.5)', padding: '6px 16px', borderRadius: 20,
          }}>
            {currentImageIndex + 1} / {allImages.length}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateX(-50%) translateY(0); }
          40% { transform: translateX(-50%) translateY(-10px); }
          60% { transform: translateX(-50%) translateY(-5px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        .back-btn:hover { transform: scale(1.05); }
      `}</style>
    </div>
  );
}
