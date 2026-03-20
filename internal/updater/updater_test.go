package updater

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
)

func TestParseSemver(t *testing.T) {
	tests := []struct {
		input string
		want  [3]int
	}{
		{"1.2.3", [3]int{1, 2, 3}},
		{"0.1.0", [3]int{0, 1, 0}},
		{"2.0.0-beta", [3]int{2, 0, 0}},
		{"1.0", [3]int{1, 0, 0}},
	}
	for _, tt := range tests {
		got := parseSemver(tt.input)
		if got != tt.want {
			t.Errorf("parseSemver(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestIsNewer(t *testing.T) {
	tests := []struct {
		latest, current string
		want            bool
	}{
		{"1.1.0", "1.0.0", true},
		{"1.0.1", "1.0.0", true},
		{"2.0.0", "1.9.9", true},
		{"1.0.0", "1.0.0", false},
		{"0.9.0", "1.0.0", false},
	}
	for _, tt := range tests {
		got := isNewer(tt.latest, tt.current)
		if got != tt.want {
			t.Errorf("isNewer(%q, %q) = %v, want %v", tt.latest, tt.current, got, tt.want)
		}
	}
}

func TestPlatformAssetName(t *testing.T) {
	name := PlatformAssetName()
	if name == "" {
		t.Skip("unsupported platform")
	}
	// Just verify it returns a non-empty string on known platforms
	t.Logf("platform asset: %s", name)
}

func TestPlatformAssetName_AllPlatforms(t *testing.T) {
	tests := []struct {
		goos   string
		goarch string
		want   string
	}{
		{"darwin", "arm64", "clusterfudge_darwin_arm64.dmg"},
		{"darwin", "amd64", "clusterfudge_darwin_amd64.dmg"},
		{"linux", "amd64", "clusterfudge_linux_amd64.tar.gz"},
		{"linux", "arm64", "clusterfudge_linux_arm64.tar.gz"},
		{"windows", "amd64", ""},
		{"freebsd", "amd64", ""},
	}
	for _, tt := range tests {
		t.Run(tt.goos+"/"+tt.goarch, func(t *testing.T) {
			got := platformAssetName(tt.goos, tt.goarch)
			if got != tt.want {
				t.Errorf("platformAssetName(%q, %q) = %q, want %q", tt.goos, tt.goarch, got, tt.want)
			}
		})
	}
}

func TestCheckForUpdate_AssetMatching(t *testing.T) {
	// Verify that PlatformAssetName() for the current platform matches
	// one of the asset names used in actual GitHub releases.
	assetName := PlatformAssetName()
	if assetName == "" {
		t.Skip("unsupported platform for this test")
	}

	releaseAssets := []string{
		"clusterfudge_darwin_arm64.dmg",
		"clusterfudge_darwin_amd64.dmg",
		"clusterfudge_linux_amd64.tar.gz",
		"clusterfudge_linux_arm64.tar.gz",
	}
	if !slices.Contains(releaseAssets, assetName) {
		t.Errorf("PlatformAssetName() = %q does not match any release asset", assetName)
	}
}

func TestDownloadUpdate_ChecksumMatch(t *testing.T) {
	content := []byte("fake binary content for testing")
	h := sha256.Sum256(content)
	checksum := hex.EncodeToString(h[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/binary",
		Size:     int64(len(content)),
		Checksum: checksum,
	}

	path, err := u.DownloadUpdate(context.Background(), info, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	defer func() {
		if path != "" {
			_ = removeIfExists(path)
		}
	}()
	if path == "" {
		t.Fatal("expected non-empty path")
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read downloaded file: %v", err)
	}
	if !bytes.Equal(got, content) {
		t.Fatal("downloaded file content does not match expected")
	}
}

func TestDownloadUpdate_ChecksumMismatch(t *testing.T) {
	content := []byte("fake binary content for testing")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/binary",
		Size:     int64(len(content)),
		Checksum: "0000000000000000000000000000000000000000000000000000000000000000",
	}

	path, err := u.DownloadUpdate(context.Background(), info, nil)
	if err == nil {
		defer func() { _ = removeIfExists(path) }()
		t.Fatal("expected checksum mismatch error, got nil")
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("expected checksum mismatch error, got: %v", err)
	}
	if path != "" {
		t.Errorf("expected empty path on mismatch, got %q", path)
	}
}

func TestDownloadUpdate_EmptyChecksum(t *testing.T) {
	content := []byte("fake binary content for testing")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/binary",
		Size:     int64(len(content)),
		Checksum: "",
	}

	path, err := u.DownloadUpdate(context.Background(), info, nil)
	if err != nil {
		t.Fatalf("expected no error with empty checksum, got %v", err)
	}
	defer func() {
		if path != "" {
			_ = removeIfExists(path)
		}
	}()
	if path == "" {
		t.Fatal("expected non-empty path")
	}
}

func TestParseChecksumFile(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		filename string
		want     string
	}{
		{
			name:     "checksums.txt format",
			content:  "abc123  other-file.tar.gz\ndef456  myapp.dmg\n",
			filename: "myapp.dmg",
			want:     "def456",
		},
		{
			name:     "single hash sha256 file",
			content:  "abc123\n",
			filename: "myapp.dmg",
			want:     "abc123",
		},
		{
			name:     "BSD-style star prefix",
			content:  "abc123  *myapp.dmg\n",
			filename: "myapp.dmg",
			want:     "abc123",
		},
		{
			name:     "not found",
			content:  "abc123  other-file.tar.gz\n",
			filename: "myapp.dmg",
			want:     "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseChecksumFile(strings.NewReader(tt.content), tt.filename)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("parseChecksumFile() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFindChecksum(t *testing.T) {
	assetName := "myapp.dmg"
	expectedHash := "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
	checksumContent := fmt.Sprintf("%s  %s\n", expectedHash, assetName)

	tests := []struct {
		name       string
		assets     []ghAsset
		wantHash   string
	}{
		{
			name: "checksums.txt present",
			assets: []ghAsset{
				{Name: assetName, BrowserDownloadURL: "http://example.com/myapp.dmg"},
				{Name: "checksums.txt", BrowserDownloadURL: "CHECKSUMS_URL"},
			},
			wantHash: expectedHash,
		},
		{
			name: "per-asset sha256 file",
			assets: []ghAsset{
				{Name: assetName, BrowserDownloadURL: "http://example.com/myapp.dmg"},
				{Name: assetName + ".sha256", BrowserDownloadURL: "CHECKSUMS_URL"},
			},
			wantHash: expectedHash,
		},
		{
			name: "no checksum assets",
			assets: []ghAsset{
				{Name: assetName, BrowserDownloadURL: "http://example.com/myapp.dmg"},
			},
			wantHash: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(checksumContent))
			}))
			defer srv.Close()

			// Replace placeholder URLs with test server URL
			assets := make([]ghAsset, len(tt.assets))
			copy(assets, tt.assets)
			for i := range assets {
				if assets[i].BrowserDownloadURL == "CHECKSUMS_URL" {
					assets[i].BrowserDownloadURL = srv.URL + "/checksums"
				}
			}

			u := NewUpdater("test", "test", "0.0.1")
			got := u.findChecksum(context.Background(), assets, assetName)
			if got != tt.wantHash {
				t.Errorf("findChecksum() = %q, want %q", got, tt.wantHash)
			}
		})
	}
}

