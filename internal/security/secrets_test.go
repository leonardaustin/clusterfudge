package security

import (
	"testing"
)

func TestMaskSecretData(t *testing.T) {
	data := map[string][]byte{
		"password": []byte("s3cr3t"),
		"token":    []byte("abc123xyz"),
	}
	masked := MaskSecretData(data)

	for k, v := range masked {
		if v != "******" {
			t.Errorf("expected fixed mask for %q, got %q", k, v)
		}
	}

}

func TestRevealSecretValue(t *testing.T) {
	data := map[string][]byte{
		"password": []byte("s3cr3t"),
	}

	val, ok := RevealSecretValue(data, "password")
	if !ok || val != "s3cr3t" {
		t.Fatalf("expected s3cr3t, got %q (ok=%v)", val, ok)
	}

	_, ok = RevealSecretValue(data, "missing")
	if ok {
		t.Fatal("expected !ok for missing key")
	}
}
