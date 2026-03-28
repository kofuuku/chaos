from kubernetes import client, config
import time, requests
import os

# Connect to your local Minikube via your Mac's kubeconfig
config.load_kube_config()

apps_v1 = client.AppsV1Api()
core_v1 = client.CoreV1Api()
NAMESPACE = 'default'

def scale_deployment(name, replicas):
    body = {'spec': {'replicas': replicas}}
    apps_v1.patch_namespaced_deployment_scale(name=name, namespace=NAMESPACE, body=body)
    print(f'[SENTINEL] Scaled {name} to {replicas} replicas to handle load.')

def restart_pod(label_selector):
    pods = core_v1.list_namespaced_pod(namespace=NAMESPACE, label_selector=label_selector)
    if pods.items:
        pod_name = pods.items[0].metadata.name
        core_v1.delete_namespaced_pod(name=pod_name, namespace=NAMESPACE)
        print(f'[SENTINEL] Restarted unhealthy pod: {pod_name}')

import subprocess

def heal_cartservice():
    scale_deployment('cartservice', 3)
    body = {"spec": {"template": {"spec": {"containers": [{"name": "server", "resources": {"limits": {"memory": "512Mi"}}}]}}}}
    apps_v1.patch_namespaced_deployment(name="cartservice", namespace=NAMESPACE, body=body)
    print('[SENTINEL] Restored cartservice memory limits & replicas.')

def heal_frontend():
    body = {"spec": {"template": {"spec": {"containers": [{"name": "server", "image": "gcr.io/google-samples/microservices-demo/frontend:v0.10.1"}]}}}}
    apps_v1.patch_namespaced_deployment(name="frontend", namespace=NAMESPACE, body=body)
    scale_deployment('frontend', 3)
    print('[SENTINEL] Reverted corrupted frontend image to v0.10.1')

def heal_redis():
    try:
        # Re-apply massive declarative manifest to effortlessly restore deleted services
        subprocess.run(["kubectl", "apply", "-f", "../../microservices-demo/release/kubernetes-manifests.yaml"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('[SENTINEL] Declaratively restored missing redis-cart networking Service.')
    except Exception as e:
        print(f"Failed to apply manifest: {e}")
    restart_pod('app=redis-cart')

# Map the target services to their auto-healing actions
ACTION_MAP = {
    'cartservice':     heal_cartservice,
    'frontend':        heal_frontend,
    'redis-cart':      heal_redis,
    'checkoutservice': lambda: restart_pod('app=checkoutservice'),
}

RED_THRESHOLD = 0.85
acted_recently = {}

def decision_loop():
    print('[SENTINEL] Decision Engine Armed & Monitoring...')
    # Use localhost through the port-forward tunnel!
    predictor_url = 'http://localhost:8000/risk'
    
    # Intelligently load local .env variables from the root folder
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
    try:
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'\"")
    except FileNotFoundError:
        pass

    # Safely pull the Slack workspace webhook from the dynamically loaded OS environment
    SLACK_WEBHOOK_URL = os.getenv("WEBHOOK_URL")

    while True:
        try:
            resp = requests.get(predictor_url, timeout=5).json()
            if not resp.get('model_ready'):
                print("[SENTINEL] Waiting for ML model to collect baseline data...")
                time.sleep(15)
                continue

            scores = resp.get('scores', {})
            print(f"[METRICS] Live Risk Scores: {scores}")

            for svc, score in scores.items():
                cooldown = acted_recently.get(svc, 0)
                if score > RED_THRESHOLD and time.time() - cooldown > 120:
                    print(f'\n🚨 [ALERT] Anomaly Detected in {svc.upper()}! Risk Score: {score}')
                    print(f'🤖 [AUTO-HEAL] Executing pre-emptive recovery action...')
                    
                    # 1. Fire Real-time Slack Telemetry Alert
                    try:
                        alert_msg = f"🚨 *SENTINEL CRITICAL ALERT*\n*Service:* `{svc}`\n*Risk Score:* `{score:.3f}`\n*Action:* Auto-Healing Sequence Engaged."
                        requests.post(SLACK_WEBHOOK_URL, json={'text': alert_msg}, timeout=3)
                    except Exception as e:
                        pass
                        
                    # 2. Purge any lingering Chaos Mesh experiments so they stop re-infecting new pods
                    subprocess.run(["kubectl", "delete", "networkchaos,stresschaos,podchaos", "--all", "--all-namespaces"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    
                    # 2. Revert the programmatic scaling/image-corruption attacks
                    ACTION_MAP[svc]()
                    acted_recently[svc] = time.time()
                    print('---------------------------------------------------\n')
        except Exception as e:
            print(f'Decision loop error: {e}')
        time.sleep(15)

if __name__ == '__main__':
    decision_loop()