func TestFindChecksum_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	assets := []ghAsset{
		{Name: "myapp.dmg", BrowserDownloadURL: "http://example.com/myapp.dmg"},
		{Name: "checksums.txt", BrowserDownloadURL: srv.URL + "/checksums"},
	}

	u := NewUpdater("test", "test", "0.0.1")
	got := u.findChecksum(context.Background(), assets, "myapp.dmg")
	if got != "" {
		t.Errorf("expected empty checksum on HTTP error, got %q", got)
	}
}

func TestDownloadUpdate_UppercaseChecksum(t *testing.T) {
	content := []byte("test content for uppercase checksum")
	h := sha256.Sum256(content)
	checksum := strings.ToUpper(hex.EncodeToString(h[:]))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/binary",
		Size:     int64(len(content)),
		Checksum: checksum,
	}

	path, err := u.DownloadUpdate(context.Background(), info, nil)
	if err != nil {
		t.Fatalf("expected no error with uppercase checksum, got %v", err)
	}
	defer func() {
		if path != "" {
			_ = removeIfExists(path)
		}
	}()
}

func TestDownloadUpdate_InvalidChecksumFormat(t *testing.T) {
	content := []byte("test content")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/binary",
		Size:     int64(len(content)),
		Checksum: "tooshort",
	}

	_, err := u.DownloadUpdate(context.Background(), info, nil)
	if err == nil {
		t.Fatal("expected error for invalid checksum format")
	}
	if !strings.Contains(err.Error(), "invalid checksum format") {
		t.Fatalf("expected invalid checksum format error, got: %v", err)
	}
}

func TestDownloadUpdate_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	u := NewUpdater("test", "test", "0.0.1")
	info := &UpdateInfo{
		AssetURL: srv.URL + "/missing",
		Size:     100,
	}

	_, err := u.DownloadUpdate(context.Background(), info, nil)
	if err == nil {
		t.Fatal("expected error for HTTP 404")
	}
	if !strings.Contains(err.Error(), "HTTP 404") {
		t.Fatalf("expected HTTP 404 error, got: %v", err)
	}
}

func removeIfExists(path string) error {
	return os.Remove(path)
}
