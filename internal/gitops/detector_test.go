package gitops

import (
	"testing"
)

func TestDetectArgoCD(t *testing.T) {
	d := NewDetector()
	result := d.Detect([]string{"apps", "argoproj.io", "v1"})

	if len(result.Providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(result.Providers))
	}
	if result.Providers[0].Provider != ProviderArgoCD {
		t.Errorf("expected argocd, got %s", result.Providers[0].Provider)
	}
}

func TestDetectFlux(t *testing.T) {
	d := NewDetector()
	result := d.Detect([]string{"source.toolkit.fluxcd.io", "kustomize.toolkit.fluxcd.io"})

	if len(result.Providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(result.Providers))
	}
	if result.Providers[0].Provider != ProviderFlux {
		t.Errorf("expected flux, got %s", result.Providers[0].Provider)
	}
	if len(result.Providers[0].Resources) != 2 {
		t.Errorf("expected 2 resources, got %d", len(result.Providers[0].Resources))
	}
}

func TestDetectBoth(t *testing.T) {
	d := NewDetector()
	result := d.Detect([]string{"argoproj.io", "source.toolkit.fluxcd.io"})

	if len(result.Providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(result.Providers))
	}
}

func TestDetectNeither(t *testing.T) {
	d := NewDetector()
	result := d.Detect([]string{"apps", "v1", "batch"})

	if len(result.Providers) != 0 {
		t.Errorf("expected 0 providers, got %d", len(result.Providers))
	}
}

func TestDetectFluxSourceOnly(t *testing.T) {
	d := NewDetector()
	result := d.Detect([]string{"source.toolkit.fluxcd.io"})

	if len(result.Providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(result.Providers))
	}
	if len(result.Providers[0].Resources) != 1 {
		t.Errorf("expected 1 resource, got %d", len(result.Providers[0].Resources))
	}
}
