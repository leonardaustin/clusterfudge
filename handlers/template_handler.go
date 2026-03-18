package handlers

import (
	"fmt"

	"clusterfudge/internal/templates"
)

// TemplateHandler exposes template operations to the frontend.
type TemplateHandler struct {
	engine *templates.Engine
}

// NewTemplateHandler creates a TemplateHandler with built-in templates loaded.
func NewTemplateHandler() *TemplateHandler {
	return &TemplateHandler{
		engine: templates.NewEngine(),
	}
}

// ListTemplates returns all available templates.
func (h *TemplateHandler) ListTemplates() []templates.Template {
	return h.engine.ListTemplates()
}

// RenderTemplate renders a template by name with the given variable values.
func (h *TemplateHandler) RenderTemplate(name string, values map[string]any) (*templates.RenderResult, error) {
	tmpl, ok := h.engine.GetTemplate(name)
	if !ok {
		return nil, fmt.Errorf("template %q not found", name)
	}
	return h.engine.Render(tmpl, values)
}

// SaveTemplate persists a user-defined template.
func (h *TemplateHandler) SaveTemplate(tmpl templates.Template) error {
	return h.engine.SaveTemplate(tmpl)
}

// DeleteTemplate removes a user-defined template by name.
func (h *TemplateHandler) DeleteTemplate(name string) error {
	return h.engine.DeleteTemplate(name)
}
