from prometheus_api_client import PrometheusConnect

prom = PrometheusConnect(url='http://localhost:9090', disable_ssl=True)
query = 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"redis-cart.*"}[1m]))'

try:
    result = prom.custom_query(query=query)
    if result:
        val = float(result[0]['value'][1])
        print(f"🔥 RAW REDIS CPU: {val:.4f}")
        if val < 0.1:
            print("⚠️ Prometheus still sees low CPU. The loop hasn't run long enough or failed.")
        else:
            print("✅ CPU IS SPIKING! Prometheus sees it. The bug is in the Python ML model.")
    else:
        print("🚨 NO DATA")
except Exception as e:
    print(f"Error: {e}")
