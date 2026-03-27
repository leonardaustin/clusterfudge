package backup

// ExportOptions controls which resources to export.
type ExportOptions struct {
	Namespace   string   `json:"namespace"`
	Kinds       []string `json:"kinds"`
	Labels      string   `json:"labels"`
	StripStatus bool     `json:"stripStatus"`
	StripMeta   bool     `json:"stripMeta"`
}

// ExportResult contains the exported resources.
type ExportResult struct {
	YAML          string   `json:"yaml"`
	ResourceCount int      `json:"resourceCount"`
	Kinds         []string `json:"kinds"`
}

// ImportOptions controls how resources are imported.
type ImportOptions struct {
	YAML            string `json:"yaml"`
	TargetNamespace string `json:"targetNamespace,omitempty"`
	DryRun          bool   `json:"dryRun"`
}

// ImportResult contains the results of an import operation.
type ImportResult struct {
	Created []string `json:"created"`
	Updated []string `json:"updated"`
	Skipped []string `json:"skipped"`
	Errors  []string `json:"errors"`
}
