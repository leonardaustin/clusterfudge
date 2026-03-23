package templates

// BuiltinTemplates returns the set of built-in templates.
func BuiltinTemplates() []Template {
	return []Template{
		webAppTemplate(),
		redisCacheTemplate(),
		cronJobTemplate(),
	}
}

func webAppTemplate() Template {
	return Template{
		Name:        "web-app",
		Description: "Web application with Deployment and Service",
		Version:     1,
		BuiltIn:     true,
		Variables: []Variable{
			{Name: "name", Type: "string", Required: true, Description: "Application name"},
			{Name: "image", Type: "string", Required: true, Description: "Container image"},
			{Name: "replicas", Type: "integer", Required: false, Default: 2, Description: "Number of replicas"},
			{Name: "port", Type: "integer", Required: false, Default: 80, Description: "Container port"},
			{Name: "serviceType", Type: "string", Required: false, Default: "ClusterIP", Description: "Service type", Options: []string{"ClusterIP", "NodePort", "LoadBalancer"}},
			{Name: "namespace", Type: "string", Required: false, Default: "default", Description: "Namespace"},
		},
		Body: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{.name}}
  namespace: {{.namespace}}
  labels:
    app: {{.name}}
spec:
  replicas: {{.replicas}}
  selector:
    matchLabels:
      app: {{.name}}
  template:
    metadata:
      labels:
        app: {{.name}}
    spec:
      containers:
      - name: {{.name}}
        image: {{.image}}
        ports:
        - containerPort: {{.port}}
---
apiVersion: v1
kind: Service
metadata:
  name: {{.name}}
  namespace: {{.namespace}}
spec:
  type: {{.serviceType}}
  selector:
    app: {{.name}}
  ports:
  - port: {{.port}}
    targetPort: {{.port}}
`,
	}
}

func redisCacheTemplate() Template {
	return Template{
		Name:        "redis-cache",
		Description: "Redis cache deployment with persistent storage",
		Version:     1,
		BuiltIn:     true,
		Variables: []Variable{
			{Name: "name", Type: "string", Required: false, Default: "redis", Description: "Redis instance name"},
			{Name: "namespace", Type: "string", Required: false, Default: "default", Description: "Namespace"},
			{Name: "image", Type: "string", Required: false, Default: "redis:7-alpine", Description: "Redis image"},
			{Name: "maxMemory", Type: "string", Required: false, Default: "128mb", Description: "Max memory for Redis"},
		},
		Body: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{.name}}
  namespace: {{.namespace}}
  labels:
    app: {{.name}}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {{.name}}
  template:
    metadata:
      labels:
        app: {{.name}}
    spec:
      containers:
      - name: {{.name}}
        image: {{.image}}
        args: ["--maxmemory", "{{.maxMemory}}", "--maxmemory-policy", "allkeys-lru"]
        ports:
        - containerPort: 6379
        resources:
          limits:
            memory: "256Mi"
            cpu: "250m"
---
apiVersion: v1
kind: Service
metadata:
  name: {{.name}}
  namespace: {{.namespace}}
spec:
  type: ClusterIP
  selector:
    app: {{.name}}
  ports:
  - port: 6379
    targetPort: 6379
`,
	}
}

func cronJobTemplate() Template {
	return Template{
		Name:        "cron-job",
		Description: "Kubernetes CronJob for scheduled tasks",
		Version:     1,
		BuiltIn:     true,
		Variables: []Variable{
			{Name: "name", Type: "string", Required: true, Description: "Job name"},
			{Name: "namespace", Type: "string", Required: false, Default: "default", Description: "Namespace"},
			{Name: "image", Type: "string", Required: true, Description: "Container image"},
			{Name: "schedule", Type: "string", Required: true, Description: "Cron schedule expression"},
			{Name: "command", Type: "string", Required: true, Description: "Command to execute"},
		},
		Body: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{.name}}
  namespace: {{.namespace}}
spec:
  schedule: "{{.schedule}}"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: {{.name}}
            image: {{.image}}
            command: ["/bin/sh", "-c", "{{.command}}"]
          restartPolicy: OnFailure
`,
	}
}
