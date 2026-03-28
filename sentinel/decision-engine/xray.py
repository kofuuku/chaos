from prometheus_api_client import PrometheusConnect
import json

prom = PrometheusConnect(url='http://localhost:9090', disable_ssl=True)
svc_name = "cartservice"

# The exact query your Predictor is using
query = f'sum(rate(container_cpu_usage_seconds_total{{namespace="default", pod=~"{svc_name}.*"}}[1m]))'

try:
    result = prom.custom_query(query=query)
    if not result:
        print("🚨 PROMETHEUS RETURNED NO DATA! The query is broken or labels don't match.")
    else:
        print(f"✅ DATA FOUND FOR {svc_name.upper()}:")
        # Print the actual raw CPU value the AI is seeing right now
        val = float(result[0]['value'][1])
        print(f"Current CPU Rate: {val:.4f}")
        
        if val == 0.0:
            print("⚠️ CPU is exactly 0. Chaos Mesh is NOT working on your Mac architecture.")
        elif val < 0.1:
            print("⚠️ CPU is very low. Chaos Mesh is running, but it's too weak to trigger the anomaly threshold.")
        else:
            print("🔥 CPU is spiking! If the ML model still says 0.0, the Python Scikit-Learn logic is broken.")
except Exception as e:
    print(f"Error connecting to Prometheus: {e}")
