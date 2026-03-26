package templates

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidate_RequiredMissing(t *testing.T) {
	tmpl := Template{
		Variables: []Variable{
			{Name: "name", Type: "string", Required: true, Description: "Name"},
			{Name: "image", Type: "string", Required: true, Description: "Image"},
		},
	}

	errs := Validate(tmpl, map[string]any{"name": "app"})
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d: %v", len(errs), errs)
	}
	if !strings.Contains(errs[0], "image") {
		t.Errorf("expected error about image, got: %s", errs[0])
	}
}

func TestValidate_OptionsCheck(t *testing.T) {
	tmpl := Template{
		Variables: []Variable{
			{Name: "type", Type: "string", Required: true, Options: []string{"ClusterIP", "NodePort"}, Description: "Type"},
		},
	}

	errs := Validate(tmpl, map[string]any{"type": "Invalid"})
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d: %v", len(errs), errs)
	}
	if !strings.Contains(errs[0], "not in allowed options") {
		t.Errorf("expected options error, got: %s", errs[0])
	}
}

func TestValidate_AllValid(t *testing.T) {
	tmpl := Template{
		Variables: []Variable{
			{Name: "name", Type: "string", Required: true, Description: "Name"},
		},
	}

	errs := Validate(tmpl, map[string]any{"name": "myapp"})
	if len(errs) != 0 {
		t.Errorf("expected no errors, got: %v", errs)
	}
}

