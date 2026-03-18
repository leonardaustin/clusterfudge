package templates

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// Template defines a parameterized YAML template for Kubernetes resources.
type Template struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Version     int        `json:"version"`
	Variables   []Variable `json:"variables"`
	Body        string     `json:"body"`
	BuiltIn     bool       `json:"builtIn"`
	CreatedAt   string     `json:"createdAt"`
}

// Variable defines a parameter for a template.
type Variable struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Default     any      `json:"default,omitempty"`
	Description string   `json:"description"`
	Options     []string `json:"options,omitempty"`
}

// RenderResult holds the output of rendering a template.
type RenderResult struct {
	YAML      string   `json:"yaml"`
	Resources []string `json:"resources"`
	Errors    []string `json:"errors,omitempty"`
}

// Engine renders and validates templates.
type Engine struct {
	templates map[string]Template
	storeDir  string
}

// NewEngine creates an Engine pre-loaded with built-in templates.
// User templates are loaded from the OS config directory if available.
func NewEngine() *Engine {
	configDir, _ := os.UserConfigDir()
	storeDir := filepath.Join(configDir, "clusterfudge", "templates")

	e := &Engine{
		templates: make(map[string]Template),
		storeDir:  storeDir,
	}
	for _, t := range BuiltinTemplates() {
		e.templates[t.Name] = t
	}
	e.loadUserTemplates()
	return e
}

func (e *Engine) loadUserTemplates() {
	entries, err := os.ReadDir(e.storeDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(e.storeDir, entry.Name()))
		if err != nil {
			continue
		}
		var tmpl Template
		if err := json.Unmarshal(data, &tmpl); err != nil {
			continue
		}
		e.templates[tmpl.Name] = tmpl
	}
}

// GetTemplate returns a template by name.
func (e *Engine) GetTemplate(name string) (Template, bool) {
	t, ok := e.templates[name]
	return t, ok
}

// ListTemplates returns all registered templates.
func (e *Engine) ListTemplates() []Template {
	result := make([]Template, 0, len(e.templates))
	for _, t := range e.templates {
		result = append(result, t)
	}
	return result
}

// SaveTemplate persists a user template to disk and registers it in the engine.
func (e *Engine) SaveTemplate(tmpl Template) error {
	if tmpl.Name == "" {
		return fmt.Errorf("template name is required")
	}
	safeName := filepath.Base(tmpl.Name)
	if safeName == "" || safeName == "." {
		return fmt.Errorf("invalid template name %q", tmpl.Name)
	}
	if existing, ok := e.templates[tmpl.Name]; ok && existing.BuiltIn {
		return fmt.Errorf("cannot overwrite built-in template %q", tmpl.Name)
	}

	if err := os.MkdirAll(e.storeDir, 0o755); err != nil {
		return fmt.Errorf("create template directory: %w", err)
	}

	data, err := json.MarshalIndent(tmpl, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal template: %w", err)
	}

	path := filepath.Join(e.storeDir, safeName+".json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write template file: %w", err)
	}

	e.templates[tmpl.Name] = tmpl
	return nil
}

// DeleteTemplate removes a user template from disk and the engine.
func (e *Engine) DeleteTemplate(name string) error {
	tmpl, ok := e.templates[name]
	if !ok {
		return fmt.Errorf("template %q not found", name)
	}
	if tmpl.BuiltIn {
		return fmt.Errorf("cannot delete built-in template %q", name)
	}

	safeName := filepath.Base(name)
	if safeName == "" || safeName == "." {
		return fmt.Errorf("invalid template name %q", name)
	}
	path := filepath.Join(e.storeDir, safeName+".json")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove template file: %w", err)
	}

	delete(e.templates, name)
	return nil
}

// Validate checks that all required variables have values.
func Validate(tmpl Template, values map[string]any) []string {
	var errs []string
	for _, v := range tmpl.Variables {
		val, exists := values[v.Name]
		if v.Required && (!exists || val == nil || val == "") {
			errs = append(errs, fmt.Sprintf("required variable %q is missing", v.Name))
		}
		if exists && len(v.Options) > 0 {
			s := fmt.Sprintf("%v", val)
			found := false
			for _, opt := range v.Options {
				if opt == s {
					found = true
					break
				}
			}
			if !found {
				errs = append(errs, fmt.Sprintf("variable %q value %q not in allowed options %v", v.Name, s, v.Options))
			}
		}
	}
	return errs
}

// Render executes the template with the given values and returns the result.
func (e *Engine) Render(tmpl Template, values map[string]any) (*RenderResult, error) {
	// Apply defaults for missing values.
	merged := make(map[string]any)
	for _, v := range tmpl.Variables {
		if v.Default != nil {
			merged[v.Name] = v.Default
		}
	}
	for k, v := range values {
		merged[k] = v
	}

	if errs := Validate(tmpl, merged); len(errs) > 0 {
		return &RenderResult{Errors: errs}, fmt.Errorf("validation failed: %s", strings.Join(errs, "; "))
	}

	safeFuncMap := template.FuncMap{
		"upper":      strings.ToUpper,
		"lower":      strings.ToLower,
		"title":      strings.ToTitle,
		"trim":       strings.TrimSpace,
		"trimPrefix": strings.TrimPrefix,
		"trimSuffix": strings.TrimSuffix,
		"replace":    strings.ReplaceAll,
		"contains":   strings.Contains,
		"hasPrefix":  strings.HasPrefix,
		"hasSuffix":  strings.HasSuffix,
		"quote": func(s string) string {
			return fmt.Sprintf("%q", s)
		},
		"default": func(def, val any) any {
			if val == nil || val == "" {
				return def
			}
			return val
		},
	}

	t, err := template.New(tmpl.Name).Option("missingkey=error").Funcs(safeFuncMap).Parse(tmpl.Body)
	if err != nil {
		return nil, fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, merged); err != nil {
		return nil, fmt.Errorf("execute template: %w", err)
	}

	yaml := buf.String()

	// Extract resource kinds from the rendered YAML.
	var resources []string
	for _, line := range strings.Split(yaml, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "kind:") {
			kind := strings.TrimSpace(strings.TrimPrefix(trimmed, "kind:"))
			resources = append(resources, kind)
		}
	}

	return &RenderResult{
		YAML:      yaml,
		Resources: resources,
	}, nil
}
