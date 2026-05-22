import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import imageCompression from 'browser-image-compression';
import {
  uploadFileToGitHub, listFilesInDir, deleteFileFromGitHub,
  validateToken, hasToken, setToken, getJsDelivrUrl
} from '../../lib/githubApi';

const PRESET_CITIES = [
  { name: '南京', lng: '118.7967', lat: '32.0603' },
  { name: '上海', lng: '121.4737', lat: '31.2304' },
  { name: '杭州', lng: '120.1552', lat: '30.2741' },
];

export default function CityAdminPanel({ onBack }) {
  const [token, setTokenInput] = useState('');
  const [tokenStatus, setTokenStatus] = useState({ checking: false, msg: '', ok: false });
  const [selectedCity, setSelectedCity] = useState('');
  const [lng, setLng] = useState('');
  const [lat, setLat] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [departure, setDeparture] = useState('');
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState({ ok: false, msg: '' });
  const [cityList, setCityList] = useState([]);
  const fileInputRef = useRef(null);
  const dragItem = useRef();
  const dragOverItem = useRef();

  // Check if token already exists
  useEffect(() => {
    if (hasToken()) {
      setTokenStatus({ checking: false, msg: 'Token 已配置 ✓', ok: true });
    }
  }, []);

  const handleValidateToken = async () => {
    if (!token.trim()) return;
    setTokenStatus({ checking: true, msg: '验证中...', ok: false });
    setToken(token);
    const res = await validateToken();
    if (res.valid) {
      setTokenStatus({ checking: false, msg: `已验证: @${res.username}`, ok: true });
    } else {
      setTokenStatus({ checking: false, msg: res.error, ok: false });
    }
  };

  // Auto-fill coords when selecting preset city
  const handleCitySelect = (name) => {
    setSelectedCity(name);
    const preset = PRESET_CITIES.find(c => c.name === name);
    if (preset) {
      setLng(preset.lng);
      setLat(preset.lat);
    }
  };

  // Auto geocode for custom city name
  useEffect(() => {
    if (!selectedCity) return;
    const preset = PRESET_CITIES.find(c => c.name === selectedCity);
    if (preset) return;

    const timer = setTimeout(async () => {
      if (!selectedCity.trim()) return;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(selectedCity)}&format=json&limit=1`,
          { headers: { 'Accept-Language': 'zh-CN,zh' } }
        );
        const data = await res.json();
        if (data?.length > 0) {
          setLng(parseFloat(data[0].lon).toFixed(4));
          setLat(parseFloat(data[0].lat).toFixed(4));
        }
      } catch {}
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedCity]);

  // Load existing city images from GitHub
  const loadCityImages = useCallback(async (cityName) => {
    const folder = `public/images/cities/${cityName}`;
    const res = await listFilesInDir(folder);
    if (res.success && res.files.length > 0) {
      setImages(res.files.map(f => ({
        id: f.sha,
        name: f.name,
        preview: getJsDelivrUrl(`${folder}/${f.name}`),
        sha: f.sha,
        status: 'done',
      })));
    } else {
      setImages([]);
    }
  }, []);

  // When selecting a city, load its existing images
  useEffect(() => {
    if (selectedCity) loadCityImages(selectedCity);
  }, [selectedCity, loadCityImages]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }));
    setImages(prev => [...prev, ...newImages]);
    e.target.value = '';
  };

  const removeImage = (id) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img?.preview?.startsWith('blob:')) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleDragStart = (e, i) => { dragItem.current = i; };
  const handleDragEnter = (e, i) => { dragOverItem.current = i; };
  const handleDragEnd = () => {
    const list = [...images];
    const [dragged] = list.splice(dragItem.current, 1);
    list.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null;
    dragOverItem.current = null;
    setImages(list);
  };

  const handleSubmit = async () => {
    if (!selectedCity.trim() || !lng || !lat || isSubmitting) return;
    if (!tokenStatus.ok && !hasToken()) {
      setResult({ ok: false, msg: '请先配置 GitHub Token' });
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    setResult({ ok: false, msg: '' });

    try {
      const folder = `public/images/cities/${selectedCity.trim()}`;

      // Check existing files in GitHub
      const auditRes = await listFilesInDir(folder);
      const existingFiles = auditRes.success ? auditRes.files : [];

      // Upload new files
      const finalUrls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setProgress(Math.floor(10 + (i / images.length) * 75));

        if (img.status === 'done') {
          finalUrls.push(img.preview);
          continue;
        }

        // Compress image
        const compressed = await imageCompression(img.file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
        const base64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(compressed);
        });

        const fileName = `${Date.now()}_${i}_${img.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const path = `${folder}/${fileName}`;

        const res = await uploadFileToGitHub(path, base64, `Upload ${selectedCity}/${fileName}`);
        if (res.success) {
          finalUrls.push(res.url);
        }
      }

      setProgress(100);
      setResult({ ok: true, msg: `「${selectedCity}」已同步完成，共 ${finalUrls.length} 张照片` });

      // Cleanup deleted images from GitHub
      const finalUrlsSet = new Set(finalUrls.map(u => u.split('/').pop()));
      for (const file of existingFiles) {
        if (!finalUrlsSet.has(decodeURIComponent(file.name))) {
          await deleteFileFromGitHub(file.path, file.sha, `Cleanup ${selectedCity}/${file.name}`);
        }
      }

      // Reset form
      setTimeout(() => {
        setImages([]);
        setSelectedCity('');
        setLng('');
        setLat('');
        setDateRange('');
        setDeparture('');
        setResult({ ok: false, msg: '' });
      }, 3000);

    } catch (err) {
      setResult({ ok: false, msg: err.message || '上传失败' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(8, 10, 18, 0.98)',
        display: 'flex', flexDirection: 'column',
        color: 'white', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", Roboto, sans-serif',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '28px 40px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={onBack} style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
            📍 管理地点
          </h1>
        </div>
        <span style={{ fontSize: 13, opacity: 0.4 }}>Earth Online Paradise</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 40px 40px', gap: 24 }}>

        {/* Left column: Form */}
        <div style={{ flex: '2.5 1 0%', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto', padding: '20px 0' }}>

          {/* GitHub Token */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
              GitHub 连接
            </h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="password"
                value={token}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="粘贴 GitHub Personal Access Token"
                style={{
                  flex: 1, padding: '14px 18px', background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
                  color: 'white', fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={handleValidateToken} disabled={tokenStatus.checking} style={{
                padding: '14px 24px', borderRadius: 14, border: 'none',
                background: tokenStatus.ok ? 'rgba(76,175,80,0.3)' : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white', fontWeight: 700, cursor: tokenStatus.checking ? 'wait' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>
                {tokenStatus.checking ? '验证中...' : tokenStatus.ok ? '已连接 ✓' : '验证'}
              </button>
            </div>
            {tokenStatus.msg && (
              <p style={{
                margin: '10px 0 0 0', fontSize: 13,
                color: tokenStatus.ok ? '#81c784' : '#e57373',
              }}>
                {tokenStatus.msg}
              </p>
            )}
          </div>

          {/* City form */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '0.9rem', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
              地点信息
            </h3>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1.5 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>地点名称</label>
                <input
                  value={selectedCity}
                  onChange={e => setSelectedCity(e.target.value)}
                  list="city-presets"
                  placeholder="例如: 南京"
                  style={{
                    width: '100%', padding: '14px 18px', background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
                    color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
                <datalist id="city-presets">
                  {PRESET_CITIES.map(c => <option key={c.name} value={c.name} />)}
                </datalist>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>经纬度</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={lng} onChange={e => setLng(e.target.value)} placeholder="经度" style={{ flex: 1, padding: '14px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: 'white', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
                  <input value={lat} onChange={e => setLat(e.target.value)} placeholder="纬度" style={{ flex: 1, padding: '14px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: 'white', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>日期范围</label>
                <input value={dateRange} onChange={e => setDateRange(e.target.value)} placeholder="2025.1.1～2026.1.1" style={{ width: '100%', padding: '14px 18px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>出发地</label>
                <input value={departure} onChange={e => setDeparture(e.target.value)} placeholder="深圳" style={{ width: '100%', padding: '14px 18px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
            </div>
          </div>

          {/* Image gallery */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.06)', flex: 1, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
                地点照片
              </h3>
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="file" multiple accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} id="img-upload" ref={fileInputRef} />
                <label htmlFor="img-upload" style={{
                  padding: '8px 16px', borderRadius: 12, border: 'none',
                  background: '#667eea', color: 'white', fontWeight: 600, fontSize: '0.85rem',
                  cursor: 'pointer',
                }}>
                  ＋ 添加照片
                </label>
              </div>
            </div>

            {images.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', border: '2px dashed rgba(255,255,255,0.06)',
                borderRadius: 20, color: 'rgba(255,255,255,0.3)', gap: 12,
              }}>
                <div style={{ fontSize: '2rem' }}>📸</div>
                <div>暂无照片，支持拖拽排序</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14, overflowY: 'auto', flex: 1 }}>
                <AnimatePresence>
                  {images.map((img, idx) => (
                    <motion.div
                      layout key={img.id}
                      draggable
                      onDragStart={e => handleDragStart(e, idx)}
                      onDragEnter={e => handleDragEnter(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      style={{
                        position: 'relative', height: 100, borderRadius: 14,
                        overflow: 'hidden', cursor: 'move',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {idx === 0 && (
                        <span style={{
                          position: 'absolute', top: 8, left: 8,
                          background: '#ffd700', color: 'black',
                          padding: '2px 8px', borderRadius: 6,
                          fontSize: '0.7rem', fontWeight: 800,
                        }}>
                          封面
                        </span>
                      )}
                      <button
                        onClick={() => removeImage(img.id)}
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'rgba(255,0,0,0.6)', border: 'none',
                          color: 'white', fontSize: 16, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        ×
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Submit */}
          {result.msg && (
            <div style={{
              padding: 14, borderRadius: 14, textAlign: 'center', fontSize: '0.95rem', fontWeight: 500,
              background: result.ok ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
              color: result.ok ? '#81c784' : '#e57373',
            }}>
              {result.msg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
            <button
              onClick={handleSubmit}
              disabled={!selectedCity || !lng || !lat || isSubmitting}
              style={{
                flex: 2, padding: '18px', borderRadius: 18, border: 'none',
                background: isSubmitting ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer',
                position: 'relative', overflow: 'hidden', fontFamily: 'inherit',
              }}
            >
              {isSubmitting && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${progress}%`, background: 'rgba(255,255,255,0.2)',
                  transition: 'width 0.3s ease-out', zIndex: 0,
                }} />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                {isSubmitting ? `同步中 ${progress}%` : '🚀 同步到 GitHub'}
              </span>
            </button>
          </div>
        </div>

        {/* Right column: City list */}
        <div style={{
          flex: '1 1 0%', padding: 20,
          background: 'rgba(255,255,255,0.02)', borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 280,
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontWeight: 700, opacity: 0.8, padding: '0 8px' }}>
            预设地点
          </h3>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {PRESET_CITIES.map(city => (
              <div
                key={city.name}
                onClick={() => handleCitySelect(city.name)}
                style={{
                  display: 'flex', gap: 14, padding: '14px',
                  borderRadius: 16, marginBottom: 8,
                  border: `1px solid ${selectedCity === city.name ? '#667eea' : 'rgba(255,255,255,0.05)'}`,
                  background: selectedCity === city.name ? 'rgba(102,126,234,0.15)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem', flexShrink: 0,
                }}>
                  📍
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{city.name}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>
                    {city.lng}, {city.lat}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
