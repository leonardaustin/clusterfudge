package portforward

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	annotationEnabled    = "clusterfudge.dev/port-forward"
	annotationLocalPort  = "clusterfudge.dev/local-port"
	annotationLabel      = "clusterfudge.dev/label"
	annotationAutoStart  = "clusterfudge.dev/auto-start"
	annotationMultiPorts = "clusterfudge.dev/port-forwards"
)

// DiscoveredForward represents a port-forward preset discovered from
// service annotations.
type DiscoveredForward struct {
	ServiceName string `json:"serviceName"`
	Namespace   string `json:"namespace"`
	ServicePort int    `json:"servicePort"`
	LocalPort   int    `json:"localPort"`
	Label       string `json:"label"`
	AutoStart   bool   `json:"autoStart"`
}

// multiPortEntry is the JSON schema for the clusterfudge.dev/port-forwards annotation.
type multiPortEntry struct {
	Port      int    `json:"port"`
	LocalPort int    `json:"localPort"`
	Label     string `json:"label"`
}

// DiscoverPortForwards scans services in the given namespace (or all
// namespaces if empty) for clusterfudge.dev/port-forward annotations
// and returns discovered presets.
func DiscoverPortForwards(ctx context.Context, client kubernetes.Interface, namespace string) ([]DiscoveredForward, error) {
	services, err := client.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var results []DiscoveredForward

	for _, svc := range services.Items {
		annotations := svc.Annotations
		if annotations == nil {
			continue
		}

		// Check for multi-port JSON annotation first.
		if multiJSON, ok := annotations[annotationMultiPorts]; ok {
			var entries []multiPortEntry
			if err := json.Unmarshal([]byte(multiJSON), &entries); err != nil {
				log.Printf("failed to parse %s annotation on service %s/%s: %v", annotationMultiPorts, svc.Namespace, svc.Name, err)
			} else {
				autoStart := parseBool(annotations[annotationAutoStart])
				for _, e := range entries {
					localPort := e.LocalPort
					if localPort == 0 {
						localPort = e.Port
					}
					results = append(results, DiscoveredForward{
						ServiceName: svc.Name,
						Namespace:   svc.Namespace,
						ServicePort: e.Port,
						LocalPort:   localPort,
						Label:       e.Label,
						AutoStart:   autoStart,
					})
				}
				continue
			}
		}

		// Check for single-port annotation.
		enabled := annotations[annotationEnabled]
		if !parseBool(enabled) {
			continue
		}

		// Find the first service port.
		if len(svc.Spec.Ports) == 0 {
			continue
		}
		servicePort := int(svc.Spec.Ports[0].Port)

		localPort := servicePort
		if lp, ok := annotations[annotationLocalPort]; ok {
			if parsed, err := strconv.Atoi(lp); err == nil && parsed > 0 {
				localPort = parsed
			}
		}

		label := annotations[annotationLabel]
		if label == "" {
			label = svc.Name
		}

		autoStart := parseBool(annotations[annotationAutoStart])

		results = append(results, DiscoveredForward{
			ServiceName: svc.Name,
			Namespace:   svc.Namespace,
			ServicePort: servicePort,
			LocalPort:   localPort,
			Label:       label,
			AutoStart:   autoStart,
		})
	}

	return results, nil
}

func parseBool(s string) bool {
	s = strings.TrimSpace(strings.ToLower(s))
	return s == "true" || s == "1" || s == "yes"
}
