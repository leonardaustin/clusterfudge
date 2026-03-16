package resource

import (
	"context"
	"fmt"
	"log"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	sigyaml "sigs.k8s.io/yaml"
)

// Service provides generic CRUD and watch operations for Kubernetes resources.
type Service struct{}

// NewService returns a new Service.
func NewService() *Service { return &Service{} }

func gvr(q ResourceQuery) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: q.Group, Version: q.Version, Resource: q.Resource}
}

func resourceClient(client dynamic.Interface, q ResourceQuery) dynamic.ResourceInterface {
	r := client.Resource(gvr(q))
	if q.Namespace != "" {
		return r.Namespace(q.Namespace)
	}
	return r
}

func toItem(obj *unstructured.Unstructured) ResourceItem {
	raw := obj.Object
	item := ResourceItem{
		Name:      obj.GetName(),
		Namespace: obj.GetNamespace(),
		Labels:    obj.GetLabels(),
		Raw:       raw,
	}
	if spec, ok := raw["spec"].(map[string]interface{}); ok {
		item.Spec = spec
	}
	if status, ok := raw["status"].(map[string]interface{}); ok {
		item.Status = status
	}
	return item
}

// List returns all resources matching the query, automatically paginating
// through large result sets using continuation tokens.
func (s *Service) List(ctx context.Context, client dynamic.Interface, q ResourceQuery) ([]ResourceItem, error) {
	allItems := make([]ResourceItem, 0)
	opts := metav1.ListOptions{Limit: 500}
	rc := resourceClient(client, q)
	for {
		list, err := rc.List(ctx, opts)
		if err != nil {
			return nil, err
		}
		for i := range list.Items {
			allItems = append(allItems, toItem(&list.Items[i]))
		}
		if list.GetContinue() == "" {
			break
		}
		opts.Continue = list.GetContinue()
	}
	return allItems, nil
}

// Get returns a single resource.
func (s *Service) Get(ctx context.Context, client dynamic.Interface, q ResourceQuery) (*ResourceItem, error) {
	obj, err := resourceClient(client, q).Get(ctx, q.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	item := toItem(obj)
	return &item, nil
}

// Apply creates or updates a resource using server-side apply semantics.
// The data parameter should be a JSON-encoded Kubernetes object.
func (s *Service) Apply(ctx context.Context, client dynamic.Interface, q ResourceQuery, data []byte) error {
	var obj unstructured.Unstructured
	if err := sigyaml.Unmarshal(data, &obj.Object); err != nil {
		return fmt.Errorf("unmarshal resource: %w", err)
	}

	name := q.Name
	if name == "" {
		name = obj.GetName()
	}

	rc := resourceClient(client, q)
	_, err := rc.Apply(ctx, name, &obj, metav1.ApplyOptions{FieldManager: "kubeviewer", Force: true})
	return err
}

// Patch applies a patch to a resource.
func (s *Service) Patch(ctx context.Context, client dynamic.Interface, q ResourceQuery, pt types.PatchType, data []byte) error {
	_, err := resourceClient(client, q).Patch(ctx, q.Name, pt, data, metav1.PatchOptions{})
	return err
}

// Delete removes a resource.
func (s *Service) Delete(ctx context.Context, client dynamic.Interface, q ResourceQuery) error {
	return resourceClient(client, q).Delete(ctx, q.Name, metav1.DeleteOptions{})
}

// Watch returns a channel of events for resources matching the query.
// The channel is closed when the context is cancelled.
func (s *Service) Watch(ctx context.Context, client dynamic.Interface, q ResourceQuery) (<-chan WatchEvent, error) {
	watcher, err := resourceClient(client, q).Watch(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	ch := make(chan WatchEvent, 64)
	go func() {
		defer close(ch)
		defer watcher.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case evt, ok := <-watcher.ResultChan():
				if !ok {
					return
				}
				if evt.Type == watch.Error {
					log.Printf("watch error event: %v", evt.Object)
					return
				}
				u, ok := evt.Object.(*unstructured.Unstructured)
				if !ok {
					continue
				}
				var eventType string
				switch evt.Type {
				case watch.Added:
					eventType = "ADDED"
				case watch.Modified:
					eventType = "MODIFIED"
				case watch.Deleted:
					eventType = "DELETED"
				default:
					continue
				}
				select {
				case ch <- WatchEvent{
					Type:     eventType,
					Resource: toItem(u),
				}:
				default:
					log.Printf("watch channel full, dropping %s event for %s/%s", eventType, u.GetNamespace(), u.GetName())
				}
			}
		}
	}()
	return ch, nil
}
