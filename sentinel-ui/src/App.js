import React, { useState, useEffect, useCallback } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { ShieldAlert, Cpu, HardDrive, ImageOff, Activity, Terminal, Zap } from 'lucide-react';
import './index.css';

const COLORS = {
  frontend: '#3B82F6',
  checkoutservice: '#06B6D4',
  cartservice: '#F59E0B',
  'redis-cart': '#F43F5E',
};

const API = 'http://localhost:8000';

const App = () => {
  const [data, setData] = useState({ scores: {}, model_ready: false, isolated_pods: [] });
  const [history, setHistory] = useState([]);
  const [actions, setActions] = useState([]);
  const [firing, setFiring] = useState(null);
  const [criticalAlert, setCriticalAlert] = useState(null);

  const playSiren = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.5);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 1.0);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } catch (e) { console.error('Audio refused', e) }
  };

  useEffect(() => {
    let alertingSvc = null;
    for (const [svc, score] of Object.entries(data.scores)) {
      if (score > 0.85) { alertingSvc = svc; break; }
    }

    if (alertingSvc && criticalAlert !== alertingSvc) {
      setCriticalAlert(alertingSvc);
      playSiren();
    } else if (!alertingSvc && criticalAlert) {
      setCriticalAlert(null);
    }
  }, [data.scores, criticalAlert]);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, actionsRes] = await Promise.all([
        fetch(`${API}/metrics`),
        fetch(`${API}/actions`),
      ]);
      const metricsData = await metricsRes.json();
      const actionsData = await actionsRes.json();
      setData({ scores: metricsData.scores, model_ready: metricsData.model_ready, isolated_pods: metricsData.isolated_pods || [] });
      setHistory(metricsData.history || []);
      setActions(actionsData);
    } catch (err) {
      console.error('Predictor offline', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerChaos = async (type) => {
    setFiring(type);
    try {
      await fetch(`${API}/chaos/${type}`, { method: 'POST' });
    } catch (e) {
      console.error('Chaos trigger failed', e);
    }
    setTimeout(() => setFiring(null), 1500);
  };

  const getStatusClass = (score) => {
    if (score > 0.85) return 'critical';
    if (score > 0.65) return 'warning';
    return 'healthy';
  };

  const getScoreColor = (score) => {
    if (score > 0.85) return '#F43F5E';
    if (score > 0.65) return '#F59E0B';
    return '#10B981';
  };

  const getNodeClass = (svc) => {
    const score = data.scores[svc] || 0;
    if (score > 0.85) return 'base node-glow-critical';
    if (score > 0.65) return 'base node-glow-warning';
    return 'base node-glow-healthy';
  };

  const NODES = {
    frontend: { x: 80, y: 150, label: 'FRONTEND' },
    ad: { x: 280, y: 40, label: 'AD' },
    recommendation: { x: 280, y: 100, label: 'RECOMMEND' },
    product: { x: 480, y: 100, label: 'CATALOG' },
    checkout: { x: 280, y: 170, label: 'CHECKOUT' },
    payment: { x: 480, y: 155, label: 'PAYMENT' },
    shipping: { x: 480, y: 215, label: 'SHIPPING' },
    email: { x: 680, y: 155, label: 'EMAIL' },
    currency: { x: 680, y: 215, label: 'CURRENCY' },
    cart: { x: 280, y: 270, label: 'CART' },
    redis: { x: 480, y: 270, label: 'REDIS CACHE' }
  };

  const EDGES = [
    ['frontend', 'ad'],
    ['frontend', 'recommendation'],
    ['recommendation', 'product'],
    ['frontend', 'checkout'],
    ['checkout', 'payment'],
    ['checkout', 'shipping'],
    ['checkout', 'email'],
    ['checkout', 'currency'],
    ['frontend', 'cart'],
    ['checkout', 'cart'],
    ['cart', 'redis']
  ];

  if (!data.model_ready) {
    return (
      <div className="sentinel-app">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <h2>SENTINEL Neural Networks Initializing</h2>
          <p>Training IsolationForest & LSTM on Prometheus baseline telemetry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sentinel-app">
      {criticalAlert && (
        <div className="critical-banner">
          <ShieldAlert size={20} className="pulse-icon" style={{ marginRight: '10px' }} />
          CRITICAL OUTAGE DETECTED: {criticalAlert.toUpperCase()}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────── */}
      <header className="sentinel-header">
        <div className="logo-section">
          <div className="logo-icon">
            <ShieldAlert size={26} color="#fff" />
          </div>
          <div>
            <h1>SENTINEL AI</h1>
            <div className="subtitle">Autonomous Chaos Engineering & Self-Healing Platform</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {data.isolated_pods && data.isolated_pods.length > 0 && (
            <div className="status-badge" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#F43F5E', borderColor: 'rgba(244, 63, 94, 0.3)' }} title={data.isolated_pods.join('\n')}>
              <ShieldAlert size={14} style={{ marginRight: '6px' }} />
              {data.isolated_pods.length} QUARANTINED
            </div>
          )}
          <div className="status-badge online">
            <span className="pulse-dot"></span>
            SYSTEM ARMED
          </div>
        </div>
      </header>

      {/* ── Chaos Panel ─────────────────────────────────── */}
      <div className="section-title">
        <Zap size={14} /> Chaos Injection Controls
      </div>
      <div className="chaos-panel">
        <button
          className={`chaos-btn ${firing === 'scale' ? 'firing' : ''}`}
          onClick={() => triggerChaos('scale')}
        >
          <div className="icon-wrap"><Cpu size={24} color="#F43F5E" /></div>
          <div className="btn-title">CPU / Compute Spike</div>
          <div className="btn-desc">Inject CPU Stress via Chaos Mesh</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'memory' ? 'firing' : ''}`}
          onClick={() => triggerChaos('memory')}
        >
          <div className="icon-wrap"><HardDrive size={24} color="#F43F5E" /></div>
          <div className="btn-title">Memory Bloat</div>
          <div className="btn-desc">Inject Memory Stress via Chaos Mesh</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'malware' ? 'firing' : ''}`}
          onClick={() => triggerChaos('malware')}
          style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}
        >
          <div className="icon-wrap"><ShieldAlert size={24} color="#F43F5E" /></div>
          <div className="btn-title" style={{ color: '#F43F5E' }}>IDS Malware Quarantine</div>
          <div className="btn-desc">Isolate Pod via NetworkPolicy & Labels</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'ddos' ? 'firing' : ''}`}
          onClick={() => triggerChaos('ddos')}
          style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
        >
          <div className="icon-wrap"><Activity size={24} color="#F59E0B" /></div>
          <div className="btn-title" style={{ color: '#F59E0B' }}>L7 Volumetric DDoS</div>
          <div className="btn-desc">Traffic Flood & CPU Saturation</div>
        </button>
      </div>

      {/* ── Main Layout ─────────────────────────────────── */}
      <div className="main-grid">
        {/* Left: Service Health Cards */}
        <div>
          <div className="section-title">
            <Activity size={14} /> Microservice Health
          </div>
          <div className="services-grid">
            {Object.entries(data.scores).map(([svc, score]) => (
              <div key={svc} className="glass-card service-card">
                <div className="svc-header">
                  <span className="svc-name">{svc}</span>
                  <span className={`svc-status ${getStatusClass(score)}`}></span>
                </div>
                <div className="svc-score" style={{ color: getScoreColor(score) }}>
                  {score.toFixed(3)}
                </div>
                <div className="risk-bar">
                  <div
                    className="risk-fill"
                    style={{
                      width: `${Math.min(score * 100, 100)}%`,
                      background: score > 0.85
                        ? 'linear-gradient(90deg, #BE123C, #F43F5E)'
                        : score > 0.65
                          ? 'linear-gradient(90deg, #D97706, #F59E0B)'
                          : 'linear-gradient(90deg, #059669, #10B981)',
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Live Node Map & Risk Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>

          {/* Node Map */}
          <div>
            <div className="section-title">
              <Activity size={14} /> Chaos Gateway Mesh
            </div>
            <div className="glass-card node-map-card">
              <svg className="node-svg" viewBox="0 0 780 320">
                {EDGES.map(([src, dst], idx) => {
                  const n1 = NODES[src];
                  const n2 = NODES[dst];
                  const d = `M${n1.x},${n1.y} C${n1.x + 80},${n1.y} ${n2.x - 80},${n2.y} ${n2.x},${n2.y}`;
                  return <path key={`edge-${idx}`} id={`edge-${idx}`} d={d} fill="none" stroke="#334155" strokeWidth="2" />;
                })}

                {EDGES.map(([src, dst], idx) => (
                  <circle key={`pkt-${idx}`} r="3" className="packet">
                    <animateMotion dur={`${1 + ((idx % 3) * 0.3)}s`} repeatCount="indefinite">
                      <mpath href={`#edge-${idx}`} />
                    </animateMotion>
                  </circle>
                ))}

                {Object.entries(NODES).map(([key, n]) => {
                  let scoreKey = key;
                  if (key === 'cart') scoreKey = 'cartservice';
                  if (key === 'checkout') scoreKey = 'checkoutservice';
                  if (key === 'redis') scoreKey = 'redis-cart';
                  return (
                    <g key={key} className="node-group" transform={`translate(${n.x},${n.y})`}>
                      <circle className={getNodeClass(scoreKey)} r={key === 'frontend' ? 22 : 14} />
                      <text y={key === 'frontend' ? 40 : 28} textAnchor="middle">{n.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="section-title">
              <Activity size={14} /> Live Risk Telemetry
            </div>
            <div className="glass-card chart-container" style={{ flex: 1, padding: '16px 20px' }}>
              <div className="chart-wrap" style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      {Object.entries(COLORS).map(([svc, color]) => (
                        <linearGradient key={svc} id={`grad-${svc}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" fontFamily="JetBrains Mono" />
                    <YAxis domain={[0, 1]} stroke="#94A3B8" fontSize={10} tickLine={false} fontFamily="JetBrains Mono" />
                    <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px', fontFamily: 'JetBrains Mono', color: '#F8FAFC' }} />
                    <ReferenceLine y={0.85} stroke="#F43F5E" strokeDasharray="5 5" strokeOpacity={0.6} label={{ value: 'RED', fill: '#F43F5E', fontSize: 10 }} />
                    <ReferenceLine y={0.65} stroke="#F59E0B" strokeDasharray="5 5" strokeOpacity={0.4} label={{ value: 'WARN', fill: '#F59E0B', fontSize: 10 }} />
                    {Object.entries(COLORS).map(([svc, color]) => (
                      <Area key={svc} type="monotone" dataKey={svc} stroke={color} fill={`url(#grad-${svc})`} strokeWidth={2} dot={false} isAnimationActive={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>


        <div className="audit-section">
          <div className="section-title">
            <Terminal size={14} /> Decision Engine Audit Log
          </div>
          <div className="glass-card audit-log">
            {actions.length === 0 ? (
              <div className="empty-state">System healthy. No autonomous actions triggered.</div>
            ) : (
              actions.map((action, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{action.time}</span>
                  <span className={`log-msg ${action.level}`}>{action.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;