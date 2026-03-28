# 1. Nuke any old cluster and start a fresh one
minikube delete -p chaos-cluster
minikube start -p chaos-cluster --cpus=4 --memory=6000

# 2. Navigate to the code (assuming it's already cloned)
cd ~/Desktop/chaos-platform/microservices-demo

# 3. Deploy the raw, unpatched application
kubectl apply -f ./release/kubernetes-manifests.yaml


# 1. Fix the OOMKilled issue for the cartservice
kubectl set resources deployment cartservice -c=server --limits=memory=512Mi

# 2. Swap to ARM64-compatible images for Redis and the Load Generator
kubectl set image deployment/redis-cart redis=redis:alpine
kubectl set image deployment/loadgenerator main=gcr.io/google-samples/microservices-demo/loadgenerator:v0.10.1
kubectl set image deployment/loadgenerator frontend-check=busybox:latest

# 3. Pass your local Docker credentials into the cluster
kubectl create secret generic regcred \
    --from-file=.dockerconfigjson=$HOME/.docker/config.json \
    --type=kubernetes.io/dockerconfigjson

# 4. Tell the failing deployments to use your Docker credentials
kubectl patch deployment redis-cart -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"regcred"}]}}}}'
kubectl patch deployment loadgenerator -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"regcred"}]}}}}'

# 5. Delete the patched pods so Kubernetes recreates them cleanly
kubectl delete pod -l app=redis-cart
kubectl delete pod -l app=loadgenerator



# 1. Add the Bitnami repository and install PostgreSQL via Helm
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm install my-postgres bitnami/postgresql --set auth.postgresPassword=chaos_password

# 2. Deploy the custom Python "inventory-checker" pod
# (Copy and paste this entire block into your terminal and hit Enter)
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory-checker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: inventory-checker
  template:
    metadata:
      labels:
        app: inventory-checker
    spec:
      containers:
      - name: python-pinger
        image: python:3.9-slim
        command: ["/bin/sh", "-c"]
        args:
        - |
          pip install psycopg2-binary;
          python -c "
          import psycopg2, time
          while True:
              try:
                  conn = psycopg2.connect(host='my-postgres-postgresql', dbname='postgres', user='postgres', password='chaos_password')
                  print('Inventory check successful: Connected to Postgres!')
                  conn.close()
              except Exception as e:
                  print('Postgres connection failed:', e)
              time.sleep(5)
          "
EOF




# Watch the pods spin up (Look for your new postgres and inventory-checker pods!)
kubectl get pods -w


# to run website
minikube service frontend-external -p chaos-cluster