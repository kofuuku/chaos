from prometheus_api_client import PrometheusConnect
import numpy as np
from datetime import datetime, timedelta

# Using Kubernetes Internal DNS to reach Prometheus
PROMETHEUS_URL = 'http://localhost:9091'
prom = PrometheusConnect(url=PROMETHEUS_URL, disable_ssl=True)

# Target the 'default' namespace and filter by specific service pod pod=~"^SERVICE.*"
METRICS = {
    'cpu': 'sum(rate(container_cpu_usage_seconds_total{namespace="default",pod=~"^%s.*"}[1m]))',
    'memory': 'sum(container_memory_working_set_bytes{namespace="default",pod=~"^%s.*"})',
    'latency': 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{namespace="default",pod=~"^%s.*"}[1m])) by (le))',
    'errors': 'sum(rate(http_requests_total{namespace="default",pod=~"^%s.*",status=~"5.."}[1m]))',
}

def fetch_window(metric_name, svc, minutes=30):
    query = METRICS[metric_name] % svc
    
    # INSTANT OUTAGE CHECK: If the pod is dead/missing RIGHT NOW, kill the historical ghost loop 
    current = prom.custom_query(query=query)
    if not current or current[0]['value'][1] == 'NaN' or float(current[0]['value'][1]) == 0.0:
        return np.array([0.0])
    end = datetime.now()
    start = end - timedelta(minutes=minutes)
    result = prom.custom_query_range(query=query, start_time=start, end_time=end, step='5s')
    
    if not result:
        # OUTAGE/CRASH DETECTED: Prometheus returned nothing for this pod
        return np.array([0.0])
        
    all_values = [float(v[1]) for v in result[0]['values'] if v[1] != 'NaN']
    return np.array(all_values) if all_values else np.array([0.0])

def compute_features(values):
    v = values[-12:] if len(values) >= 12 else values
    if len(v) == 0:
        return {'mean': 0, 'std': 0, 'slope': 0, 'max': 0}
    slope = float(np.polyfit(range(len(v)), v, 1)[0]) if len(v) > 1 else 0
    return {
        'mean':  float(np.mean(v)),
        'std':   float(np.std(v)),
        'slope': slope,
        'max':   float(np.max(v))
    }