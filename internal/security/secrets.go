package security

// MaskSecretData replaces secret values with fixed-length masked placeholders.
func MaskSecretData(data map[string][]byte) map[string]string {
	masked := make(map[string]string, len(data))
	for k := range data {
		masked[k] = "******"
	}
	return masked
}

// RevealSecretValue returns the raw decoded value for a specific key.
func RevealSecretValue(data map[string][]byte, key string) (string, bool) {
	v, ok := data[key]
	if !ok {
		return "", false
	}
	return string(v), true
}
