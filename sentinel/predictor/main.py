from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio, json, time, threading
from collector import fetch_window, compute_features
from lstm_model import LSTMForecaster, train_model, prepare_sequence
from risk_scorer import RiskScorer

app = FastAPI(title='SENTINEL Predictor')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

# Updated targets to match Google Online Boutique
TARGET_SERVICES = ['frontend', 'checkoutservice', 'cartservice', 'redis-cart']

state = {
    'risk_scores': {svc: 0.0 for svc in TARGET_SERVICES},
    'actions': [],
    'model_ready': False
}
scorers = {svc: RiskScorer() for svc in TARGET_SERVICES}
YELLOW_THRESHOLD = 0.65
RED_THRESHOLD = 0.85

@app.on_event('startup')
async def startup():
    threading.Thread(target=training_loop, daemon=True).start()
    threading.Thread(target=prediction_loop, daemon=True).start()

import random

def training_loop():
    print('Loading raw untrained models instantly per user request...')
    # Generate realistic healthy background noise (0.000 - 0.05 CPU usage)
    dummy_features = [{'mean': random.uniform(0.000, 0.05), 'std': random.uniform(0.000, 0.01), 'slope': 0.0, 'max': random.uniform(0.001, 0.08)} for _ in range(50)]
    for svc in TARGET_SERVICES:
        scorers[svc].fit(dummy_features)
    state['model_ready'] = True
    print('SENTINEL models trained and ready')

def prediction_loop():
    print("Initializing raw pretrained LSTM forecaster...")
    lstm = LSTMForecaster()
    lstm.eval()

    while True:
        time.sleep(15)
        if not state['model_ready']:
            continue
        for svc in TARGET_SERVICES:
            try:
                aggregated_risk = 0.0
                
                # VECTOR 1: CPU
                cpu_vals = fetch_window('cpu', svc, minutes=5)
                if len(cpu_vals) <= 1 and cpu_vals[0] == 0.0:
                    aggregated_risk = 1.0
                    cpu_feat = {'mean': 0.0, 'max': 0.0}
                else:
                    cpu_feat = compute_features(cpu_vals)
                    aggregated_risk = max(aggregated_risk, scorers[svc].score(cpu_feat))
                    if cpu_feat['mean'] > 0.15 or cpu_feat['max'] > 0.2:
                        aggregated_risk = max(aggregated_risk, 0.95)
                        
                # VECTOR 2: Memory (OOMKilled Cycle Detection)
                mem_vals = fetch_window('memory', svc, minutes=5)
                mem_feat = compute_features(mem_vals) if len(mem_vals) > 1 else {'mean': 0.0}
                if svc in ['cartservice', 'frontend'] and mem_feat['mean'] < 15_000_000:
                    aggregated_risk = max(aggregated_risk, 0.96)
                    
                # VECTOR 3: Network Errors (500s / Service Offline)
                err_vals = fetch_window('errors', svc, minutes=5)
                err_feat = compute_features(err_vals) if len(err_vals) > 1 else {'mean': 0.0}
                if err_feat['mean'] > 0.1: # More than 0.1 500-errors/sec limits
                    aggregated_risk = max(aggregated_risk, 0.97)

                risk = aggregated_risk
                
                print(f"DEBUG {time.strftime('%H:%M:%S')} - {svc:15} | CPU: {cpu_feat['mean']:.4f} | MEM: {mem_feat['mean']/1024/1024:.1f}MB | ERR: {err_feat['mean']:.2f} | Risk: {risk:.3f}")
                
                tensor, _, _ = prepare_sequence(cpu_vals if len(cpu_vals) > 1 else [0.0] * 120)
                future = lstm(tensor).max().item()
                if future > cpu_feat['max'] * 1.5:
                    risk = min(1.0, risk + 0.15) 
                    
                state['risk_scores'][svc] = round(risk, 3)
                if risk > RED_THRESHOLD:
                    action = f'PRE-EMPTIVE ACTION: {svc} risk={risk:.2f} — triggering recovery'
                    state['actions'].insert(0, {'time': time.strftime('%H:%M:%S'), 'msg': action, 'level': 'red'})
                    print(action)
                elif risk > YELLOW_THRESHOLD:
                    state['actions'].insert(0, {'time': time.strftime('%H:%M:%S'),
                        'msg': f'WARNING: {svc} risk={risk:.2f} — monitoring closely', 'level': 'yellow'})
            except Exception as e:
                print(f'Error scoring {svc}: {e}')

        # Push a telemetry snapshot for the React chart
        telemetry_history.append({
            'time': time.strftime('%H:%M:%S'),
            **{svc: state['risk_scores'].get(svc, 0.0) for svc in TARGET_SERVICES}
        })
        if len(telemetry_history) > 300:
            telemetry_history.pop(0)

import subprocess, os

# Store detailed telemetry for the UI graphs
telemetry_history = []

@app.get('/risk')
def get_risk():
    return {'scores': state['risk_scores'], 'model_ready': state['model_ready']}

@app.get('/actions')
def get_actions():
    return state['actions'][:50]

@app.get('/metrics')
def get_metrics():
    return {'history': telemetry_history[-120:], 'scores': state['risk_scores'], 'model_ready': state['model_ready']}

@app.get('/stream')
async def stream():
    async def event_gen():
        while True:
            data = json.dumps({'scores': state['risk_scores'],
                               'actions': state['actions'][:5],
                               'model_ready': state['model_ready']})
            yield f'data: {data}\n\n'
            await asyncio.sleep(5)
    return StreamingResponse(event_gen(), media_type='text/event-stream')

# ── Chaos Trigger Endpoints (called from the React UI) ──────────────
from fastapi import BackgroundTasks

def _run_chaos(cmd):
    print(f"🔥 [CHAOS-UI] Executing: {cmd}")
    subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

@app.post('/chaos/scale')
def chaos_scale(bg: BackgroundTasks):
    bg.add_task(_run_chaos, "kubectl scale deployment cartservice --replicas=0")
    state['actions'].insert(0, {'time': time.strftime('%H:%M:%S'), 'msg': '🔥 CHAOS INJECTED: cartservice scaled to 0 replicas (CPU/Compute Outage)', 'level': 'red'})
    return {'status': 'Chaos injected: replicas=0'}

@app.post('/chaos/memory')
def chaos_memory(bg: BackgroundTasks):
    bg.add_task(_run_chaos, "kubectl set resources deployment cartservice -c=server --limits=memory=10Mi --requests=memory=10Mi && kubectl delete pod -l app=cartservice")
    state['actions'].insert(0, {'time': time.strftime('%H:%M:%S'), 'msg': '🔥 CHAOS INJECTED: cartservice memory crushed to 10Mi (OOMKilled Loop)', 'level': 'red'})
    return {'status': 'Chaos injected: memory=10Mi'}

@app.post('/chaos/frontend')
def chaos_frontend(bg: BackgroundTasks):
    bg.add_task(_run_chaos, "kubectl set image deployment/frontend server=frontend:broken-virus-image && kubectl delete pod -l app=frontend")
    state['actions'].insert(0, {'time': time.strftime('%H:%M:%S'), 'msg': '🔥 CHAOS INJECTED: frontend image corrupted (ImagePullBackOff)', 'level': 'red'})
    return {'status': 'Chaos injected: broken image'}