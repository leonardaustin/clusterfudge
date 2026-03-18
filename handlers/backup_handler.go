package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"clusterfudge/internal/backup"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	sigyaml "sigs.k8s.io/yaml"
)

// BackupHandler exposes backup/restore operations to the Wails frontend.
type BackupHandler struct {
	svc     *resource.Service
	manager *cluster.Manager
}

// NewBackupHandler creates a new BackupHandler.
func NewBackupHandler(svc *resource.Service, mgr *cluster.Manager) *BackupHandler {
	return &BackupHandler{svc: svc, manager: mgr}
}

// StripManifest removes server-side fields from a resource manifest.
func (h *BackupHandler) StripManifest(manifest map[string]any) map[string]any {
	return backup.StripServerFields(manifest)
}

// StripManifestFromString accepts a JSON or YAML string, strips server-side fields,
// and returns the cleaned YAML.
func (h *BackupHandler) StripManifestFromString(input string) (string, error) {
	var obj map[string]any
	if err := sigyaml.Unmarshal([]byte(input), &obj); err != nil {
		return "", fmt.Errorf("parse manifest: %w", err)
	}
	stripped := backup.StripServerFields(obj)
	out, err := sigyaml.Marshal(stripped)
	if err != nil {
		return "", fmt.Errorf("marshal result: %w", err)
	}
	return string(out), nil
}

// Export lists resources matching the given options and returns them as
// multi-document YAML with optional metadata/status stripping.
func (h *BackupHandler) Export(opts backup.ExportOptions) (*backup.ExportResult, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("export: %w", err)
	}

	kinds := opts.Kinds
	if len(kinds) == 0 {
		return nil, fmt.Errorf("export: at least one resource kind is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var allResources []map[string]any
	var seenKinds []string

	for _, kind := range kinds {
		gvr, lookupErr := k8s.LookupGVR(kind)
		if lookupErr != nil {
			return nil, fmt.Errorf("export: %w", lookupErr)
		}

		var client dynamic.ResourceInterface
		if opts.Namespace != "" && k8s.IsNamespaced(gvr) {
			client = cs.Dynamic.Resource(gvr).Namespace(opts.Namespace)
		} else {
			client = cs.Dynamic.Resource(gvr)
		}

		listOpts := metav1.ListOptions{}
		if opts.Labels != "" {
			listOpts.LabelSelector = opts.Labels
		}

		list, listErr := client.List(ctx, listOpts)
		if listErr != nil {
			return nil, fmt.Errorf("export %s: %w", kind, listErr)
		}

		if len(list.Items) > 0 {
			seenKinds = append(seenKinds, kind)
		}

		for i := range list.Items {
			raw := list.Items[i].Object
			if opts.StripMeta || opts.StripStatus {
				raw = backup.StripServerFields(raw)
			}
			allResources = append(allResources, raw)
		}
	}

	yamlStr, err := backup.FormatAsYAML(allResources)
	if err != nil {
		return nil, fmt.Errorf("export format: %w", err)
	}

	return &backup.ExportResult{
		YAML:          yamlStr,
		ResourceCount: len(allResources),
		Kinds:         seenKinds,
	}, nil
}

// Import applies resources from multi-document YAML. If DryRun is set,
// resources are validated via server-side dry run without persisting.
func (h *BackupHandler) Import(opts backup.ImportOptions) (*backup.ImportResult, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("import: %w", err)
	}

	docs := splitYAMLDocuments(opts.YAML)
	if len(docs) == 0 {
		return nil, fmt.Errorf("import: no YAML documents found")
	}

	result := &backup.ImportResult{}

	for _, doc := range docs {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			continue
		}

		jsonBytes, convErr := sigyaml.YAMLToJSON([]byte(doc))
		if convErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("parse error: %v", convErr))
			continue
		}

		var obj unstructured.Unstructured
		if unmarshalErr := json.Unmarshal(jsonBytes, &obj.Object); unmarshalErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("unmarshal error: %v", unmarshalErr))
			continue
		}

		gvk := obj.GroupVersionKind()
		gvr, lookupErr := k8s.LookupGVRByKind(gvk.Kind)
		if lookupErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s/%s: %v", obj.GetNamespace(), obj.GetName(), lookupErr))
			continue
		}

		ns := obj.GetNamespace()
		if opts.TargetNamespace != "" && k8s.IsNamespaced(gvr) {
			ns = opts.TargetNamespace
			obj.SetNamespace(ns)
		}

		name := obj.GetName()
		ref := fmt.Sprintf("%s/%s", ns, name)
		if ns == "" {
			ref = name
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		var resClient dynamic.ResourceInterface
		if ns != "" {
			resClient = cs.Dynamic.Resource(gvr).Namespace(ns)
		} else {
			resClient = cs.Dynamic.Resource(gvr)
		}

		applyOpts := metav1.ApplyOptions{FieldManager: "clusterfudge", Force: true}
		if opts.DryRun {
			applyOpts.DryRun = []string{metav1.DryRunAll}
		}

		// Check if resource already exists to distinguish created vs updated.
		_, getErr := resClient.Get(ctx, name, metav1.GetOptions{})
		existed := getErr == nil

		_, applyErr := resClient.Apply(ctx, name, &obj, applyOpts)

		if applyErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", ref, applyErr))
			continue
		}

		if existed {
			result.Updated = append(result.Updated, ref)
		} else {
			result.Created = append(result.Created, ref)
		}
	}

	return result, nil
}

// splitYAMLDocuments splits multi-document YAML by "---" separators.
func splitYAMLDocuments(yaml string) []string {
	parts := strings.Split(yaml, "\n---")
	var docs []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && p != "---" {
			docs = append(docs, p)
		}
	}
	return docs
}