func TestRender_WebApp(t *testing.T) {
	engine := NewEngine()
	tmpl, ok := engine.GetTemplate("web-app")
	if !ok {
		t.Fatal("web-app template not found")
	}

	result, err := engine.Render(tmpl, map[string]any{
		"name":  "myapp",
		"image": "nginx:latest",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, want := range []string{
		"kind: Deployment",
		"kind: Service",
		"name: myapp",
		"image: nginx:latest",
		"replicas: 2",
	} {
		if !strings.Contains(result.YAML, want) {
			t.Errorf("rendered YAML missing %q", want)
		}
	}

	if len(result.Resources) != 2 {
		t.Errorf("expected 2 resources, got %d", len(result.Resources))
	}
}

func TestRender_CronJob(t *testing.T) {
	engine := NewEngine()
	tmpl, ok := engine.GetTemplate("cron-job")
	if !ok {
		t.Fatal("cron-job template not found")
	}

	result, err := engine.Render(tmpl, map[string]any{
		"name":     "cleanup",
		"image":    "busybox",
		"schedule": "0 2 * * *",
		"command":  "echo hello",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.YAML, "kind: CronJob") {
		t.Error("expected CronJob kind in output")
	}
	if !strings.Contains(result.YAML, "0 2 * * *") {
		t.Error("expected schedule in output")
	}
}

func TestRender_ValidationError(t *testing.T) {
	engine := NewEngine()
	tmpl, ok := engine.GetTemplate("web-app")
	if !ok {
		t.Fatal("web-app template not found")
	}

	_, err := engine.Render(tmpl, map[string]any{})
	if err == nil {
		t.Error("expected validation error for missing required variables")
	}
}

func TestRender_Defaults(t *testing.T) {
	engine := NewEngine()
	tmpl, ok := engine.GetTemplate("redis-cache")
	if !ok {
		t.Fatal("redis-cache template not found")
	}

	result, err := engine.Render(tmpl, map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.YAML, "redis:7-alpine") {
		t.Error("expected default image in output")
	}
}

func TestListTemplates(t *testing.T) {
	engine := NewEngine()
	templates := engine.ListTemplates()
	if len(templates) < 3 {
		t.Errorf("expected at least 3 built-in templates, got %d", len(templates))
	}
}

func TestSaveAndDeleteTemplate(t *testing.T) {
	tmpDir := t.TempDir()
	engine := &Engine{
		templates: make(map[string]Template),
		storeDir:  tmpDir,
	}

	tmpl := Template{
		Name:        "custom-app",
		Description: "Custom template",
		Version:     1,
		Variables: []Variable{
			{Name: "name", Type: "string", Required: true, Description: "App name"},
		},
		Body: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {{.name}}\n",
	}

	if err := engine.SaveTemplate(tmpl); err != nil {
		t.Fatalf("SaveTemplate failed: %v", err)
	}

	// Verify file was created.
	if _, err := os.Stat(filepath.Join(tmpDir, "custom-app.json")); err != nil {
		t.Fatalf("template file not found: %v", err)
	}

	// Verify template is registered.
	got, ok := engine.GetTemplate("custom-app")
	if !ok {
		t.Fatal("saved template not found in engine")
	}
	if got.Description != "Custom template" {
		t.Errorf("unexpected description: %s", got.Description)
	}

	// Delete the template.
	if err := engine.DeleteTemplate("custom-app"); err != nil {
		t.Fatalf("DeleteTemplate failed: %v", err)
	}

	if _, ok := engine.GetTemplate("custom-app"); ok {
		t.Error("template should be deleted")
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "custom-app.json")); !os.IsNotExist(err) {
		t.Error("template file should be deleted")
	}
}

func TestSaveTemplate_CannotOverwriteBuiltIn(t *testing.T) {
	engine := NewEngine()
	tmpl := Template{Name: "web-app", Description: "override"}
	if err := engine.SaveTemplate(tmpl); err == nil {
		t.Error("expected error when overwriting built-in template")
	}
}

func TestDeleteTemplate_CannotDeleteBuiltIn(t *testing.T) {
	engine := NewEngine()
	if err := engine.DeleteTemplate("web-app"); err == nil {
		t.Error("expected error when deleting built-in template")
	}
}

func TestDeleteTemplate_NotFound(t *testing.T) {
	engine := NewEngine()
	if err := engine.DeleteTemplate("nonexistent"); err == nil {
		t.Error("expected error for nonexistent template")
	}
}

func TestRender_BasicVariableSubstitution(t *testing.T) {
	engine := &Engine{
		templates: make(map[string]Template),
		storeDir:  t.TempDir(),
	}
	tmpl := Template{
		Name: "basic",
		Variables: []Variable{
			{Name: "appName", Type: "string", Required: true, Description: "App name"},
			{Name: "port", Type: "string", Required: true, Description: "Port"},
		},
		Body: "name: {{.appName}}\nport: {{.port}}\n",
	}

	result, err := engine.Render(tmpl, map[string]any{"appName": "myservice", "port": "8080"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result.YAML, "name: myservice") {
		t.Error("expected appName substitution")
	}
	if !strings.Contains(result.YAML, "port: 8080") {
		t.Error("expected port substitution")
	}
}

func TestRender_SafeFunctions(t *testing.T) {
	engine := &Engine{
		templates: make(map[string]Template),
		storeDir:  t.TempDir(),
	}

	tests := []struct {
		name     string
		body     string
		values   map[string]any
		expected string
	}{
		{"upper", `{{upper .val}}`, map[string]any{"val": "hello"}, "HELLO"},
		{"lower", `{{lower .val}}`, map[string]any{"val": "HELLO"}, "hello"},
		{"trim", `{{trim .val}}`, map[string]any{"val": "  hello  "}, "hello"},
		{"trimPrefix", `{{trimPrefix .val "pre-"}}`, map[string]any{"val": "pre-fix"}, "fix"},
		{"trimSuffix", `{{trimSuffix .val "-suf"}}`, map[string]any{"val": "word-suf"}, "word"},
		{"replace", `{{replace .val "." "-"}}`, map[string]any{"val": "a.b.c"}, "a-b-c"},
		{"contains", `{{if contains .val "ell"}}yes{{end}}`, map[string]any{"val": "hello"}, "yes"},
		{"hasPrefix", `{{if hasPrefix .val "he"}}yes{{end}}`, map[string]any{"val": "hello"}, "yes"},
		{"hasSuffix", `{{if hasSuffix .val "lo"}}yes{{end}}`, map[string]any{"val": "hello"}, "yes"},
		{"quote", `{{quote .val}}`, map[string]any{"val": "hi"}, `"hi"`},
		{"default-used", `{{default "fallback" .val}}`, map[string]any{"val": ""}, "fallback"},
		{"default-not-used", `{{default "fallback" .val}}`, map[string]any{"val": "actual"}, "actual"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tmpl := Template{
				Name: "func-test",
				Variables: []Variable{
					{Name: "val", Type: "string", Required: false, Description: "test value"},
				},
				Body: tc.body,
			}
			result, err := engine.Render(tmpl, tc.values)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(result.YAML, tc.expected) {
				t.Errorf("expected %q in output, got %q", tc.expected, result.YAML)
			}
		})
	}
}

func TestRender_MissingKeyError(t *testing.T) {
	engine := &Engine{
		templates: make(map[string]Template),
		storeDir:  t.TempDir(),
	}
	tmpl := Template{
		Name: "missing-key",
		Body: "value: {{.undefinedVar}}",
	}

	_, err := engine.Render(tmpl, map[string]any{})
	if err == nil {
		t.Fatal("expected error for undefined variable")
	}
	if !strings.Contains(err.Error(), "execute template") {
		t.Errorf("expected template execution error, got: %v", err)
	}
}

func TestRender_ParseError(t *testing.T) {
	engine := &Engine{
		templates: make(map[string]Template),
		storeDir:  t.TempDir(),
	}
	tmpl := Template{
		Name: "bad-syntax",
		Body: "{{.unclosed",
	}

	_, err := engine.Render(tmpl, map[string]any{})
	if err == nil {
		t.Fatal("expected error for malformed template")
	}
	if !strings.Contains(err.Error(), "parse template") {
		t.Errorf("expected parse error, got: %v", err)
	}
}
