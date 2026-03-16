package main

import (
	"context"
	"testing"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/k8s"
)

func TestNewApp(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	if app == nil {
		t.Fatal("NewApp returned nil")
	}
	if app.clusterMgr != mgr {
		t.Fatal("clusterMgr not set correctly")
	}
}

func TestNewAppNilPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for nil clusterMgr")
		}
	}()
	NewApp(nil, nil)
}

func TestGetVersion(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	v := app.GetVersion()
	if v != "dev" {
		t.Fatalf("expected version dev, got %s", v)
	}
}

func TestStartup(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	ctx := context.Background()
	app.startup(ctx)
	if app.ctx != ctx {
		t.Fatal("startup did not set ctx")
	}
}

func TestDomReady(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	// domReady should not panic
	app.domReady(context.Background())
}

func TestShutdown(t *testing.T) {
	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{})
	app := NewApp(mgr, nil)

	if app.clusterMgr.ActiveConnection() == nil {
		t.Fatal("pre-condition failed: manager should be connected")
	}

	app.shutdown(context.Background())

	if app.clusterMgr.ActiveConnection() != nil {
		t.Fatal("manager should be disconnected after shutdown")
	}
}
