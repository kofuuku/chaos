import React, { useState, useEffect, useCallback } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { ShieldAlert, Cpu, HardDrive, ImageOff, Activity, Terminal, Zap } from 'lucide-react';
import './index.css';

const COLORS = {
  frontend: '#6366f1',
  checkoutservice: '#22d3ee',
  cartservice: '#f59e0b',
  'redis-cart': '#ec4899',
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
    } catch(e) { console.error('Audio refused', e) }
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
    if (score > 0.85) return '#ef4444';
    if (score > 0.65) return '#f59e0b';
    return '#10b981';
  };

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
            <div className="status-badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.3)' }} title={data.isolated_pods.join('\n')}>
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
          <div className="icon-wrap"><Cpu size={24} color="#ef4444" /></div>
          <div className="btn-title">CPU / Compute Spike</div>
          <div className="btn-desc">Inject CPU Stress via Chaos Mesh</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'memory' ? 'firing' : ''}`}
          onClick={() => triggerChaos('memory')}
        >
          <div className="icon-wrap"><HardDrive size={24} color="#ef4444" /></div>
          <div className="btn-title">Memory Bloat</div>
          <div className="btn-desc">Inject Memory Stress via Chaos Mesh</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'malware' ? 'firing' : ''}`}
          onClick={() => triggerChaos('malware')}
          style={{ borderColor: 'rgba(236, 72, 153, 0.4)' }}
        >
          <div className="icon-wrap"><ShieldAlert size={24} color="#ec4899" /></div>
          <div className="btn-title" style={{ color: '#ec4899' }}>IDS Malware Quarantine</div>
          <div className="btn-desc">Isolate Pod via NetworkPolicy & Labels</div>
        </button>
        <button
          className={`chaos-btn ${firing === 'ddos' ? 'firing' : ''}`}
          onClick={() => triggerChaos('ddos')}
          style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
        >
          <div className="icon-wrap"><Activity size={24} color="#f59e0b" /></div>
          <div className="btn-title" style={{ color: '#f59e0b' }}>L7 Volumetric DDoS</div>
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
                        ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                        : score > 0.65
                          ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                          : 'linear-gradient(90deg, #10b981, #059669)',
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live Risk Chart */}
        <div>
          <div className="section-title">
            <Activity size={14} /> Live Risk Telemetry
          </div>
          <div className="glass-card chart-container">
            <div className="chart-wrap">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    stroke="#475569"
                    fontSize={10}
                    tickLine={false}
                    interval="preserveStartEnd"
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis
                    domain={[0, 1]}
                    stroke="#475569"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="JetBrains Mono"
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                  <ReferenceLine y={0.85} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.6} label={{ value: 'RED', fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={0.65} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.4} label={{ value: 'WARN', fill: '#f59e0b', fontSize: 10 }} />
                  {Object.entries(COLORS).map(([svc, color]) => (
                    <Area
                      key={svc}
                      type="monotone"
                      dataKey={svc}
                      stroke={color}
                      fill={`url(#grad-${svc})`}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Audit Log ───────────────────────────────────── */}
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
  );
};

export default App;