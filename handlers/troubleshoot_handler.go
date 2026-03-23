package handlers

import (
	"context"
	"fmt"
	"time"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/troubleshoot"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type TroubleshootHandler struct {
	engine  *troubleshoot.Engine
	manager *cluster.Manager
}

func NewTroubleshootHandler(engine *troubleshoot.Engine, mgr *cluster.Manager) *TroubleshootHandler {
	return &TroubleshootHandler{engine: engine, manager: mgr}
}

func (h *TroubleshootHandler) Investigate(kind, namespace, name string, status map[string]any) *troubleshoot.Investigation {
	return h.engine.Investigate(kind, namespace, name, status)
}

func (h *TroubleshootHandler) GetTimeline(kind, namespace, name string) []troubleshoot.ChangeRecord {
	return h.engine.GetTimeline(kind, namespace, name)
}

// GetRecentChanges returns all changes from the last hour.
func (h *TroubleshootHandler) GetRecentChanges() []troubleshoot.ChangeRecord {
	return h.engine.GetTimeline("", "", "")
}

// kindToGVR maps common Kubernetes resource kinds to their GroupVersionResource.
func kindToGVR(kind string) (schema.GroupVersionResource, error) {
	switch kind {
	case "Deployment":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, nil
	case "Pod":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}, nil
	case "Service":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}, nil
	case "StatefulSet":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}, nil
	case "DaemonSet":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}, nil
	default:
		return schema.GroupVersionResource{}, fmt.Errorf("unsupported kind: %s", kind)
	}
}

// InvestigateResource fetches a resource from the cluster by kind/namespace/name
// and runs the troubleshoot engine on it.
func (h *TroubleshootHandler) InvestigateResource(kind, namespace, name string) (*troubleshoot.Investigation, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("active clients: %w", err)
	}

	gvr, err := kindToGVR(kind)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	res, err := bundle.Dynamic.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s %s/%s: %w", kind, namespace, name, err)
	}

	statusMap, _ := res.Object["status"].(map[string]any)
	if statusMap == nil {
		statusMap = make(map[string]any)
	}

	// For Pods, extract container status details.
	if kind == "Pod" {
		if phase, ok := statusMap["phase"].(string); ok {
			statusMap["phase"] = phase
		}
		if containerStatuses, ok := statusMap["containerStatuses"].([]any); ok {
			for _, cs := range containerStatuses {
				csMap, ok := cs.(map[string]any)
				if !ok {
					continue
				}
				state, _ := csMap["state"].(map[string]any)
				if state == nil {
					continue
				}
				if waiting, ok := state["waiting"].(map[string]any); ok {
					if reason, ok := waiting["reason"].(string); ok {
						statusMap["reason"] = reason
					}
				}
				if terminated, ok := state["terminated"].(map[string]any); ok {
					if exitCode, ok := terminated["exitCode"]; ok {
						statusMap["exitCode"] = exitCode
					}
				}
			}
		}
	}

	inv := h.engine.Investigate(kind, namespace, name, statusMap)
	inv.RawStatus = res.Object
	return inv, nil
}
