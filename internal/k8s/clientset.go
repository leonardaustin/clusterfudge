package k8s

import (
	"fmt"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// ClientSet bundles the typed and dynamic Kubernetes clients alongside the
// rest.Config they were created from.
type ClientSet struct {
	Typed   kubernetes.Interface
	Dynamic dynamic.Interface
	Config  *rest.Config
}

// NewClientSet creates typed and dynamic clients from the given rest.Config.
func NewClientSet(cfg *rest.Config) (*ClientSet, error) {
	if cfg == nil {
		return nil, fmt.Errorf("rest.Config must not be nil")
	}

	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create typed client: %w", err)
	}

	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create dynamic client: %w", err)
	}

	return &ClientSet{
		Typed:   typed,
		Dynamic: dyn,
		Config:  cfg,
	}, nil
}
